# Changelog

All notable changes to `domain-check-skills-mcp`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-08-05

### Changed
- Default API endpoint moved to `https://api.digmyname.com` — a Cloudflare edge cache (60s TTL) in front of the domain API. Repeat lookups are now served from the edge in ~10ms with no cold-start tail. The direct Supabase endpoint still works and can be forced via `DIGMYNAME_API_BASE`.

## [1.1.9] — 2026-08-05

### Changed
- docs: full-pipeline latency updated to measured ~370 ms median / p95 < 1s.

## [1.1.8] — 2026-08-05

### Changed
- docs: honest speed numbers in README (~170 ms first answer, 0.4–1.6 s full pipeline) to match digmyname.com/speed; no code changes.

## [1.1.7] — 2026-08-05

### Changed
- perf: `check_domain` skips the `/age` lookup for available or uncertain domains (one less round-trip on the common path).
- Robust retries: typed `ApiError` carrying the HTTP status — retry only on transport errors, 429 and 5xx.
- Tiered client cache: availability 30s, registrar pricing 6h, domain age 24h.
- Single `VERSION` constant used for the user agent, server version and startup log.

## [1.1.6] — 2026-08-04

### Added
- README demo image showing a real `search_domains` run (available / premium / taken + latency badge).
- Copy-paste install snippets for Continue, Zed and VS Code alongside Claude Code, Claude Desktop, Cursor and Windsurf.

## [1.1.5] — 2026-08-04

### Added
- npm **provenance**: releases are now built and published from GitHub Actions (`.github/workflows/publish-mcp.yml`), giving the package a verified provenance badge on npm.
- `publishConfig` with `access: public` and `provenance: true`.
- CI smoke test that boots the server over stdio before publishing.

### Fixed
- `repository` / `bugs` now point at the real source repo (`Seomarlboro/digmyname`, directory `mcp`) so npm renders the README, issues link and source view correctly.

## [1.1.4] — 2026-08-04

### Changed
- Package description now leads with the speed claim: "The world's fastest domain availability MCP server — ~100 ms checks from any LLM… Think something is faster? Dispute it."
- README rewritten with a speed benchmark table and the published-method link (digmyname.com/speed).
- Added `domain-search`, `windsurf` and `fastest` keywords for npm discovery.
- Bumped server version to 1.1.4.

## [1.1.3] — 2026-08-04

### Changed
- Updated package description to clarify supported clients and coverage: "MCP server to check domain availability from any LLM — Claude, Cursor, Windsurf, Continue. 7 registrars, 52 TLDs. Powered by DigMyName."
- Bumped server version to 1.1.3.

## [1.1.2] — 2026-08-04

### Changed
- README and package description now lead with the speed claim: "The fastest domain availability MCP server on the internet. If you disagree — dispute it."
- Bumped server version to 1.1.2.

## [1.1.1] — 2026-08-04

### Added
- In-memory TTL cache for API responses (default 30s, configurable via `DIGMYNAME_CACHE_TTL_MS`).
- Exponential backoff retry for transient network errors and HTTP 429 rate limits.
- Domain input normalization: strips `www.`, `https://`, trailing paths and ports.

### Changed
- Bumped server version to 1.1.1.

## [1.1.0] — 2026-08-04

### Added
- `get_domain_age` — returns registration year and expiration date for taken domains via RDAP.
- `check_domain` and `search_domains` now include `registered since [year]` for taken domains.
- Results explicitly separate `UNKNOWN` (no conclusive signal) from `TAKEN`/`AVAILABLE`.
- `likely_premium` results now carry a warning that the real registry price may differ from cached retail pricing.

### Changed
- Bumped server and API client version to 1.1.0.
- `search_domains` description now correctly references the `query` parameter.

## [1.0.0] — 2026-08-03

First stable release.

### Added
- `check_domain` — availability, premium / likely-premium flags, cheapest registrar and a direct buy link for a single domain.
- `search_domains` — one name across many TLDs in a single call (defaults to a curated set of 12).
- `compare_registrars` — registration, renewal and 3-year totals per registrar for a TLD.
- `buy_url` / `register_url` in results, with UTM attribution.
- `DIGMYNAME_API_BASE` env var to point the server at a self-hosted API instance.
- Graceful handling of HTTP 429 (rate limit) and `UNKNOWN` results instead of falsely reporting a domain as taken.
- MIT license, `files` allowlist, `engines: node >= 18`.

## [0.1.0] — 2026-08-03

- Initial preview release.

[1.1.3]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.3
[1.1.2]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.2
[1.1.1]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.1
[1.1.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.0
[1.0.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.0.0
[0.1.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/0.1.0
