-- Edge cache prewarm job.
-- Every 5 minutes we request ~25 popular/high-traffic domains THROUGH the
-- Cloudflare edge (api.digmyname.com) so their /check responses are populated
-- in the 60s edge cache and users get instant HITs for common lookups.
-- This is intentionally separate from the `public-api-keepwarm` job, which
-- pings the DIRECT Supabase URL to avoid cold isolates (do not merge them).
-- Cost: ~25 requests every 5 min = ~7,200 Worker requests/day, well within
-- Cloudflare's 100k/day free tier.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
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
    'cloud.io','data.ai','api.dev','shop.store','home.co',
    'best.app','new.tech','go.dev','one.ai','top.io'
  ]) as d;
  $$
);