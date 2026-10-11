-- edge-cache-prewarm says who it is (docs/DIGMYNAME_ARCHITECTURE.md §15,
-- supabase/functions/_shared/trusted-caller.ts).
--
-- The job asks the edge for 25 popular names every 5 minutes: 7,200 requests a
-- day, more than the public API's 5,000-domains-per-day allowance for one
-- caller. Until 2026-10-11 the edge reported every visitor as the same caller,
-- so this job and every real user drew on one allowance and the API answered
-- `429 daily_quota` to all of them from mid-morning UTC until midnight, every
-- day since the quota shipped. With callers now told apart, the job would still
-- exhaust its own allowance at about 16:40 UTC and spend the rest of the day
-- being refused — a cache warmer that warms nothing for seven hours.
--
-- So the job presents a key. The origin counts its requests in their own row
-- (`api_quota_daily.caller = 'internal'`) and does not cap them. The key is read
-- from the vault when the job runs; it is not in this file and not in the
-- repository — the code holds only its SHA-256 (`INTERNAL_KEY_SHA256`).
--
-- The vault secret `edge_internal_key` is created out of band. If it is missing
-- the job still runs, without the header, and is counted like any other caller:
-- a missing secret must not stop the warmer. To rotate: replace the secret and
-- set `INTERNAL_KEY_SHA256` in the edge environment to the new digest.
--
-- Everything else about the job is unchanged: same schedule, same 25 names
-- (all registered, 6+ characters where it matters — §14), same URL, still
-- through the edge and NOT the direct origin, which is the keep-warm job's.
--
-- Idempotent: a re-run reschedules the same job.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'edge-cache-prewarm';
END
$$;

SELECT cron.schedule(
  'edge-cache-prewarm',
  '*/5 * * * *',
  $$
  select net.http_get(
           url := 'https://api.digmyname.com/functions/v1/public-api/check?domain=' || d,
           headers := coalesce(
             (select jsonb_build_object('x-dmn-internal-key', decrypted_secret)
                from vault.decrypted_secrets
               where name = 'edge_internal_key'),
             '{}'::jsonb
           ),
           timeout_milliseconds := 5000
         )
  from unnest(array[
    'google.com','facebook.com','example.com','test.com','app.com',
    'ai.com','startup.io','my.app','get.io','hello.ai',
    'acme.com','acme.io','demo.com','launch.app','build.dev',
    'cloud.io','data.ai','api.dev','online.store','home.co',
    'best.app','startup.tech','go.dev','one.ai','top.io'
  ]) as d;
  $$
);
