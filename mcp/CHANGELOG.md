# Changelog

All notable changes to `domain-check-skills-mcp`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/1.0.0
[0.1.0]: https://www.npmjs.com/package/domain-check-skills-mcp/v/0.1.0
