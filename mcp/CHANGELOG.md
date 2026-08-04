# Changelog

All notable changes to `domain-check-skills-mcp`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.2]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.2
[1.1.1]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.1
[1.1.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.1.0
[1.0.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.0.0
[0.1.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/0.1.0
