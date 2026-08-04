# domain-check-skills-mcp

[![npm version](https://img.shields.io/npm/v/domain-check-skills-mcp?color=145DFB&label=npm&style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![downloads](https://img.shields.io/npm/dm/domain-check-skills-mcp?color=145DFB&style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![provenance](https://img.shields.io/badge/npm-provenance-145DFB?style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![license](https://img.shields.io/npm/l/domain-check-skills-mcp?style=flat-square)](./LICENSE)

## ⚡ The world's fastest domain availability MCP server

Not "one of the fastest". **The fastest.** Typical answer lands in **~100 ms**, and the whole pipeline is published openly — debounce → parallel authoritative DNS → RDAP → hot cache. Found something faster? [Dispute it](https://digmyname.com/speed) and we'll put it on the page ourselves.

MCP server to check domain availability from any LLM — Claude, Cursor, Windsurf, Continue, Zed. 7 registrars, 52 TLDs. Powered by [DigMyName](https://digmyname.com).

| | |
| --- | --- |
| Typical latency | **~100 ms** (cache-warm), ~200–400 ms cold |
| Method | Published at [digmyname.com/speed](https://digmyname.com/speed) |
| Coverage | 7 registrars · 52 TLDs |
| Cost | Free — no API key, no account |

![domain-check-skills-mcp in action](https://digmyname.com/mcp-demo.svg)

## Install

Claude Code — one line:

```bash
claude mcp add domain-check -- npx -y domain-check-skills-mcp
```

Claude Desktop / Cursor / Windsurf — add to your MCP config:

```json
{
  "mcpServers": {
    "domain-check": {
      "command": "npx",
      "args": ["-y", "domain-check-skills-mcp"]
    }
  }
}
```

Continue (`~/.continue/config.json`):

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      { "transport": { "type": "stdio", "command": "npx", "args": ["-y", "domain-check-skills-mcp"] } }
    ]
  }
}
```

Zed (`settings.json`):

```json
{
  "context_servers": {
    "domain-check": {
      "command": { "path": "npx", "args": ["-y", "domain-check-skills-mcp"] }
    }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "domain-check": { "type": "stdio", "command": "npx", "args": ["-y", "domain-check-skills-mcp"] }
  }
}
```

No API key, no account, no config — it works right after install.

## Tools

| Tool | Description |
| --- | --- |
| `check_domain` | Availability, premium / likely-premium flags, cheapest registrar, direct buy link and registration year (when taken) for one domain. |
| `search_domains` | One name across many TLDs at once (defaults to a curated set of 12). Includes availability, price, buy link and registration year for taken results. |
| `compare_registrars` | Registration, renewal and 3-year totals per registrar for a TLD. |
| `get_domain_age` | Registration year and expiration date for a taken domain via RDAP. |

## Example prompts

- "Is `acme.io` available and where is it cheapest?"
- "Check `nebula` across com, io, ai, dev and app."
- "Compare registrar prices for `.ai`."
- "When was `stripe.com` registered?"

## How it works

Availability is resolved through an **authoritative-first** chain — RDAP (IANA bootstrap), authoritative DNS, Domainr and registrar APIs. Anything unresolved is returned as `UNKNOWN` rather than falsely reported as taken. Premium candidates are flagged separately so agents never quote a standard retail price for a registry-premium name.

Pricing comes from DigMyName's registrar price cache across 7 registrars and 52 TLDs.

Domain age is read from registry RDAP endpoints.

Rate limit: 60 requests / minute / IP.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `DIGMYNAME_API_BASE` | DigMyName public API | Point at a self-hosted API instance. |

## Releasing (maintainers)

Releases are published from CI with npm provenance:

```bash
# after bumping the version in mcp/package.json
git tag mcp-v1.1.6 && git push origin mcp-v1.1.6
```

The `Publish MCP to npm` workflow builds, smoke-tests and publishes with `--provenance`. It needs an `NPM_TOKEN` (automation token) repo secret.

## Requirements

Node.js 18+

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). Current version: **1.1.6**.

## License

MIT
