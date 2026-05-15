# Changelog

All notable changes to DigMyName.

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
