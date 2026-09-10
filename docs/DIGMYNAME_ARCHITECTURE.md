# DigMyName — Architecture & State Protocol

> **This is the living source-of-truth for DigMyName.** It must be kept current: any architectural change, new decision, or shift in what we're building gets reflected here in the SAME commit. Read it in full at the start of any work session. It is written so a human OR an AI agent with zero prior knowledge can understand how the system works, why it's built this way, what's live, and where the weak spots are — enough that a fresh chat can run a full review from this document alone. Last verified: 2026-09-11.

## 1. What the product is

**DigMyName** (digmyname.com) is a domain-availability + registrar-pricing SaaS. It answers two questions for any domain name:

1. **Is it available?** — verified against three independent signals, with an honest *Unverified* state when they disagree instead of guessing.
2. **Where is it cheapest?** — price comparison across 6 registrars, exposing the renewal traps that cheap first-year promos hide.

It ships three surfaces: the **website**, a free **no-auth JSON API** (for scripts/agents), and an **MCP server** on npm (so any LLM — Claude, Cursor, Windsurf, Continue, Zed — can check domains directly).

**Owner:** Kir. Solo operator. Terse, technical. Prefers decisive action over clarifying questions.

## 2. The stack (physical layout)

| Layer | Tech | Where |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui | Lovable-managed (project in the owner's Lovable workspace) |
| Backend logic | Supabase Edge Functions (Deno) | the owner's Supabase project (via Lovable Cloud) |
| Database | Supabase Postgres + RLS | same project |
| Edge cache | Cloudflare Worker (60s TTL) | api.digmyname.com fronts the Supabase functions |
| MCP package | domain-check-skills-mcp (npm, stdio) | published from mcp/ subfolder |

**Repos:** github.com/seomarlboro/digmyname — main, Lovable-managed. A direct git push lands code but deploys NOTHING: edge functions deploy only through a Lovable build (send a "redeploy only" message naming the function), the frontend through Lovable's deploy. Verified 2026-08-12 and again 2026-09-10. GitHub username is canonically lowercase `seomarlboro` — directory scanners 404 on the capitalized form.

**Critical Supabase gotcha:** the real DB is the project under the owner's org — NOT the empty decoy project literally named "DigMyName". Sanity check: `select count(*) from registrar_prices` ~= 200+.

## 3. How availability works (the core pipeline)

All availability/pricing logic lives in `supabase/functions/_shared/pipeline.ts`, called in-process by two thin HTTP wrappers so there's no edge->edge hop and they share warm caches:

- **check-domains** — the WEBSITE path (frontend calls supabase.functions.invoke('check-domains')).
- **public-api** — the API/MCP path (/check, /search, /registrars, /age, /fast, /openapi.json).

### The three signals

1. **RDAP** (authoritative for registered yes/no, no pricing). Resolved via the IANA bootstrap file (data.iana.org/rdap/dns.json) -> official registry RDAP server per TLD. Top ~55 TLDs are hardcoded in FAST_RDAP to skip the bootstrap wait. Falls back to the public rdap.org aggregator for long-tail zones.
2. **DNS-over-HTTPS** (fast, no hangs). Cloudflare primary; Google + AdGuard fire as hedges 400ms later. First decisive answer wins.
3. **Fastly Domain Research API** (third registerability signal). HISTORICAL: this was "Domainr", which Fastly acquired (2026-08); its old RapidAPI endpoint is dead. Code still uses legacy names (checkDomainrBatch, interpretDomainr, checkedVia:"domainr") but the TRANSPORT is Fastly (api.fastly.com/domain-management/v1/tools/status, header Fastly-Key). Statuses: inactive(=available) / dpml / reserved / claimed(=blocked brand) / premium / active.

**Porkbun** is PRICING only — may tighten availability (mark taken), never loosen it.

### Trust hierarchy (the honesty core)

- AVAILABLE only when >=1 authoritative "yes": RDAP 404 AND DNS NXDOMAIN agree, OR Fastly says inactive/unregistered.
- TAKEN when RDAP returns a registration, OR DNS has A/NS/MX records, OR Fastly says active/parked.
- UNCERTAIN otherwise (API failure, non-definitive answer, or signals conflict) -> returns available:false + uncertain:true. NEVER falsely "available".

This is the single most important invariant. An uncertain result is NEVER cached and NEVER shown as available.

### Pass structure inside checkDomains()

1. L1 hot cache (per-isolate, in-memory, 10 min). **Measured dead** (2026-08-12, three ways: 0–6 % of requests reach a warm isolate), so in practice it never fires; same for the in-isolate response cache in public-api.
2. L2 DB cache (domain_cache table, tiered TTL) — skips network probes. Awaited BEFORE the probes start (100–115 ms from another region, ~10–30 in-region); running it in parallel with the probes is a known free win, not yet applied (owner go pending).
3. Pass 1 — free authoritative sources (RDAP + DNS) run in parallel per domain; each publishes its verdict into partialSink the moment it lands.
4. Pass 2 — the third signal (Fastly) fires ONLY where it adds value (premium suspects, brand-blocked names).
5. Aftermarket NS detection — registered names on Sedo/Dan/Afternic/etc. get a resale listing link.
6. Price enrichment — Porkbun public catalog + registrar_prices DB rows.
7. Cache write — only trustworthy verdicts, background via EdgeRuntime.waitUntil.

### Wall-clock budget + partial results (both paths)

Each wrapper races the pipeline against a hard budget. On timeout it serves whatever resolved (from partialSink) and stamps only the still-unresolved domains with an honest budget_timeout (uncertain — OUR budget expired, NOT a registry failure; never shown available, never cached).

- public-api: hardBudgetMs 900ms (core) / 1000ms (.co/.me); Fastly deadline 650/780ms.
- check-domains: HARD_BUDGET_MS 8000ms; Fastly window 6000ms.

### Website fetch lanes (DomainSearch.tsx) and their one invariant

The site fires three lanes per search (the browser lane is described right after this paragraph): a DNS-only pre-check (`/public-api/fast`, chunks of 10, 80 ms after the last keystroke) so cards can flip early, and the authoritative `check-domains` lane (one request per top TLD, batches of 8 for the rest, 250 ms after the last keystroke — human typing is ~150-300 ms between keys, and at 80 ms every keystroke fired a full 53-TLD wave with paid Fastly calls for .co/.me and for every short prefix). When the query moves on, the superseded search's in-flight requests are aborted. The lanes race, and on a cold isolate a fast chunk can land AFTER the authoritative batch for the same names (measured live 2026-09-08: authoritative 0.9–1.9 s, slowest fast chunk 2.3 s). Invariant, enforced by `applyFastVerdict()` in `domainData.ts` and guarded by `fast-verdict.test.ts`: **the fast lane may only fill in a row that is still Checking, and an uncertain DNS answer never leaves Checking.** Before this rule the late chunk wrote `uncertain:true` over ten confirmed available:true cards ("Couldn't verify — sources disagreed"), with nothing left in flight to correct them. Rows hydrated from the session cache are not sent to the fast lane at all.

### Browser lane — the registry answers the visitor directly (shipped 2026-09-10, `src/lib/browserLane.ts`)

Every registry behind the popular TLDs serves RDAP with `Access-Control-Allow-Origin: *` (RFC 7480), as do Cloudflare/Google DoH. So the browser runs the same two base signals the edge runs first (registry RDAP + DoH) over its OWN connection, pre-opened by `<link rel="preconnect">` on landing and re-opened on focus/first keystroke (`warmRegistries()`, browsers drop unused sockets after ~10 s). Rules mirror `resolveDomain`'s base pass: taken on RDAP 200 or DNS records; available only on RDAP 404 + NXDOMAIN, and never for a premium-suspect (1–5 char) or brand-blocked label (those stay with the edge and its paid third signal); anything else is `unknown` and changes nothing. `applyBrowserVerdict()` follows the fast-lane contract: only a row still Checking changes, the row stays `provisional` (never cached), and the authoritative edge answer overwrites it. Coverage table `BROWSER_RDAP` = Verisign (com, net), PIR (org), Identity Digital (io, ai, studio, info, …), Google Registry (app, dev, page, new), CentralNic (xyz, art, lol, icu, inc), Radix (tech, store, site, online, space); `.co`/`.me` have no public RDAP and stay edge-only. A test pins every entry to the edge's `FAST_RDAP`. Timing: the headline card (the first generated domain — the typed TLD when one was typed, else .com — ALWAYS goes solo, even outside TOP_TLDS, fixed 2026-09-10 after the benchmark caught .tech waiting in a batch) is asked at +80 ms with the fast lane; the other popular TLDs with the 250 ms wave, one registry query each. Privacy: the registry and the DoH resolvers see the visitor's IP with the name; /privacy says so.

Stopwatch rule (fixed 2026-09-10): whether a lane actually flipped a card is only known inside React's state updater, and React runs updaters eagerly only when nothing else is pending — so both the fast lane and the browser lane stop the clock from inside the updater via `queueMicrotask(markFirstAnswer)`; `markFirstAnswer` is idempotent. Before the fix the clock could run past the first visible answer and report a later, worse time.

**Cold-visitor benchmark (2026-09-10, `scripts/bench/first-answer.mjs`, workflow `bench-first-answer` = US runner):** 150 fresh browser contexts per location, half typing a bare word, half a name with a TLD incl. .co/.me. US (Dallas): p50 227, p90 361, **p95 386**, max 423 ms; EU (Vienna): p50 307, p90 443, **p95 485**, max 765 ms; 300/300 under one second; 136/131 first verdicts came from the browser lane. Edge alone (public API /check, fresh .com): US p50 536 / p95 868, EU p50 382 / p95 515. The public copy ("First answer under 0.5 s · p95", owner's decision 2026-09-11) quotes exactly this.

## 4. The .co / .me problem (a permanent architectural constraint)

.co and .me have NO working public RDAP: not in the IANA bootstrap; rdap.nic.co is dead; rdap.org actively LIES (returns 404 even for registered .co names — verified live). So AGGREGATOR_UNRELIABLE_TLDS = {co, me}: a 404 from the aggregator on these zones is downgraded to unknown, never read as available.

Consequence: .co/.me ALWAYS escalate to Fastly (the only authority), so they "flap" (available <-> Check price) purely on whether Fastly beats the deadline on a cold isolate.

This CANNOT be fixed at the speed layer — there is no faster authority. Solved at the UX layer: a 5-minute frontend session cache (DomainSearch.tsx, resultCacheRef) that caches only trustworthy verdicts so returning to a just-checked name shows the confirmed verdict instantly instead of re-flapping. The authoritative check still fires; the cache is for instant display, not for skipping verification.

.fm/.ly/.sh have the same problem (ccTLD, no RDAP) -> deliberately NOT added. .co stays (too valuable; flap killed by the cache).

.gg and .so were REMOVED from the defaults on 2026-08-15 for the same reason (no RDAP at all): confirming them needs the paid third signal, and the traffic does not justify it. An explicit `?tlds=gg` still works and still escalates.

## 4a. .io is deliberately outside the speed target (decided 2026-08-15)

.io has a working registry RDAP but is NOT in the IANA bootstrap, so the public aggregator answers 404 for EVERY .io name — including registered ones (verified live: github.io, vercel.io). Reading that 404 as "free" is what sold registered names, so `trustsAggregator404()` now refuses it and the verdict waits for the real registry at rdap.identitydigital.services.

That registry costs 0.83–1.11s cold, of which ~580ms is TCP + TLS handshake and only ~210–425ms is the registry itself. With isolates cold ~95% of the time there is no connection to reuse. Measured on the live API after the fix: 8 fresh .io names, 1 uncertain, and **0 of 8 under 1000ms** (1.11–1.50s wall).

Decision: **accept it.** .io answers correctly and slowly; it is excluded from the 99% <1000ms target rather than being made fast by trusting a source that lies. Do NOT "optimise" this by re-trusting the aggregator's 404 or by dropping the registry probe — that is the exact regression, and `pipeline_test.ts` guards it.

Update 2026-09-10: on the SITE path the browser lane asks rdap.identitydigital.services directly (CORS), so .io now paints in ~0.3 s (benchmark p95 275 ms US / 479 ms EU). The constraint above still holds for the API/MCP path, which has no browser.

## 5. Pricing subsystem

- 6 registrars: Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, OVHcloud.
- registrar_prices table (~165 rows, 50 TLDs). Columns: reg_price / renew_price / transfer_price, supported (bool), updated_at, verified_at.
- Refresh (fetch-registrar-prices, weekly cron Sun 04:00 UTC, 150 s timeout; admin-only via service role or `x-cron-secret`). Primary source since 2026-09-10: **tld-list.com's API** (`extension/get`, all six registrars × all tracked TLDs in one call with promos, terms and ICANN fees) — needs `TLDLIST_API_PUBLIC` / `TLDLIST_API_PRIVATE`, which the owner has requested from tld-list (keys pending). Until then the scrapers run: Porkbun public catalog (every TLD), OVHcloud per-TLD pages (plain fetch), GoDaddy per-TLD pages via Firecrawl (long tail rotated over 4 weekly runs), tldspy per-registrar pages via Firecrawl for Cloudflare/Spaceship/GoDaddy/Namecheap (~17 core TLDs each), Namecheap's full list opt-in. All Firecrawl calls go through one pacer (sequential, ≥ 6.5 s apart, 16 pages/run — the plan allows ~10 req/min and 2 browsers). Parsers are pure (`parsers.ts`, fixtures from the real pages, Deno tests). `{dryRun, tlds, sources}` in the request body reports what each source would write. tld-list's pages are never scraped (bot wall + ToS). The old Cloudflare wholesale JSON backup is dead (404).
- Freshness: prices older than STALE_PRICE_MAX_DAYS = 60 fall through to an honest "Check price" instead of a stale number. Enforced on /check, /search (via cheapestForTlds()) AND /registrars. A separate 30-day auto-quarantine (was 21; must exceed the slowest scraper rotation) flips supported=false on rows not re-verified. The refresh also writes `promo_code` and `whois_privacy` when the source publishes them.
- Pricing model on the site is cheapest-by-action: 4 independent columns (Cheapest register / renew / transfer / Best 3-year value), each showing its own cheapest registrar — no cross-registrar splicing.

Known constraint: Claude's cloud container is geo/Cloudflare-blocked from Porkbun/Namecheap/Spaceship/TLDSpy. Edge functions reach them fine. Verify pricing via prod /check or query_database, NOT local curl.

## 6. Honesty rules (owner-mandated, non-negotiable)

These are product identity, not preferences. Breaking any is a defect:

- Never unhedged "fastest" — always pair with a dispute mechanism / live timer.
- Cold vs cached latency kept distinct — never present a cache figure as the typical first answer. Latency claims come only from a benchmark run, quoted with date, location, n and percentile.
- Browser-lane rules (see §3): available only on RDAP 404 + NXDOMAIN, never for premium-suspect or brand-blocked labels; browser verdicts are provisional and never cached.
- Uncertain availability: never cached, never shown as available.
- Never show a price without a fresh, trusted DB row (supported=true, within 60 days).
- Brand-protected / sldBlocked names -> uncertain:true, uncertainReason:"brand_protected" on all paths; never fall through to available.

## 7. Cross-surface consistency rule (owner-mandated)

Any number / count / claim (registrar count, TLD count, latency, signal names) changed in one place MUST be updated identically across ALL surfaces:

- Website: Index / Api / Mcp / HowItWorks / Speed / Pricing + components
- Repo: README.md, public/llms.txt, index.html static crawler block
- npm: mcp/README.md, mcp/package.json desc, mcp/server.json (x2 version + desc), mcp/llms-install.md, mcp/CHANGELOG.md

After any such change -> grep all surfaces, confirm zero mismatches. The npm package is installed by devs + shown in registries, so false claims there spread wider than the site.

Canon (verified 2026-09-11): 6 registrars, 3 signals, 53 tracked TLDs ("50+"), 60 s API edge cache, first answer under 0.5 s at p95 (cold visitor, US+EU benchmark), API first-time check about half a second / p95 under 0.9 s, cache hit ~0.1 s, npm domain-check-skills-mcp v1.2.11.

## 8. Deploy & verification workflow

- Code lands on GitHub main either through the Lovable agent or a direct push. **Nothing deploys on push:** edge functions deploy only through a Lovable build (a "redeploy only" message naming the function, ~0.5 credit), the frontend through Lovable's deploy_project. Lovable's `send_message` may time out while the build still completes — check `list_messages`.
- npm publish is manual, from a maintainer's machine: `cd mcp` (package.json name domain-check-skills-mcp, NOT the root vite_react_shadcn_ts); sync the version in package.json, server.json (two places), the `VERSION` constant in src/index.ts and CHANGELOG.md; `npm run build`; `npm login --auth-type=web` (browser login, no password in the terminal); `npm publish --provenance=false` under a real terminal — npm 11 then prints a `npmjs.com/auth/cli/…` link for the 2FA confirmation in the browser (no authenticator code needed). The tag-triggered CI workflow has never run (no NPM_TOKEN). The site reads the published version from the npm registry at build time.
- Verify a frontend deploy by bundle-hash change: curl -s https://digmyname.com/?cb=$RANDOM | grep -oE '/assets/index-[^"]*\.js'. Route components are code-split into lazy chunks not in raw HTML — only the main bundle hash is curl-verifiable.
- Verify a commit independently with get_diff on the SHA (more reliable than the agent's self-report).
- Concurrency guard: check list_messages before driving the agent — never run two agent sessions at once.
- Credit economy: each send_message = one paid Build. Batch all edits for a feature into ONE message; iterate flag values locally via read_file + bunx tsgo before dispatching; prefer read_file/query_database over builds; don't build for trivial changes.

## 9. MCP distribution status

- Official MCP Registry: live.
- Glama: approved — Tool Definition Quality A, Server Coherence A (the two weighted score components). Profile completion 83% (structural ceiling: "No recent usage" needs real traffic through Glama infra, can't be hand-fixed).
- mcpservers.org / PulseMCP: live.
- punkpeye/awesome-mcp-servers: awaiting maintainer merge.
- Cline / public-apis: submitted / review. cursor.directory: needs resubmit.

Glama scoring model: overall = Tool Definition Quality (70%) + Server Coherence (30%). TDQS per tool scored 1-5 on 6 axes (Purpose Clarity 25 / Usage Guidelines 20 / Behavioral Transparency 20 / Parameter Semantics 15 / Conciseness 10 / Contextual Completeness 10). Server score = 60% mean + 40% MIN TDQS — the single weakest tool caps it. Tiers: A >=3.5, B >=3.0. Requires a Glama Release (Docker build test) to enable scoring.

## 10. Current state & open items (as of 2026-08-08)

Functional backlog: essentially drained. Recent session commits (all deployed):
- c33eaab — rewrote all 4 MCP tool descriptions for Glama TDQS + version -> 1.2.6.
- 725e18c — README license badge -> correct repo.
- 781e09e — check-domains wall-clock budget + partialSink (P2 gap closed).
- bd2929d — removed dead TLDs code/startup; added freshness guard to /registrars (P3 A+B closed).

### Design-system unification + button system (2026-08-08, DEPLOYED to prod)

A Refero-referenced design-system pass ran across all non-homepage pages, plus a button-system fix. All deployed to prod (bundle index-DN8tOa8R.js).

- `ab45950` — PageKit primitives added: DataTable (grouped/numeric/sticky-blur table), CalloutBlock (inline/accent/centered CTA), FaqList; plus index.css `.table-head` + `.blur-chrome`.
- `0200a90` — Api endpoints list → DataTable; Mcp footer → CalloutBlock.
- `e8e42b5` — HowItWorks FAQ → FaqList + "For developers" → CalloutBlock; Speed claim section → CalloutBlock accent.
- `1fcdf4c` — Pricing "Cheapest per extension" summary table → DataTable.
- `c7f73b5` — Button system fix: gradient variant now BLACK text on the mint→violet gradient (was white, unreadable on the mint half); base weight font-medium → font-semibold; sizes normalized (sm/default/lg = 36/40/48px); `.btn-gradient` color white → hsl(232 28% 8%). Removed redundant per-page `[&_*]:text-black` hacks (Speed claim, LiveBenchmark).

Deliberately left bespoke (primitives didn't fit): HowItWorks comparison matrix, Speed benchmark bar grid, Pricing detailed per-registrar table.

### Award-tier visual redesign (Stages A–F landed in main, not yet deployed to prod)

**Status (2026-08-08):** Owner deploys the frontend manually, so these are in `main` but NOT yet on prod.
- **A+B** — commit `c5e4d58`: activated the squircle radius scale (fixed `borderRadius` mis-nested inside `colors` in tailwind.config — it was inert; `rounded-2xl` now 24px etc.); added `.mint-glow`/`.glass` utilities; removed DataTable row-divider lines + softened Stat/header dividers (Linear discipline, no heavy lines); bigger section rhythm (`mt-16 sm:mt-24`); button H-padding `px-5/6/8` + new `mint`/`ghost-mint` variants + at-rest mint-glow on `gradient`.
- **C** — this commit: dark-mode glass on card primitives (`.surface-card`/`-lg`/`.bento` → translucent + `backdrop-blur(12px)` + luminous top edge; light mode stays solid; live-search cards untouched — DomainCard uses `.card-hover`, not these); `CalloutBlock` accent gains a large borderless `iconVariant="hero"` slot + section-title → restores the big animated `LottieAward` on Speed (it had been crammed into a 24px chip).

- **FilterBar fix** — commit `25514055`: reverted Stage-A over-rounding on the filter pills + TLD capsules (`rounded-xl`), and gave the previously-transparent dropdown panels an opaque `blur-chrome` frosted background (hero aurora had bled through).
- **D** — this commit: the Speed "Reference numbers" table is now animated — bars grow and the latency + relative-% count up on scroll-into-view (IntersectionObserver, easeOutCubic, staggered ~130ms/row), mint-glow on our bars; `prefers-reduced-motion` shows final values instantly. Numbers/notes/labels unchanged (~170/~47/~70/~370 ms, cold vs cached distinct). Extracted to `src/components/BenchmarkChart.tsx`; LiveBenchmark (real live measurement) untouched. Also folded in 2 minor DomainSearch radius tweaks (search icon slot + view toggle).

- **E** — remaining bespoke sections under the system: HowItWorks comparison matrix (soft dividers + mint-lead DigMyName column) + Unverified highlight (`818b1ccb`); Pricing detailed per-registrar table (soft dividers + mint row-wash on the cheapest registrar) (this commit). Plus the FilterBar full redesign + Apple/Awwwards-tier polish (mint TLD names; glass panel matching the bar via un-nesting so its backdrop-blur works; capsule spring-entrance + hover-lift/mint-glow/press micro-interactions; 720px width; price-overflow fix) across `25514055`→`42c188cd`.
- **F** — homepage aurora made mint-lead (top-left hero spotlight → mint; stronger mint in the hero-bg gradient) (this commit); kept restrained since the hero was already strong.

Resolved (the three pre-stage-A questions): large radius first (real superellipse deferred to 1-2 key blocks); A+B merged into one build; reference set kept as-is.

### Redesign plan & stage reference (A–F)

Owner wants a genuine visual upgrade ("цукерка" / Awwwards-tier), not just the structural refactor above. The design-system unification moved structure but not enough aesthetics; owner reviewed it and wanted more visual impact. A full plan exists (owner's private DIGMYNAME_REDESIGN_PLAN.md). Reference-lock from Refero PRO: PRIMARY = Hyperliquid (deep-dark + mint accent, mint-glow elevation, our near-brand done at A+ level); DETAILS from Dimension (glass/backdrop-blur cards, large superellipse radii 24-42px "like Apple", elevation via blur not shadows); ATMOSPHERE from Active Theory (immersive award moody-dark). REJECT: serif headings, Hyperliquid's emerald canvas, fake 3D, averaging into generic. KEEP our brand: Sora font, violet-tinted dark canvas, mint→violet aurora — but make mint the lead accent and add discipline.

Planned stages (each = one build, verify get_diff+tsgo+vitest, preview, then next): A = tokens (squircle radius scale, glass/blur utilities, mint-glow, REMOVE solid row-divider lines per owner — Linear discipline without heavy lines, bigger section rhythm); B = buttons final (horizontal padding = 2× vertical on all sizes per owner; variant hierarchy gradient/mint/ghost-mint = owner's "different colors per context"); C = icon system + glass cards + FIX the Speed-claim Lottie regression (accent variant needs a large borderless icon slot, restore big animated award + section-title); D = Speed benchmark "вау" (animated bars, count-up live timer, mint-glow); E = remaining bespoke sections (comparison matrix, "What we're not", Unverified, Pricing detailed) under the system; F = homepage aurora amplification (optional). SACRED (never touched by redesign): search speed (no heavy effects on the live-search critical path — blur/glow only on static sections), all honesty rules (redesign amplifies honesty, never hides it), cross-surface consistency (redesign changes zero numbers/claims), backend/edge/API/MCP untouched. (Those three pre-stage-A questions are now resolved — see the status block above.)

Open (owner decides, all low priority):
- Legacy Domainr naming vs Fastly transport — intentionally left (pure cosmetic, not user-leaked, regression risk > benefit).
- ~~npm package.json description still has unhedged "~170ms/fastest"~~ — resolved in 1.2.11 (2026-09-11): every surface now quotes the measured figures.
- .co/.me flap on API/MCP path — by design (no RDAP, single slow Fastly authority).
- Glama "related servers" — owner-only admin action, optional, low ROI.
- Per-IP rate limiters are in-memory per isolate, and isolates are not reused — measured 2026-09-08: 66+ check-domains requests from one IP inside a minute, zero 429s. They only bite if the platform starts reusing isolates, so since 2026-09-10 they are sized so that day cannot break the site: `_shared/rate-limit.ts` (tested) counts DOMAINS with a request cap on top — check-domains 4000 domains + 600 requests / min / IP (an all-TLD search is 16 requests / 53 domains, 318 domains with AI variations), `/fast` has its own 10 000 domains + 1200 requests / min budget, and the documented 60 req/min stays for the API endpoints. A working shared-store limiter is still an open item if abuse ever matters.

Parked / future:
- Hosted SSE/Streamable-HTTP MCP endpoint for native Claude/ChatGPT connectors (needs OAuth 2.1).
- Deno Deploy migration as the cold-start fix (code is already Deno; $0 free tier). Not yet — cold-start self-resolves with traffic.
- Refero design-system pass (next major track): a single unified design system across all non-homepage pages (Api/Mcp/HowItWorks/Speed/Pricing) — modern info presentation, tables where they fit, animations, blur, interactivity. Built from Refero PRO references (Wise provider-comparison-table, Parallel per-section pricing). Sequencing rule: do the design pass only AFTER the functional/visual backlog is stable, so the rework isn't invalidated by later changes.

Cold-start note: Supabase edge isolates are effectively never reused (0–6 % warm, measured three ways 2026-08-12), so every request pays isolate boot plus a fresh TLS handshake to the registry (~105 ms to Verisign, ~560–600 ms to PIR / Identity Digital from eu-central). Keep-warm cron cannot fix that (it never hits the routed isolate).

### Warm-origin track (2026-09-10) — what was tried, what shipped

Owner goal: first answer ≤ 1 s "under any conditions", honest number, free means only. Measured and decided (decision doc in the owner's artifacts):
- Cloudflare Workers / Durable Object as the registry client — **dead**: all Workers share an egress IP pool, so Identity Digital answers 429 (error 1015) from some colos, rdap.org 403, and new connections to Verisign take 480–800 ms with 2–6 s outliers. Probe worker deployed and deleted the same day.
- Railway always-on process — rejected by the owner (paid). Free always-on VM with its own IP (Oracle Always Free Frankfurt / GCP e2-micro) — parked; would need the owner to open the account.
- **Shipped instead: the browser lane (§3)** — no infrastructure, first answer p95 386 ms US / 485 ms EU.
- Still open, free: run the `domain_cache` read in parallel with the probes inside `checkDomains` (owner go pending).

## 11. How to work on this (quick protocol for any new session)

1. Read this doc + the private STATE / BACKLOG / CHANGELOG.
2. Before editing: read_file the actual code at an explicit commit ref — never edit from memory.
3. Check list_messages for concurrent sessions.
4. Batch edits into one send_message; typecheck with bunx tsgo; tests are vitest under src/.
5. After every landed change: verify with get_diff, smoke-test live, then journal (STATE + CHANGELOG + BACKLOG) AND update this document if the change is architectural — immediately, in the same session. Sessions can die mid-way.
6. Respect the honesty rules and cross-surface consistency rule above — they're identity, not style.
