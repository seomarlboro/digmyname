# Changelog

All notable changes to DigMyName.

## 2026-09-16 — The paid signal stops being the answer (edge + migration)

### Added
- **WHOIS on TCP 43 as the free registry authority for `.co`, `.me` and `.io`** (`_shared/whois.ts`). Those three zones have no registry RDAP we can use and were 65 % of every paid third-signal call; their registries answer plain port-43 WHOIS in 250-470 ms. Same evidence bar as the RDAP path: "no registration" is believed only alongside DNS NXDOMAIN, a record alone is enough for TAKEN, and a blocked port / rate limit / retired service / unparsable answer all read as `unknown` and fall through to today's honest uncertain. Parser pinned against real registry answers.
- **Back-off for a registry that is rate-limiting us.** `rdap.gmoregistry.net` (.shop) answers 429 in ~90 ms after 3-4 requests from one IP and recovers after ~5 s of quiet — which is why 82 % of `.shop` verdicts fell through to the paid signal. A 429/503 is now told apart from "no answer about this name": the host is backed off for 5 s so the window can close, and the name gets one retry when the caller's budget allows.

### Changed
- **The name the visitor typed is verified by Porkbun, not by the metered signal.** Porkbun's live spec allows 10 single checks / 10 s and a bulk endpoint of 25 domains per call against 200 domains / 60 s — the code was holding a decade-old 1-per-10-s limit and checking exactly one name per request. It now asks in bulk for the typed name plus every premium suspect on screen, so a registry-premium name gets its real first-year AND renewal price for free, and `verifyPremium` no longer escalates at all (it still bypasses both caches, so the answer stays fresh).
- **`edge-cache-prewarm` stops buying its own warm cache.** `shop.store` and `new.tech` were short available names: premium suspects, one paid call each per cache expiry. Replaced with registered 6+ character names (migration `20260916170000_prewarm_no_paid_signal.sql`).
- `FASTLY_DAILY_CAP` defaults to **0**: with WHOIS and Porkbun answering everything the paid signal used to, the default is to spend nothing. The token stays as a fuse — set `FASTLY_DAILY_CAP=300` in the edge environment to arm it again, no deploy. Refused calls are counted in `fastly_spend_daily.blocked`, so we can see what a zero-spend day would have bought.

### Added (rule)
- **Our own runs never spend money.** Benchmarks, the monitor, scripts and tests may only probe fresh 6+ character labels, off the brand list, in zones whose registry answers us. Pinned by `_shared/our-runs-are-free_test.ts`, which reads the actual scripts. August's $45.05 invoice was almost entirely our own QA and benchmark traffic — at ~10 visitors/day, visitors were a rounding error.

## 2026-09-16 — Launch-day spend brakes on the paid third signal (edge + migration)

### Added
- **A daily cap on paid third-signal calls.** `FASTLY_DAILY_CAP` (default 300 — Fastly's free 10,000/month is 333/day; `off` = no ceiling, `0` = spend nothing) bounds Fastly Domain Research requests per UTC day. Past the ceiling the refused names fall through to the pipeline's existing no-verdict branches — a premium suspect keeps `available:true` with `premiumUnverified` (card: premium mark + *Check price*, never a $ figure), brand-blocked names and `.co`/`.me` stay *Couldn't verify*. Nothing is shown available on weaker evidence, and a partially-spent budget still pays for as many names as it can.
- **A real kill switch for the whole paid signal.** `THIRD_SIGNAL=off` now disables every escalation reason from the edge's environment; it used to be a hardcoded constant that needed a deploy. `HEADLINE_PREMIUM_CHECK=off` (the per-search verify) is unchanged, now covered by tests. A Supabase secret change applies to the next invocation with no deploy — which matters in a project where only a Lovable build ships an edge function.
- **Spend accounting:** `public.fastly_spend_daily` (migration `20260916160000_fastly_spend_daily.sql`) — one row per UTC day with `calls`, the `co_me`/`premium`/`brand`/`other` split already computed for the `fastly-escalate` log line, and `blocked`. Counts only: no domain, no IP, no session; service_role only. Written through the atomic `fastly_spend_add()`. Only calls actually sent are charged — the circuit breaker and the deadline skip most of a batch when Fastly is down.

### Changed
- The counter read happens only on a batch that already reached pass 2, so a search that escalates nothing pays no extra DB round trip. If the counter cannot be read the pipeline fails **closed** (the moment we cannot count is the moment we cannot afford to spend); the one exception is "table/function not deployed yet", which fails open with a warning so a build-ordering gap cannot silently switch the third signal off for everyone.

## 2026-09-15 — Light theme: glass filter bar, visible search field, hero title on short screens (frontend)

### Changed
- **Filter bar and its popovers are real glass in the light theme.** They were solid white with no backdrop blur (the blur existed only in dark). Now 35% white (popovers 60% for text), `blur(24px) saturate(1.8)` so the colour of the cards underneath shows through as soft light, a 7% dark hairline and a white inner top highlight. The coloured glow behind the bar is dark-theme only (through light glass it smeared). Dark theme unchanged.
- **Search field in the light theme** gets a light grey fill (`black/4%`, border `black/8%`) instead of `white/25%`, which disappeared on the light hero. Same change in the pre-hydration shell in `index.html`.
- **Hero title** on screens 640 px and wider scales with the smaller of `7vw` and `8vh` (`sm:text-[clamp(2.25rem,min(7vw,8vh),5.7rem)]`): 61 px on 1024×768 (was 91), 51 px on 1000×640, 72 px on 1440×900, 86 px on 1920×1080. Phones keep `10.5vw` (41 px on a 390 px screen). Mirrored in `index.html`.
- **Search placeholder** in the light theme is lighter (`foreground` at 35% instead of `muted-foreground`), so it reads as a hint on the grey field; dark theme unchanged. Mirrored in `index.html`.
- **Hero chip** ("First answer under 0.5 s") in the light theme: a mint-tinted badge (7% mint fill, 45% mint border, dark mint text; with a 10% fill and a 30% border the 1px edge melted into the fill and read as blurry — measured at DPR 2 the edge is exactly 2 device pixels either way, so it was contrast, not sub-pixel placement) instead of a grey foreground tint that read as mud; a frosted-white version was tried first and vanished on the pale hero. Dark theme unchanged.

## 2026-09-15 — Honest buy-link copy, retention, CTR impressions, /contact (frontend + migration)

### Fixed
- Every public surface said buy links "may earn us a commission". No buy link carries an affiliate tag and no price row has an affiliate URL, so the search disclosure, footer, How it works, Terms, the prerendered crawler text, llms.txt, llms-full.txt and ai-plugin.json now say what is true: buy links go straight to the registrar with no affiliate tag. A test fails if "commission" comes back.
- /terms: prices are described as coming from registrars' catalogs and pages and third-party price listings (not registrar catalogs alone); "three signals" became "up to three", with when the paid third one runs; the API limit is stated as the fair-use allowance rather than a hard guarantee (the per-isolate limiter rarely bites).

### Added
- **Retention jobs** (pg_cron, migration `20260916090000`): expired `domain_cache` rows are deleted daily (the pipeline never reads them; TTLs unchanged), and `site_events` rows older than 13 months. /privacy states both periods.
- **CTR impressions:** one `results_shown` event per settled search lists the extensions of the Available cards and the registrar each Buy button goes to (no name, no query). `analytics.buy_ctr_by_registrar_tld` (+ per-registrar and per-TLD rollups) divides buy clicks by impressions.
- **/mcp tracking moved to `site_events`:** `mcp_page_view` (referring site as a category from a fixed list, never the URL), `mcp_click`, `mcp_copy`, `waitlist_signup`. `trackMcpEvent` is gone and the old `mcp_events` table is dropped (migration `20260916100000`, rows exported privately first).
- **/contact:** email, what to include when reporting a wrong status or price, the public issue trackers. `/imprint` redirects there until legal details are published (SPA redirect plus a prerendered redirect page). Footer and sitemap link it.

## 2026-09-12 — The typed name gets its real price (frontend + edge: check-domains)

### Fixed
- A registry-premium name the base pass could not recognise (`reputation.dev`: ten letters, no dictionary hit) shipped with the TLD's standard price ($8.48) while the registry sells it for $164.57. RDAP and DNS only say "registerable"; the third signal is the one that sees `premium`, and it ran only for short / dictionary suspects.

### Changed
- **Headline premium verification.** After the authoritative wave settles and the visitor is still on the query (800 ms), the card they typed gets one verifying request: `check-domains` with `verifyPremium: true`. For that name the cache is bypassed and pass 2 always runs when pass 1 says available; Fastly's `premium` status flips the card to *Premium*, and Porkbun's `checkDomain` — preferring that name — attaches the registrar-confirmed price when its rate gate allows, else the card says *Premium · check price*. Skipped for taken, uncertain, already-flagged and short (already-escalated) names; never per keystroke; site only (API and MCP unchanged). Kill switch: `HEADLINE_PREMIUM_CHECK=off` on the edge. Cost: at most one third-signal call per settled search, and a verified verdict is cached for 24 h for everyone.
- Cards show a registrar-confirmed premium price (`$174.10 /year · Premium`) instead of the bare word, attributed to Porkbun (the registrar that confirmed it) with the buy link pointing there; the cheapest standard-price registrar's promo and privacy badges do not apply to a premium name.
- The verify request follows the headline's own authoritative answer plus 800 ms, not the whole wave (a .co/.me batch can take seconds, and the first cut waited for it).
- Tests: pipeline (the flag forces Fastly and takes Porkbun's price; without it a plain name is never escalated), search lanes (one verify request after the wave; none for suspects or taken names), card facts (premium price only on a premium verdict).

## 2026-09-11 — The shared cache is read alongside the probes (edge: check-domains, public-api)

### Changed
- `checkDomains` no longer waits for the `domain_cache` round trip before asking the registries. The probes for every name the in-isolate cache missed start at once and the DB is read alongside them; a valid cached row still wins for its name (it may carry pass-2 enrichment a raw probe lacks) and never goes on to the third signal or the cache write. Base verdicts still publish the moment they land, unless the cache has already answered for that name. Cache rules, TTLs and the cache-version guard are unchanged; the cost is one extra registry/DoH probe for a name that turns out to be cached. Covered by a pipeline test with a gated DB stub. The round trip was measured in August at 10–30 ms in-region and 100+ ms from another region; a quick before/after from the EU on the live function (10 fresh .com names each, too small to be more than a hint) went from p50 555 ms to 456 ms, with the p90 dominated by the usual cold-isolate outliers either way.

## 2026-09-11 — /speed claim panel (frontend)

### Changed
- "Beat our number, take the crown" is now a full accent panel in the site's own language (`SpeedClaim`): dark glass with the aurora glowing behind it and a luminous top edge, an eyebrow, a two-line headline with the gradient on "take the crown", the two CTAs (gradient "Run the timer", ghost-mint "How we measure" that scrolls to the methodology), and the measured number as the visual on the right — `<0.5 s` in the mono face with the four facts under it (386 ms US, 485 ms EU, 300/300 under a second, Sept 2026, 150 + 150 fresh browsers). Two columns on desktop, stacked on phones. References: dark developer-tool accent sections (Gladia, Resend, Apple TV promo band) via Refero.
- The trophy icon is gone (the number is the visual), and with it the hand-drawn SVG, its shimmer CSS and the short-lived gradient `tone` of `CalloutBlock`.
- The panel now says what the challenge is: a rules strip with **What counts** (a public lookup measured the same way — fresh browser, unseen name, last keystroke to first visible verdict, ≥ 100 visits, p95), **How to take part** (a prefilled GitHub issue or hello@digmyname.com; we re-run and publish either way) and **The evidence** (raw per-visit results under `docs/bench/`, the benchmark script, the US runs in GitHub Actions). The raw results and summaries of the 10 September runs are committed under `docs/bench/2026-09-10/` with a README on reproducing them.
- Owner feedback applied: the `<0.5 s` figure is plain foreground, not gradient; the panel has no glow (glass, thin border, luminous hairline only); gradient buttons use a white label in the light theme (the light-theme stops are deep) and keep the dark ink in the dark theme.
- **Buttons are the design system's, not the call site's.** `Button` now carries weight (medium, no more bold labels) and type size per size (`sm`/`default` 14 px, `lg` 16 px) alongside height and padding; the `.btn-gradient` CSS no longer forces its own weight. Call sites on /speed, /how-it-works, /mcp, /api and the 404 page that restated height, padding, text size or `btn-gradient` by hand use `size` / `variant` instead.
- The challenge rules moved out of the panel into a regular section, "How the challenge works", built from the page's own `FeatureCard` (01 What counts · 02 How to take part · 03 The evidence) with shorter copy; the facts card lost its third-line hints and mixed sizes (label + one mono value per fact). The email address is gone from the page: submissions go to a GitHub issue, and a public thread link slots in as soon as it exists.

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
