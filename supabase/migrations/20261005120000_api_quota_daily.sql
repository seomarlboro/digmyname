-- Per-caller daily quota for the public API (docs/DIGMYNAME_ARCHITECTURE.md §15,
-- supabase/functions/_shared/api-quota.ts).
--
-- Why this table exists: on 2026-10-04 a script walked the free, keyless API and
-- put 84,425 fresh names into `domain_cache` in one day (21,347 of them
-- four-letter `.ca` labels — a plain enumeration), then 42,527 more before
-- 08:00 the next morning. For scale, 2026-10-03 produced one row. That burned
-- the Cloudflare account's free Workers allowance (100,000 requests/day) in
-- front of `api.digmyname.com`, so the API and its edge cache started failing
-- for everyone.
--
-- The per-isolate limiter cannot see this: Supabase almost never reuses an
-- isolate (measured 0–6 % warm), so a 60-requests/minute counter in process
-- memory is a counter of one. This table is the shared, cross-isolate memory
-- that the limiter was missing.
--
-- Shape rule, same as `fastly_spend_daily` and `cron_heartbeats`: counts only.
-- No domain, no query, no raw IP. The caller is a salted SHA-256 prefix whose
-- input includes the UTC day, so the identifier rotates every midnight and
-- cannot be linked across days or back to an address.
--
-- Access: service_role only. Call volume is business data and no visitor-facing
-- feature reads it.
--
-- Idempotent: a re-run (Lovable replaying migrations) is harmless.

CREATE TABLE IF NOT EXISTS public.api_quota_daily (
  day DATE NOT NULL,
  -- sha256(day + salt + ip), first 16 hex chars. Rotates daily by construction.
  caller TEXT NOT NULL,
  -- Domains asked for: the real cost driver (each one can mean an RDAP call, a
  -- DoH query, a WHOIS connection and a `domain_cache` row).
  domains INTEGER NOT NULL DEFAULT 0,
  -- HTTP requests, for context when reading a row.
  requests INTEGER NOT NULL DEFAULT 0,
  -- Domains refused after the cap was reached. > 0 means a caller is being
  -- served 429s for the rest of the UTC day.
  blocked INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, caller)
);

ALTER TABLE public.api_quota_daily ENABLE ROW LEVEL SECURITY;

-- Supabase hands new public tables to anon/authenticated by default; take it back.
REVOKE ALL ON public.api_quota_daily FROM anon, authenticated;
GRANT ALL ON public.api_quota_daily TO service_role;

-- One atomic add per request, returning the caller's new running total for
-- today. Atomic because two isolates serving the same scraper must not lose a
-- count — that is exactly how the old limiter failed.
CREATE OR REPLACE FUNCTION public.api_quota_add(
  p_caller TEXT,
  n_domains INTEGER DEFAULT 1,
  n_requests INTEGER DEFAULT 1,
  n_blocked INTEGER DEFAULT 0
)
RETURNS TABLE (domains INTEGER, requests INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.api_quota_daily AS q (day, caller, domains, requests, blocked, updated_at)
  VALUES ((now() AT TIME ZONE 'utc')::date, p_caller, n_domains, n_requests, n_blocked, now())
  ON CONFLICT (day, caller) DO UPDATE SET
    domains = q.domains + EXCLUDED.domains,
    requests = q.requests + EXCLUDED.requests,
    blocked = q.blocked + EXCLUDED.blocked,
    updated_at = now()
  RETURNING q.domains, q.requests;
END;
$$;

REVOKE ALL ON FUNCTION public.api_quota_add(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_quota_add(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- Retention: a day older than 30 days answers no question worth the rows.
-- Runs next to the other nightly cleanups (§13) and writes the same heartbeat.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('api-quota-retention')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'api-quota-retention');
    PERFORM cron.schedule(
      'api-quota-retention',
      '37 3 * * *',
      $cron$
      WITH deleted AS (
        DELETE FROM public.api_quota_daily
        WHERE day < ((now() AT TIME ZONE 'utc')::date - 30)
        RETURNING 1
      )
      INSERT INTO public.cron_heartbeats (job_name, last_run_at, rows_affected)
      SELECT 'api-quota-retention', now(), count(*) FROM deleted
      ON CONFLICT (job_name) DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        rows_affected = EXCLUDED.rows_affected;
      $cron$
    );
  END IF;
END;
$$;
