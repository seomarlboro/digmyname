-- Keep-warm cron: prevents cold isolate starts on the public-api edge function.
-- Hits the ultra-light /ping route (no network, no DB, no paid upstreams) every minute.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'public-api-keepwarm',
  '* * * * *',
  $$
  select net.http_get(
    -- project ref redacted for public repo; the live cron job is already configured in the database
    url := 'https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/public-api/ping',
    timeout_milliseconds := 3000
  );
  $$
);