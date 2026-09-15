-- Drops the old /mcp page tracking table (owner approved 2026-09-16). Since 2026-09-16 the site writes /mcp
-- events to public.site_events (docs/DIGMYNAME_ARCHITECTURE.md §12) and nothing
-- writes mcp_events any more once that frontend is deployed.
--
-- An older bundle still in someone's browser may try to insert here; that insert
-- fails silently (analytics never breaks the page). The 320 rows (event type,
-- target, referrer URL, user agent; no IP) were exported to a private local file
-- outside this public repo before the drop. /privacy no longer lists the table.

DROP TABLE IF EXISTS public.mcp_events;