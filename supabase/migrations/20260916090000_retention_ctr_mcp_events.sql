-- Retention jobs, CTR impressions and /mcp tracking on site_events
-- (docs/DIGMYNAME_ARCHITECTURE.md §3 and §12). Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Retention, as pg_cron jobs inside the database.
--    pg_cron is already how this project schedules DB work (public-api-keepwarm,
--    edge-cache-prewarm, weekly-price-refresh). Plain SQL deletes need no HTTP
--    call, no edge function and no secret.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('domain-cache-purge-expired', 'site-events-retention');
END
$$;

-- Answer cache: delete rows whose answer has expired. The pipeline only reads
-- rows with expires_at > now(), so this changes no cache behaviour and no TTL;
-- it stops checked names from piling up (207k expired rows on 2026-09-15).
SELECT cron.schedule(
  'domain-cache-purge-expired',
  '17 3 * * *',
  $$DELETE FROM public.domain_cache WHERE expires_at < now()$$
);

-- Usage events: 13 months.
SELECT cron.schedule(
  'site-events-retention',
  '27 3 * * *',
  $$DELETE FROM public.site_events WHERE created_at < now() - interval '13 months'$$
);

-- ---------------------------------------------------------------------------
-- 2. site_events: impressions (results_shown) and the /mcp page events.
--    Still no column that can hold a name, a query or a URL:
--    `source` is a category from a fixed list, never the referrer itself.
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_events
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS shown_tlds TEXT[],
  ADD COLUMN IF NOT EXISTS shown_registrars TEXT[];

ALTER TABLE public.site_events DROP CONSTRAINT IF EXISTS site_events_event_check;
ALTER TABLE public.site_events ADD CONSTRAINT site_events_event_check CHECK (event IN (
  'search_started', 'first_answer', 'buy_click', 'aftermarket_click', 'whois_click',
  'visit_click', 'favorite_add', 'api_copy', 'mcp_copy', 'pricing_tld_view',
  'results_shown', 'mcp_page_view', 'mcp_click', 'waitlist_signup'
));

ALTER TABLE public.site_events DROP CONSTRAINT IF EXISTS site_events_target_check;
ALTER TABLE public.site_events ADD CONSTRAINT site_events_target_check CHECK (target IN (
  'curl', 'javascript', 'python', 'response', 'claude_code', 'claude_desktop_config_json',
  'npm_pill', 'github_hero', 'try_live_search', 'format_mcp_server', 'format_claude_skill',
  'format_custom_gpt', 'github_footer', 'other'
));

ALTER TABLE public.site_events DROP CONSTRAINT IF EXISTS site_events_source_check;
ALTER TABLE public.site_events ADD CONSTRAINT site_events_source_check CHECK (source IN (
  'glama', 'npm', 'github', 'mcp_registry', 'pulsemcp', 'mcpservers', 'smithery', 'cursor_directory',
  'google', 'bing', 'duckduckgo', 'chatgpt', 'claude', 'perplexity', 'reddit', 'x', 'hackernews',
  'digmyname', 'direct', 'other'
));

-- Aligned lists: shown_tlds[i] is the extension of a card in the Available
-- section, shown_registrars[i] the registrar its Buy button goes to.
ALTER TABLE public.site_events DROP CONSTRAINT IF EXISTS site_events_shown_check;
ALTER TABLE public.site_events ADD CONSTRAINT site_events_shown_check CHECK (
  (shown_tlds IS NULL AND shown_registrars IS NULL)
  OR (
    cardinality(shown_tlds) = cardinality(shown_registrars)
    AND cardinality(shown_tlds) <= 400
    AND array_position(shown_tlds, NULL) IS NULL
    AND array_position(shown_registrars, NULL) IS NULL
    AND (cardinality(shown_tlds) = 0 OR array_to_string(shown_tlds, ',') ~ '^[a-z0-9-]{2,24}(,[a-z0-9-]{2,24})*$')
    AND shown_registrars <@ ARRAY['Namecheap', 'Cloudflare', 'Porkbun', 'GoDaddy', 'Spaceship', 'OVHcloud']::text[]
  )
);

GRANT INSERT (source, shown_tlds, shown_registrars) ON public.site_events TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reports. Rebuilt because site_events_prod is `SELECT *` (new columns) and
--    buy_clicks_by_registrar_tld is replaced by impression-based CTR.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS analytics.site_events_prod CASCADE;

CREATE VIEW analytics.site_events_prod AS
SELECT *, (created_at AT TIME ZONE 'UTC')::date AS day
FROM public.site_events
WHERE env = 'prod';

-- Funnel by UTC day, counted in sessions (a session = one browser tab).
-- Not strictly ordered: a session counts at a step if it has that event that day.
CREATE VIEW analytics.funnel_daily AS
SELECT
  day,
  count(*) FILTER (WHERE event = 'search_started') AS searches,
  count(*) FILTER (WHERE event = 'results_shown') AS settled_searches,
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

-- CTR = buy clicks / impressions, per UTC day, registrar and TLD. An impression
-- is one Buy button in the Available section of a settled search (results_shown).
CREATE VIEW analytics.buy_ctr_by_registrar_tld AS
WITH impressions AS (
  SELECT e.day, s.registrar, s.tld, count(*) AS impressions
  FROM analytics.site_events_prod e
  CROSS JOIN LATERAL unnest(e.shown_registrars, e.shown_tlds) AS s(registrar, tld)
  WHERE e.event = 'results_shown'
  GROUP BY e.day, s.registrar, s.tld
),
clicks AS (
  SELECT
    day, registrar, tld,
    count(*) AS buy_clicks,
    count(*) FILTER (WHERE offer = 'available') AS standard_price_clicks,
    count(*) FILTER (WHERE offer = 'premium') AS premium_clicks,
    count(*) FILTER (WHERE offer = 'check_price') AS check_price_clicks
  FROM analytics.site_events_prod
  WHERE event = 'buy_click'
  GROUP BY day, registrar, tld
)
SELECT
  coalesce(i.day, c.day) AS day,
  coalesce(i.registrar, c.registrar) AS registrar,
  coalesce(i.tld, c.tld) AS tld,
  coalesce(i.impressions, 0) AS impressions,
  coalesce(c.buy_clicks, 0) AS buy_clicks,
  coalesce(c.standard_price_clicks, 0) AS standard_price_clicks,
  coalesce(c.premium_clicks, 0) AS premium_clicks,
  coalesce(c.check_price_clicks, 0) AS check_price_clicks,
  round(100.0 * coalesce(c.buy_clicks, 0) / nullif(i.impressions, 0), 2) AS ctr_pct
FROM impressions i
FULL JOIN clicks c ON c.day = i.day AND c.registrar = i.registrar AND c.tld = i.tld;

CREATE VIEW analytics.buy_ctr_by_registrar AS
SELECT day, registrar, sum(impressions) AS impressions, sum(buy_clicks) AS buy_clicks,
  round(100.0 * sum(buy_clicks) / nullif(sum(impressions), 0), 2) AS ctr_pct
FROM analytics.buy_ctr_by_registrar_tld
GROUP BY day, registrar;

CREATE VIEW analytics.buy_ctr_by_tld AS
SELECT day, tld, sum(impressions) AS impressions, sum(buy_clicks) AS buy_clicks,
  round(100.0 * sum(buy_clicks) / nullif(sum(impressions), 0), 2) AS ctr_pct
FROM analytics.buy_ctr_by_registrar_tld
GROUP BY day, tld;

-- Share of buy clicks on the card with the lowest first-year price on screen.
-- `cheapest` is null when the clicked card showed no price, so those are left out.
CREATE VIEW analytics.cheapest_click_share AS
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
CREATE VIEW analytics.device_daily AS
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

-- /mcp by source (what replaced mcp_events): sessions that viewed the page,
-- keyed by the source of their first view that day, and what they did on it.
CREATE VIEW analytics.mcp_page_daily AS
WITH viewers AS (
  SELECT DISTINCT ON (day, session_id) day, session_id, source
  FROM analytics.site_events_prod
  WHERE event = 'mcp_page_view'
  ORDER BY day, session_id, created_at
)
SELECT
  v.day,
  v.source,
  count(DISTINCT v.session_id) AS sessions,
  count(e.id) FILTER (WHERE e.event = 'mcp_page_view') AS page_views,
  count(e.id) FILTER (WHERE e.event = 'mcp_copy') AS config_copies,
  count(e.id) FILTER (WHERE e.event = 'mcp_click') AS link_clicks,
  count(e.id) FILTER (WHERE e.event = 'waitlist_signup') AS waitlist_signups
FROM viewers v
LEFT JOIN analytics.site_events_prod e ON e.day = v.day AND e.session_id = v.session_id AND e.page = 'mcp'
GROUP BY v.day, v.source;

REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM PUBLIC, anon, authenticated;
