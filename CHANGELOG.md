# Changelog

All notable changes to DigMyName.

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
