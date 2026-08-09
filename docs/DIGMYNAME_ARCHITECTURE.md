# DigMyName — Architecture & State Protocol

> **This is the living source-of-truth for DigMyName.** It must be kept current: any architectural change, new decision, or shift in what we're building gets reflected here in the SAME commit. Read it in full at the start of any work session. It is written so a human OR an AI agent with zero prior knowledge can understand how the system works, why it's built this way, what's live, and where the weak spots are — enough that a fresh chat can run a full review from this document alone. Last verified: 2026-08-08.

## 1. What the product is

**DigMyName** (digmyname.com) is a domain-availability + registrar-pricing SaaS. It answers two questions for any domain name:

1. **Is it available?** — verified against three independent signals, with an honest *Unverified* state when they disagree instead of guessing.
2. **Where is it cheapest?** — price comparison across 6 registrars, exposing the renewal traps that cheap first-year promos hide.

It ships three surfaces: the **website**, a free **no-auth JSON API** (for scripts/agents), and an **MCP server** on npm (so any LLM — Claude, Cursor, Windsurf, Continue, Zed — can check domains directly).

**Owner:** Kir. Solo operator. Terse, technical. Prefers decisive action over clarifying questions.

## 2. The stack (physical layout)

| Layer | Tech | Where |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui | Lovable-managed, project_id 3705f2e7-ed58-4590-993e-64df5ef13df4 |
| Backend logic | Supabase Edge Functions (Deno) | Supabase project ref ifamsapmecefkyspmojb |
| Database | Supabase Postgres + RLS | same project |
| Edge cache | Cloudflare Worker (60s TTL) | api.digmyname.com fronts the Supabase functions |
| MCP package | domain-check-skills-mcp (npm, stdio) | published from mcp/ subfolder |

**Repos:** github.com/seomarlboro/digmyname — main, Lovable-managed (the agent commits here directly; edge functions auto-deploy on commit). GitHub username is canonically lowercase `seomarlboro` — directory scanners 404 on the capitalized form.

**Critical Supabase gotcha:** the real DB is ref ifamsapmecefkyspmojb under org "seomarlboro@gmail.com's Org" — NOT the empty decoy project literally named "DigMyName". Sanity check: `select count(*) from registrar_prices` ~= 165+.

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

1. L1 hot cache (per-isolate, in-memory, 10 min) — zero network.
2. L2 DB cache (domain_cache table, tiered TTL) — skips network probes.
3. Pass 1 — free authoritative sources (RDAP + DNS) run in parallel per domain; each publishes its verdict into partialSink the moment it lands.
4. Pass 2 — the third signal (Fastly) fires ONLY where it adds value (premium suspects, brand-blocked names).
5. Aftermarket NS detection — registered names on Sedo/Dan/Afternic/etc. get a resale listing link.
6. Price enrichment — Porkbun public catalog + registrar_prices DB rows.
7. Cache write — only trustworthy verdicts, background via EdgeRuntime.waitUntil.

### Wall-clock budget + partial results (both paths)

Each wrapper races the pipeline against a hard budget. On timeout it serves whatever resolved (from partialSink) and stamps only the still-unresolved domains with an honest budget_timeout (uncertain — OUR budget expired, NOT a registry failure; never shown available, never cached).

- public-api: hardBudgetMs 900ms (core) / 1000ms (.co/.me); Fastly deadline 650/780ms.
- check-domains: HARD_BUDGET_MS 8000ms; Fastly window 6000ms.

## 4. The .co / .me problem (a permanent architectural constraint)

.co and .me have NO working public RDAP: not in the IANA bootstrap; rdap.nic.co is dead; rdap.org actively LIES (returns 404 even for registered .co names — verified live). So AGGREGATOR_UNRELIABLE_TLDS = {co, me}: a 404 from the aggregator on these zones is downgraded to unknown, never read as available.

Consequence: .co/.me ALWAYS escalate to Fastly (the only authority), so they "flap" (available <-> Check price) purely on whether Fastly beats the deadline on a cold isolate.

This CANNOT be fixed at the speed layer — there is no faster authority. Solved at the UX layer: a 5-minute frontend session cache (DomainSearch.tsx, resultCacheRef) that caches only trustworthy verdicts so returning to a just-checked name shows the confirmed verdict instantly instead of re-flapping. The authoritative check still fires; the cache is for instant display, not for skipping verification.

.fm/.ly/.sh have the same problem (ccTLD, no RDAP) -> deliberately NOT added. .co stays (too valuable; flap killed by the cache).

## 5. Pricing subsystem

- 6 registrars: Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, OVHcloud.
- registrar_prices table (~165 rows, 50 TLDs). Columns: reg_price / renew_price / transfer_price, supported (bool), updated_at, verified_at.
- Scraper (fetch-registrar-prices, weekly cron Sun 04:00): TLDSpy per-registrar pages for core TLDs, then two no-auth catalog gap-fillers for long-tail — Porkbun public catalog (primary, ~627 TLDs) + Cloudflare wholesale JSON (backup). Each wrapped in try/catch so one source failing never breaks the run.
- Freshness: prices older than STALE_PRICE_MAX_DAYS = 60 fall through to an honest "Check price" instead of a stale number. Enforced on /check, /search (via cheapestForTlds()) AND /registrars. A separate 21-day auto-quarantine flips supported=false on rows not re-verified.
- Pricing model on the site is cheapest-by-action: 4 independent columns (Cheapest register / renew / transfer / Best 3-year value), each showing its own cheapest registrar — no cross-registrar splicing.

Known constraint: Claude's cloud container is geo/Cloudflare-blocked from Porkbun/Namecheap/Spaceship/TLDSpy. Edge functions reach them fine. Verify pricing via prod /check or query_database, NOT local curl.

## 6. Honesty rules (owner-mandated, non-negotiable)

These are product identity, not preferences. Breaking any is a defect:

- Never unhedged "fastest" — always pair with a dispute mechanism / live timer.
- Cold vs cached latency kept distinct — never present a ~70ms cache figure as the typical first answer.
- Uncertain availability: never cached, never shown as available.
- Never show a price without a fresh, trusted DB row (supported=true, within 60 days).
- Brand-protected / sldBlocked names -> uncertain:true, uncertainReason:"brand_protected" on all paths; never fall through to available.

## 7. Cross-surface consistency rule (owner-mandated)

Any number / count / claim (registrar count, TLD count, latency, signal names) changed in one place MUST be updated identically across ALL surfaces:

- Website: Index / Api / Mcp / HowItWorks / Speed / Pricing + components
- Repo: README.md, public/llms.txt, index.html static crawler block
- npm: mcp/README.md, mcp/package.json desc, mcp/server.json (x2 version + desc), mcp/llms-install.md, mcp/CHANGELOG.md

After any such change -> grep all surfaces, confirm zero mismatches. The npm package is installed by devs + shown in registries, so false claims there spread wider than the site.

Canon (verified against live API + npm): 6 registrars, 3 signals, 50+ TLDs, 60s edge cache, npm domain-check-skills-mcp v1.2.6.

## 8. Deploy & verification workflow

- Edits go through the Lovable agent, which commits directly to GitHub main. Edge functions auto-deploy on commit. Frontend can be deployed via deploy_project.
- npm publish is manual (owner runs it): cd mcp (confirm package.json name is domain-check-skills-mcp, NOT the root vite_react_shadcn_ts), npm run build, npm publish. Version must exceed the currently-published one.
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

### Award-tier visual redesign (IN PROGRESS — Stages A–D landed in main, not yet deployed to prod)

**Status (2026-08-08):** Owner deploys the frontend manually, so these are in `main` but NOT yet on prod.
- **A+B** — commit `c5e4d58`: activated the squircle radius scale (fixed `borderRadius` mis-nested inside `colors` in tailwind.config — it was inert; `rounded-2xl` now 24px etc.); added `.mint-glow`/`.glass` utilities; removed DataTable row-divider lines + softened Stat/header dividers (Linear discipline, no heavy lines); bigger section rhythm (`mt-16 sm:mt-24`); button H-padding `px-5/6/8` + new `mint`/`ghost-mint` variants + at-rest mint-glow on `gradient`.
- **C** — this commit: dark-mode glass on card primitives (`.surface-card`/`-lg`/`.bento` → translucent + `backdrop-blur(12px)` + luminous top edge; light mode stays solid; live-search cards untouched — DomainCard uses `.card-hover`, not these); `CalloutBlock` accent gains a large borderless `iconVariant="hero"` slot + section-title → restores the big animated `LottieAward` on Speed (it had been crammed into a 24px chip).

Resolved (the three pre-stage-A questions): large radius first (real superellipse deferred to 1-2 key blocks); A+B merged into one build; reference set kept as-is.

### Next major track: award-tier visual redesign (PLANNED, not started)

Owner wants a genuine visual upgrade ("цукерка" / Awwwards-tier), not just the structural refactor above. The design-system unification moved structure but not enough aesthetics; owner reviewed it and wanted more visual impact. A full plan exists (owner's private DIGMYNAME_REDESIGN_PLAN.md). Reference-lock from Refero PRO: PRIMARY = Hyperliquid (deep-dark + mint accent, mint-glow elevation, our near-brand done at A+ level); DETAILS from Dimension (glass/backdrop-blur cards, large superellipse radii 24-42px "like Apple", elevation via blur not shadows); ATMOSPHERE from Active Theory (immersive award moody-dark). REJECT: serif headings, Hyperliquid's emerald canvas, fake 3D, averaging into generic. KEEP our brand: Sora font, violet-tinted dark canvas, mint→violet aurora — but make mint the lead accent and add discipline.

Planned stages (each = one build, verify get_diff+tsgo+vitest, preview, then next): A = tokens (squircle radius scale, glass/blur utilities, mint-glow, REMOVE solid row-divider lines per owner — Linear discipline without heavy lines, bigger section rhythm); B = buttons final (horizontal padding = 2× vertical on all sizes per owner; variant hierarchy gradient/mint/ghost-mint = owner's "different colors per context"); C = icon system + glass cards + FIX the Speed-claim Lottie regression (accent variant needs a large borderless icon slot, restore big animated award + section-title); D = Speed benchmark "вау" (animated bars, count-up live timer, mint-glow); E = remaining bespoke sections (comparison matrix, "What we're not", Unverified, Pricing detailed) under the system; F = homepage aurora amplification (optional). SACRED (never touched by redesign): search speed (no heavy effects on the live-search critical path — blur/glow only on static sections), all honesty rules (redesign amplifies honesty, never hides it), cross-surface consistency (redesign changes zero numbers/claims), backend/edge/API/MCP untouched. (Those three pre-stage-A questions are now resolved — see the status block above.)

Open (owner decides, all low priority):
- Legacy Domainr naming vs Fastly transport — intentionally left (pure cosmetic, not user-leaked, regression risk > benefit).
- npm package.json description still has unhedged "~170ms/fastest" — defer to next content MCP bump.
- .co/.me flap on API/MCP path — by design (no RDAP, single slow Fastly authority).
- Glama "related servers" — owner-only admin action, optional, low ROI.

Parked / future:
- Hosted SSE/Streamable-HTTP MCP endpoint for native Claude/ChatGPT connectors (needs OAuth 2.1).
- Deno Deploy migration as the cold-start fix (code is already Deno; $0 free tier). Not yet — cold-start self-resolves with traffic.
- Refero design-system pass (next major track): a single unified design system across all non-homepage pages (Api/Mcp/HowItWorks/Speed/Pricing) — modern info presentation, tables where they fit, animations, blur, interactivity. Built from Refero PRO references (Wise provider-comparison-table, Parallel per-section pricing). Sequencing rule: do the design pass only AFTER the functional/visual backlog is stable, so the rework isn't invalidated by later changes.

Cold-start note: Supabase edge isolates sleep on idle -> first search after idle ~2.5-6s; warm ~450ms. Keep-warm cron is ineffective (multiple isolate instances). Platform trait, self-resolves with traffic. Real fix if ever needed: Deno Deploy or CF Workers.

## 11. How to work on this (quick protocol for any new session)

1. Read this doc + the private STATE / BACKLOG / CHANGELOG.
2. Before editing: read_file the actual code at an explicit commit ref — never edit from memory.
3. Check list_messages for concurrent sessions.
4. Batch edits into one send_message; typecheck with bunx tsgo; tests are vitest under src/.
5. After every landed change: verify with get_diff, smoke-test live, then journal (STATE + CHANGELOG + BACKLOG) AND update this document if the change is architectural — immediately, in the same session. Sessions can die mid-way.
6. Respect the honesty rules and cross-surface consistency rule above — they're identity, not style.
