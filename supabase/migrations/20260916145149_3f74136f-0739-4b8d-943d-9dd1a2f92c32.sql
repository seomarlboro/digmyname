-- Monitoring step 6 (docs/DIGMYNAME_ARCHITECTURE.md §13): a tiny heartbeat table
-- so an outside health check can confirm the nightly cleanup jobs actually ran,
-- without reading domain_cache or site_events content (no domain names, no
-- session/event data — job name + timestamp + a row count only). Idempotent.
--
-- Does NOT touch the unrelated keep-warm / edge-cache-prewarm jobs.

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL,
  rows_affected INTEGER
);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read cron heartbeats" ON public.cron_heartbeats;
CREATE POLICY "Anyone can read cron heartbeats"
  ON public.cron_heartbeats
  FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy for anon/authenticated: pg_cron runs jobs as
-- the scheduling role, which bypasses RLS, so only the two jobs below (and a
-- superuser) can write here.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('domain-cache-purge-expired', 'site-events-retention');
END
$$;

-- Same DELETE as before (20260805181944), now also recording that it ran.
-- GET DIAGNOSTICS reads the DELETE's row count from the command tag instead of
-- a RETURNING-based count, so a 200k-row purge is not made more expensive.
SELECT cron.schedule(
  'domain-cache-purge-expired',
  '17 3 * * *',
  $$
  DO $BODY$
  DECLARE
    affected INT;
  BEGIN
    DELETE FROM public.domain_cache WHERE expires_at < now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    INSERT INTO public.cron_heartbeats (job_name, last_run_at, rows_affected)
    VALUES ('domain-cache-purge-expired', now(), affected)
    ON CONFLICT (job_name) DO UPDATE SET last_run_at = excluded.last_run_at, rows_affected = excluded.rows_affected;
  END
  $BODY$;
  $$
);

SELECT cron.schedule(
  'site-events-retention',
  '27 3 * * *',
  $$
  DO $BODY$
  DECLARE
    affected INT;
  BEGIN
    DELETE FROM public.site_events WHERE created_at < now() - interval '13 months';
    GET DIAGNOSTICS affected = ROW_COUNT;
    INSERT INTO public.cron_heartbeats (job_name, last_run_at, rows_affected)
    VALUES ('site-events-retention', now(), affected)
    ON CONFLICT (job_name) DO UPDATE SET last_run_at = excluded.last_run_at, rows_affected = excluded.rows_affected;
  END
  $BODY$;
  $$
);