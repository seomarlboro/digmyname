-- Private first-party product analytics (docs/DIGMYNAME_ARCHITECTURE.md §12).
--
-- Rule: search queries and domain names are NEVER logged. No column can hold
-- one: `tld` has no dot, `target` and `marketplace` are fixed lists.
-- No IP, no user agent, no referrer, no user id. `session_id` is a random UUID
-- kept in the visitor's sessionStorage (one tab).
--
-- Access: the public roles may INSERT the listed columns and nothing else — no
-- SELECT, UPDATE or DELETE. Reports live in the `analytics` schema, which the
-- API does not expose and the public roles cannot use.
--
-- Idempotent so a re-run (Lovable replaying migrations) is harmless.

CREATE TABLE IF NOT EXISTS public.site_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id UUID NOT NULL,
  event TEXT NOT NULL CHECK (event IN (
    'search_started', 'first_answer', 'buy_click', 'aftermarket_click', 'whois_click',
    'visit_click', 'favorite_add', 'api_copy', 'mcp_copy', 'pricing_tld_view'
  )),
  page TEXT NOT NULL CHECK (page IN ('search', 'pricing', 'api', 'mcp', 'favorites', 'other')),
  device TEXT NOT NULL CHECK (device IN ('mobile', 'desktop')),
  env TEXT NOT NULL CHECK (env IN ('prod', 'dev', 'preview')),
  query_length SMALLINT CHECK (query_length BETWEEN 1 AND 253),
  tld_typed BOOLEAN,
  tld_count SMALLINT CHECK (tld_count BETWEEN 1 AND 500),
  ms INTEGER CHECK (ms BETWEEN 0 AND 120000),
  lane TEXT CHECK (lane IN ('browser', 'fast', 'edge')),
  registrar TEXT CHECK (registrar IN ('Namecheap', 'Cloudflare', 'Porkbun', 'GoDaddy', 'Spaceship', 'OVHcloud')),
  tld TEXT CHECK (tld ~ '^[a-z0-9-]{2,24}$'),
  position SMALLINT CHECK (position BETWEEN 1 AND 500),
  cheapest BOOLEAN,
  offer TEXT CHECK (offer IN ('available', 'premium', 'check_price')),
  marketplace TEXT CHECK (marketplace IN ('sedo', 'dan', 'afternic', 'aftermarket', 'other')),
  target TEXT CHECK (target IN ('curl', 'javascript', 'python', 'response', 'claude_code', 'claude_desktop_config_json', 'other')),
  signed_in BOOLEAN,
  layout TEXT CHECK (layout IN ('cards', 'compact'))
);

CREATE INDEX IF NOT EXISTS idx_site_events_created_at ON public.site_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_event_created_at ON public.site_events (event, created_at DESC);

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges hand new public tables to anon/authenticated; take them back.
REVOKE ALL ON public.site_events FROM anon, authenticated;
GRANT INSERT (
  session_id, event, page, device, env, query_length, tld_typed, tld_count, ms, lane,
  registrar, tld, position, cheapest, offer, marketplace, target, signed_in, layout
) ON public.site_events TO anon, authenticated;
GRANT ALL ON public.site_events TO service_role;

DROP POLICY IF EXISTS "Anyone can insert site events" ON public.site_events;
-- Row shape is enforced by the CHECK constraints above; the policy only opens INSERT.
CREATE POLICY "Anyone can insert site events"
ON public.site_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Reports. Owner-only: query them from the SQL editor.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS analytics;
REVOKE ALL ON SCHEMA analytics FROM PUBLIC, anon, authenticated;

-- Production rows only (local dev and Lovable previews write env = 'dev' / 'preview').
CREATE OR REPLACE VIEW analytics.site_events_prod AS
SELECT *, (created_at AT TIME ZONE 'UTC')::date AS day
FROM public.site_events
WHERE env = 'prod';

-- Funnel by UTC day, counted in sessions (a session = one browser tab).
-- Not strictly ordered: a session counts at a step if it has that event that day.
CREATE OR REPLACE VIEW analytics.funnel_daily AS
SELECT
  day,
  count(*) FILTER (WHERE event = 'search_started') AS searches,
  count(DISTINCT session_id) FILTER (WHERE event = 'search_started') AS search_sessions,
  count(DISTINCT session_id) FILTER (WHERE event = 'first_answer') AS answered_sessions,
  count(DISTINCT session_id) FILTER (WHERE event = 'buy_click') AS buy_click_sessions,
  count(DISTINCT session_id) FILTER (WHERE event = 'aftermarket_click') AS aftermarket_click_sessions,
  count(DISTINCT session_id) FILTER (WHERE event = 'favorite_add') AS favorite_sessions,
  count(*) FILTER (WHERE event = 'buy_click') AS buy_clicks,
  round(100.0 * count(DISTINCT session_id) FILTER (WHERE event = 'buy_click')
    / nullif(count(DISTINCT session_id) FILTER (WHERE event = 'search_started'), 0), 2) AS search_to_buy_pct,
  -- The on-page stopwatch of real visitors. NOT a benchmark: never quote it publicly.
  percentile_disc(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE event = 'first_answer') AS first_answer_p50_ms,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY ms) FILTER (WHERE event = 'first_answer') AS first_answer_p95_ms
FROM analytics.site_events_prod
GROUP BY day;

-- Buy clicks per registrar and TLD. There is no card-impression event, so the
-- rate is clicks per 100 search sessions that day, not a per-impression CTR.
CREATE OR REPLACE VIEW analytics.buy_clicks_by_registrar_tld AS
WITH searches AS (
  SELECT day, count(DISTINCT session_id) AS search_sessions
  FROM analytics.site_events_prod
  WHERE event = 'search_started'
  GROUP BY day
)
SELECT
  b.day,
  b.registrar,
  b.tld,
  count(*) AS buy_clicks,
  count(*) FILTER (WHERE b.offer = 'available') AS standard_price_clicks,
  count(*) FILTER (WHERE b.offer = 'premium') AS premium_clicks,
  count(*) FILTER (WHERE b.offer = 'check_price') AS check_price_clicks,
  s.search_sessions,
  round(100.0 * count(*) / nullif(s.search_sessions, 0), 2) AS clicks_per_100_search_sessions
FROM analytics.site_events_prod b
LEFT JOIN searches s USING (day)
WHERE b.event = 'buy_click'
GROUP BY b.day, b.registrar, b.tld, s.search_sessions;

-- Share of buy clicks on the card with the lowest first-year price on screen.
-- `cheapest` is null when the clicked card showed no price, so those are left out.
CREATE OR REPLACE VIEW analytics.cheapest_click_share AS
SELECT
  day,
  count(*) AS buy_clicks,
  count(*) FILTER (WHERE cheapest IS NOT NULL) AS priced_buy_clicks,
  count(*) FILTER (WHERE cheapest) AS cheapest_clicks,
  round(100.0 * count(*) FILTER (WHERE cheapest) / nullif(count(*) FILTER (WHERE cheapest IS NOT NULL), 0), 2) AS cheapest_share_pct
FROM analytics.site_events_prod
WHERE event = 'buy_click'
GROUP BY day;

-- Mobile vs desktop (window narrower than 768 px = mobile).
CREATE OR REPLACE VIEW analytics.device_daily AS
SELECT
  day,
  device,
  count(DISTINCT session_id) AS sessions,
  count(*) FILTER (WHERE event = 'search_started') AS searches,
  count(DISTINCT session_id) FILTER (WHERE event = 'search_started') AS search_sessions,
  count(*) FILTER (WHERE event = 'buy_click') AS buy_clicks,
  count(DISTINCT session_id) FILTER (WHERE event = 'buy_click') AS buy_click_sessions,
  round(100.0 * count(DISTINCT session_id) FILTER (WHERE event = 'buy_click')
    / nullif(count(DISTINCT session_id) FILTER (WHERE event = 'search_started'), 0), 2) AS search_to_buy_pct,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY ms) FILTER (WHERE event = 'first_answer') AS first_answer_p95_ms
FROM analytics.site_events_prod
GROUP BY day, device;

REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM PUBLIC, anon, authenticated;
