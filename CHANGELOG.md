# Changelog

All notable changes to DigMyName.

## 2026-09-10 — Site audit fixes (frontend)

Everything from the full-site audit except the latency claims (~170 ms / ~70 ms copy and the /speed methodology), which stay as they are pending the owner's decision.

### Fixed
- **Web fonts now load.** The Google Fonts `@import` sat after the `@tailwind` directives and PostCSS dropped it silently, so the site had always rendered in system-ui. Sora, Manrope and Geist Mono are now self-hosted variable woff2 (latin subset, 81 KB total, `font-display: swap`, display faces preloaded).
- **Price / Features / Status filters on the home page now filter.** They were local state in the bar and never reached the results. Semantics in `src/lib/resultFilters.ts`; "features" are backed by the registrar table (WHOIS privacy, promo code, no renewal trap, standard price) instead of the old static "Free SSL / Trending" labels.
- **TLD picker prices are live.** The static seed prices in `TLD_LIST` (e.g. `.com $10.99` while /pricing showed $5.19) are gone; the picker reads the same registrar table the cards and /pricing use. `TLD_LIST` now carries only the extension.
- **Social cards and no-JS crawlers see the right page.** Every route (and alias) is prerendered at build time with its own title, description, canonical and `og:url` (`scripts/prerender-plugin.ts` from the shared route table `src/seo/routes.ts`; the sitemap comes from the same table). Deep links no longer show the home page's card, and static files on deep paths skip the host's SPA-fallback rewrite.
- **Reference chart on /speed** derives bar lengths from the milliseconds (fastest = 100 %) instead of hand-typed values, and renders its final numbers at rest instead of counting up from zero.
- **404** is a real page again: `noindex`, header navigation, one primary action, and a lighter scene (36 stars, 48 px blur).
- **Contrast:** `--muted-foreground` lifted to 5.5:1 on dark cards (was 4.3:1 on 100+ nodes of /pricing) and 4.7:1 on white; Spaceship's brand colour to 6.0:1 on dark.
- **Accessibility:** current page marked with `aria-current` in both navigations; theme toggle and sign-in button have explicit names; every filter control is a real button/checkbox with a label.
- **Numbers that disagreed across surfaces:** `ai-plugin.json` said 10 requests/min (it is 60); /mcp said 12 default TLDs (the API defaults to 11); the footer said "four verification sources" (three availability signals — pricing is separate, and /how-it-works now says so instead of listing Porkbun as a fourth signal); the "200M+ users" badge on the Custom GPT card is gone; "No other major domain search tool does this" became "None of the tools we tested does this"; the invented "100 % honest uncertainty / 0 % hidden markup" stats are real counts now.

### Added
- `/privacy` and `/terms` (linked from the footer, the API page and `ai-plugin.json`'s `legal_info_url`; JSON-LD `termsOfService` points at `/terms`). Affiliate disclosure now sits under the search results, next to the buy buttons.
- Build-time route prerender + per-route crawler summaries; `src/seo/RouteHead.tsx` renders the same tag set at runtime so Helmet adopts the static tags instead of duplicating them.
- /pricing: extensions tracked at a single registrar are grouped separately ("one price is not a comparison"), the detailed tables are collapsed by default (the page was 5 857 DOM nodes and 20 759 px tall), and the header counts say how many extensions are actually compared.
- Tests for the route table, prerender, filters, card facts, pricing helpers, chart scale, header/404 behaviour (`src/test/*`).

### Changed
- Bundle: syntax highlighting uses `PrismLight` with four registered grammars instead of the full Prism build (−≈230 KB gzip on /mcp and /api); the Lottie trophy is an inline SVG (−≈85 KB gzip on /speed, no `eval`); Sonner removed (one toast system); the filter bar loads lazily; React/Radix/supabase-js split into long-lived vendor chunks.
- Hero background pauses (rAF and CSS animations) while scrolled out of view and stops interpolating once the parallax has settled; phones get two blobs at 48 px blur instead of four at 120 px.
- Footer directory badges: one request per badge (theme-matched), explicit dimensions, lazy; the three static shields.io badges on /mcp are local markup.
- `index.html`: one application entity (the `WebApplication` block duplicated the page-level `SoftwareApplication`), no dead `SearchAction` (Google retired the sitelinks search box and robots.txt disallows `/?q=`), preconnect to the Supabase host, light-theme ground painted before React mounts.
- Router future flags (`v7_startTransition`, `v7_relativeSplatPath`) enabled; the AI-toggle easing is a named Tailwind curve (the arbitrary class was ambiguous and dropped).

## 2026-08-03 — MCP server v1.0.0 + Public API v1.1.0

### Added
- **`domain-check-skills-mcp@1.0.0`** published to npm — official MCP server with three tools (`check_domain`, `search_domains`, `compare_registrars`), MIT licensed, Node.js 18+.
- `/mcp` landing page with one-line Claude Code install, config snippets, JSON-LD `SoftwareApplication` schema, npm badges and OG/Twitter meta.
- Public API returns `buy_url` and `register_url` per result, with `utm_source=mcp` attribution.
- `three_year_total_usd` added to registrar results.
- 404 page with CSS/SVG cosmic animation.

### Changed
- Public API rate limit raised from 10 to 60 requests / minute / IP.
- `llms.txt` and `llms-full.txt` document the MCP server, new API fields and the new rate limit.
- Sitemap includes `/mcp`, `/pricing`, `/how-it-works`.
- Design system: Geist Sans/Mono, unified heading scale across pages, `--radius: 1rem` Apple-style corners, responsive container 968px → 1320px, breakpoints `xs` (390px) → `5xl` (3840px).

### Fixed
- OpenAPI docs URL in the public API response.

## 2026-05-15 — Domain verification accuracy overhaul

### Fixed
- **Critical**: API errors no longer falsely report domains as `available:true`. All failure modes now return `available:false + uncertain:true`.
- GoDaddy `definitive` flag is now respected — non-definitive answers are treated as uncertain instead of trusted.
- Premium threshold lowered from $200 to $50 (real GoDaddy aftermarket pricing).

### Added
- Cloudflare DoH for DNS resolution (replaces `Deno.resolveDns`, 2s timeout, no hangs on cold TLDs).
- Premium heuristic: short SLDs (≤4 chars) on `.com/.io/.ai/.co/.app/.dev/.net/.org` flagged as `likelyPremium`.
- Tiered cache TTL: 24h for `godaddy_definitive`, 6h for RDAP, 30m for DNS-only, 0 for uncertain.
- "Likely premium" amber badge on `DomainCard` (cards + compact views).
- Telemetry log line `check-domains via={...} n=N` for source distribution.
- Deno test suite for trust hierarchy (`index_test.ts`, 4 tests).

### Changed
- GoDaddy lookups now run with shared `pMap(limit=10)` instead of sequential 10-chunks.
- All three sources (GoDaddy, DNS, RDAP) fly in parallel per domain via `Promise.all`.
- `DomainCheckResult` extended with `uncertain` and `likelyPremium` fields, threaded through to UI.

## Earlier
- SEO: og:image, FAQ, llms-full.txt, sitemap, GSC verification.
- Auth: Email + Google + Apple via Supabase.
- Pricing: 7 registrars × 52 TLDs scraped weekly via Firecrawl.
