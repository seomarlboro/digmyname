-- PENDING — not a migration yet. Deliberately kept outside supabase/migrations
-- so it cannot be applied by accident.
--
-- Drops the old /mcp page tracking table. Since 2026-09-16 the site writes /mcp
-- events to public.site_events (docs/DIGMYNAME_ARCHITECTURE.md §12) and nothing
-- writes mcp_events any more once that frontend is deployed.
--
-- Apply only after the owner approves, and only after the frontend deploy
-- (an older bundle still inserts here). To apply: move this file to
-- supabase/migrations/<timestamp>_drop_mcp_events.sql and update the
-- "MCP page usage" row on /privacy in the same commit.
--
-- The rows hold event type, target, referrer URL and user-agent string (no IP).
-- Export them first if the historical install-path counts matter.

DROP TABLE IF EXISTS public.mcp_events;
