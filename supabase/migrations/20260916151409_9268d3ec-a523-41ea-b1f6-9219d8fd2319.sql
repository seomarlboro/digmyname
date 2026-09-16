-- lovable-cron-fallback-reviewed: 288 runs/day; reschedules the already-running edge-cache-prewarm job at its existing every-5-minutes cadence (same schedule, same URL) — the change only swaps two of the 25 warmed names so the job stops triggering paid lookups. Required timing preserved; cadence not lowered.
-- edge-cache-prewarm must never spend money (docs/DIGMYNAME_ARCHITECTURE.md §14).
--
-- The job requests ~25 popular names through the edge every 5 minutes. 23 of
-- them are registered, so they resolve from DNS/RDAP for free. Two were not:
--
--   shop.store  (4-char SLD)  available → premium suspect → paid third signal
--   new.tech    (3-char SLD)  available → premium suspect → paid third signal
--
-- Measured 2026-09-16: both sat in `domain_cache` as `checked_via = 'porkbun'`,
-- i.e. each one had been escalated and priced. Their cache rows expire every
-- 24 h, so each cost one paid call per day — small ($0.002/day) but it is the
-- product buying its own warm cache, which is exactly the class of spend this
-- list must not create.
--
-- Replacements are registered (RDAP 200, verified 2026-09-16) and 6+ characters,
-- so they cannot become premium suspects even if they ever lapse.
--
-- Everything else about the job is unchanged: same schedule, same URL, still
-- through the Cloudflare edge (NOT the direct origin — that is the keep-warm
-- job's business and the two must stay separate).

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