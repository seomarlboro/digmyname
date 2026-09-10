# Changelog

All notable changes to DigMyName.

## 2026-09-11 — Latency copy states what was measured (frontend, MCP package copy)

### Changed
- The home-page chip reads **"First answer under 0.5 s · p95"** (was "~170 ms"), per the owner's decision after the cold-visitor benchmark (US p95 386 ms, EU p95 485 ms, 150 fresh browsers each).
- /speed: the three stats, the four pipeline cards and the reference chart now describe the current pipeline (browser registry lane → authoritative edge pass → API edge cache) with the benchmark numbers: first answer p95 US 386 / EU 485 ms, raw Verisign RDAP floor 107 ms (US median), full check per card median US 472 / EU 358 ms, API repeat-within-60 s ~110 ms. The lede says the quoted number is a 95th percentile of 300 cold visits, not a best run.
- /api and /mcp, the /mcp meta description and JSON-LD, the how-it-works FAQ, the home JSON-LD, `llms.txt` and the README no longer say "~170 ms typical" or "~70 ms cached": the API's first-time check is "about half a second, under 0.9 s at p95" (measured US p50 536 / p95 868, EU p50 382 / p95 515) and a repeat within 60 s "about 0.1 s" (edge-cache hits measured 91–169 ms).
- MCP package (`mcp/`): README and description carry the same figures; version 1.2.10 → 1.2.11 for the owner's next npm publish (the site badge reads the published version from npm, so nothing shows 1.2.11 until then).

## 2026-09-10 — Cold-visitor benchmark, US and EU (frontend)

### Added
- `scripts/bench/first-answer.mjs` + the manual `bench-first-answer` workflow: every visitor is a fresh browser context that loads the home page, pauses, types a name nobody has checked and stops when the on-page stopwatch stops. Reports p50/p90/p95 overall, per lane and per TLD, plus raw registry / DoH / public-API probes from the same machine.
- First run, 150 cold visitors each, half typing a bare word and half a name with a TLD (including .co/.me): **US (Dallas) p50 227 ms, p95 386 ms, max 423 ms; EU (Vienna) p50 307 ms, p95 485 ms, max 765 ms; 300/300 under one second.** The edge alone (public API `/check`, fresh .com) was p50 536 / p95 868 ms from the US and p50 382 / p95 515 ms from the EU.

### Fixed
- A typed TLD outside the top-ten list (".tech", ".store", …) is now the headline card: it goes solo to the server lane and the browser lane at +80 ms instead of sitting in a batch of eight while the .com card answers first (the benchmark showed its own verdict landing 480–640 ms later).

## 2026-09-10 — The registry answers the visitor directly (frontend)

### Changed
- **Browser lane.** For the popular extensions the visitor's browser now asks the registry's public RDAP server and Cloudflare / Google DNS-over-HTTPS itself (`src/lib/browserLane.ts`), over connections opened with `preconnect` while the name is still being typed. It runs the same two base signals the edge checks first, under the same rules: *taken* on RDAP 200 or DNS records, *available* only on RDAP 404 + NXDOMAIN and never for a premium-suspect (1–5 char) or brand-blocked label, anything else changes nothing. The verdict is provisional: the authoritative edge answer still runs for every card, overwrites the browser's, and is the only thing the session cache keeps. Registries with CORS verified on 2026-09-10: Verisign (.com .net), PIR (.org), Identity Digital (.io .ai …), Google Registry (.app .dev), CentralNic (.xyz …), Radix (.tech …); .co/.me have no public RDAP and stay with the server. A test pins every browser-lane base to the edge pipeline's `FAST_RDAP` table.
- The headline card is asked at +80 ms with the fast lane (also for short labels, where the server lane waits: the browser can show *taken* at once and never *available*); the other popular TLDs with the authoritative wave, one registry query each.
- **Stopwatch honesty fix (fast lane).** Whether a DNS pre-check actually flipped a card was decided by a flag set inside React's state updater but read outside it; React only runs the updater eagerly when nothing else is pending, so the clock sometimes kept running past the first visible answer and reported a later, worse time. Both lanes now stop the clock from inside the updater.
- /privacy says that for the popular extensions the browser talks to the registry and the DoH resolvers directly, so they see the visitor's IP address with the name.

## 2026-09-10 — One price source instead of five scrapers (edge: fetch-registrar-prices)

### Changed
- **tld-list.com's API is the primary price source.** One `extension/get` call returns every tracked registrar × TLD (Porkbun, Namecheap, GoDaddy, Cloudflare, OVHcloud, Spaceship) with promo codes, special terms and ICANN fees; a run that gets an answer skips every scraper and spends no Firecrawl credit. The parser (`parseTldListExtensions`) keeps the stored numbers comparable with the registrars' own pages: a promo that needs a multi-year term is not recorded as the first-year price, an ICANN fee tld-list folded into the final price is taken back out into `icann_fee`, and `promo_code` / `whois_privacy` are now written by the refresh. Fixture from the documented response shape, 5 new Deno tests.
- The API needs a subscription keypair (`TLDLIST_API_PUBLIC` / `TLDLIST_API_PRIVATE` edge secrets). Until they exist the previous scrapers run unchanged; naming a scraper in `sources` runs it even when tld-list answered. tld-list's pages are not scraped: they sit behind a bot challenge and its terms forbid it.
- Fallback scrapers now share one Firecrawl pacer (strictly sequential, ≥ 6.5 s apart, 16 registrar pages per run) after a full run hit the plan's 10 req/min and 2-browser limits (429/408). OVHcloud is plain-fetch only, GoDaddy's long tail rotates over four weekly runs, quarantine is 30 days (must exceed the slowest rotation).

## 2026-09-10 — Registrar price coverage (edge: fetch-registrar-prices)

### Changed
- The weekly price refresh reads three registrars' **own pages** in addition to tldspy: Namecheap's full TLD list (one server-rendered table), OVHcloud's per-TLD pages (the embedded `tldPrices` blob) and GoDaddy's per-TLD pages ("Starting at <s>regular</s> promo /1st yr"; a promo that needs a multi-year term is not recorded as the first-year price). tldspy's per-registrar pages only ever listed ~17 core TLDs per registrar, which is why 35 of 53 extensions had Porkbun-only prices; its per-TLD pages are members-only, so they cannot fill the gap.
- Porkbun's public catalog is now written for every tracked TLD, not only as a gap-fill.
- Direct fetch first, Firecrawl raw-HTML fallback second (capped at 24 fallbacks per run) so a bot wall on one registrar costs credits but not coverage.
- `{ "dryRun": true, "tlds": [...], "sources": [...] }` in the request body reports what every source would write — per-source fetched/parsed counts, samples and errors — without touching the table.
- Parsers live in `parsers.ts` with fixtures captured from the real pages (`fixtures/`) and Deno tests (`parsers_test.ts`).

## 2026-09-10 — Usable before JavaScript, faster first answer (frontend)

### Changed
- **The home page is usable before React loads.** `index.html` now carries the real hero and a real search input (same classes React renders, theme class set by an inline script before first paint). On a phone the field is focusable the moment CSS lands instead of after ~180 KB of JS; anything typed before mount is picked up by React, and Enter before mount submits to `/?q=…`. Prerendered deep routes get a plain spinner instead of the home hero (`src/seo/prerender.ts`).
- **The headline domain (typed TLD, else `.com`) is checked authoritatively with the fast lane at +80 ms** instead of waiting for the 250 ms authoritative debounce — unless its label is 1–5 characters, which the pipeline treats as a premium suspect (a per-keystroke check would buy a paid third-signal call). `src/lib/searchLanes.ts`, covered by a fake-timer test that drives the real component.
- **The live stopwatch no longer re-renders the results list every frame.** Its digits are written straight into a text node from `requestAnimationFrame` (`LiveStopwatch`); the list re-renders only when the first answer lands.
- `DomainCard` is memoised and takes the cheapest-registrar row, favourite state and the sign-in handler as props; the list reads auth, favourites and the price table once instead of 53 cards × 3 store subscriptions each, and mounts one sign-in dialog instead of one per card.
- The floating filter bar switches to the button + drawer below 1024 px (was 768), so tablets and large phones in landscape don't get a 620 px bar crowding the edge; the drawer has a proper `DrawerTitle`.

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
