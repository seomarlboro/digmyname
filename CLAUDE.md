# CLAUDE.md — Working guidance for AI agents on DigMyName

This file guides AI agents (Claude Code, Lovable, etc.) contributing to DigMyName. Follow these principles.

## Brand voice — honest by default

- DigMyName's positioning is **honest speed**. Never make an unhedged superlative claim. "Fastest" must always be paired with a hedge the reader can act on — e.g. "or the second — dispute it", or a live timer/benchmark.
- Never present a best-case number as typical. Keep cold vs cached numbers distinct: first/cold answers and cached/repeat answers are different figures and must be labelled as such.
- Never advertise a cache figure (e.g. a fast repeat-lookup time) as the first-answer or typical latency.

## Verify before you claim (especially in public files)

- Any factual claim that goes into a public artifact (README, package descriptions, marketing copy, server manifests) MUST be verified against the actual code or a real measurement first. Do not write technical claims from memory.
- Latency numbers come only from a benchmark run (`scripts/bench/first-answer.mjs`, or the `bench-first-answer` workflow for a US runner) and are quoted with their conditions: date, client location, sample size, percentile. The current public figure is "first answer under 0.5 s at p95 for a cold visitor" (150 fresh browsers each from the US and the EU, 10 September 2026).
- Example: statements about how availability is checked, how many data sources exist, or which providers are used must match the pipeline code before being published.
- When unsure, read the source. A wrong claim in a public repo damages the honest-brand more than a missing one.

## Public-file safety checklist

Before editing any file that outsiders can see (this repo is public), check:
- **Leak?** No internal IDs, editor/project URLs, keys, tokens, or infrastructure hostnames.
- **Asked for?** Only make the change requested. Do not add extra links, sections, or "improvements" that weren't requested.
- **Useful to outsiders?** Internal workflow/deploy notes don't belong in a public README.
- **Fix the root, not the symptom.** If a section is unwanted, remove the whole section, not just one line inside it.

## Technical guardrails — do NOT change without explicit instruction

- **Keep-warm cron** must stay pointed at the direct origin (not routed through the edge cache) to avoid burning edge-cache quota.
- **The direct origin API URL must stay alive permanently** — older MCP installs depend on it. Never remove or repurpose it.
- **The site must stay DNS-only to the host** (do not proxy the apex through a CDN in a way that breaks the host's custom-domain handling).
- **Uncertain / unverified availability results are never cached** and never presented as "available". On conflict between sources, show an honest Unverified state.
- Cache TTLs and stale-while-revalidate windows are deliberate — don't change them without being asked.
- **Browser lane rules** (`src/lib/browserLane.ts`): the browser may show *taken* on registry RDAP 200 or DNS records, and *available* only on RDAP 404 + NXDOMAIN — never for a 1–5 character label (premium suspect) or a brand-blocked label. A browser verdict is provisional: the edge verdict overwrites it and only the edge verdict is cached. Only registries with verified CORS go in the table, and every entry must match the edge's `FAST_RDAP` (a test enforces it).

## Availability logic (ground truth)

- Availability is cross-checked against three independent signals: RDAP (resolved via the IANA bootstrap registry, with a fast-path table for popular TLDs and the public aggregator as fallback), DNS-over-HTTPS (Cloudflare primary, hedged with Google), and Domainr (Fastly Domain Research). For the popular TLDs the visitor's browser runs the first two itself as a provisional first answer; the edge stays the authority.
- Pricing is separate. The weekly `fetch-registrar-prices` run reads tld-list.com's API when `TLDLIST_API_PUBLIC` / `TLDLIST_API_PRIVATE` are configured; otherwise the registrars' own catalogs and pages (Porkbun catalog, OVHcloud pages, GoDaddy pages via Firecrawl, tldspy) fill the table. Rows not re-verified within 30 days are quarantined; the API stops showing prices older than 60 days.
- Never conflate pricing sources with availability sources when describing how the product works.

## Versioning

- Bump the relevant package version when changing a published artifact (the npm MCP package, etc.), and keep any manifest/version fields in sync with the published version.

## Deployment note

- Publishing (site + edge functions) and npm publishes are done manually by the owner. Agents commit code; they do not assume a deploy has happened.
- A git push does not deploy edge functions: only a Lovable build does. The frontend is deployed from Lovable as well.
- npm publish for `mcp/` runs locally with npm's web-based login and 2FA prompt (`npm publish --provenance=false` under a terminal); before publishing keep `package.json`, `server.json` (two places), the `VERSION` constant in `src/index.ts` and `CHANGELOG.md` in sync.
