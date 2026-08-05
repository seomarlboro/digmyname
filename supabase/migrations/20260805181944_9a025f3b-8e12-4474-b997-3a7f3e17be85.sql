-- Keep-warm cron: prevents cold isolate starts on the public-api edge function.
-- Hits the ultra-light /ping route (no network, no DB, no paid upstreams) every minute.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'public-api-keepwarm',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api/ping',
    timeout_milliseconds := 3000
  );
  $$
);