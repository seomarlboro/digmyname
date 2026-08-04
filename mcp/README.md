# domain-check-skills-mcp

[![npm version](https://img.shields.io/npm/v/domain-check-skills-mcp?color=145DFB&label=npm&style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![downloads](https://img.shields.io/npm/dm/domain-check-skills-mcp?color=145DFB&style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![license](https://img.shields.io/npm/l/domain-check-skills-mcp?style=flat-square)](./LICENSE)

**The fastest domain availability MCP server on the internet.** If you find a faster one — [dispute it](https://digmyname.com/speed).

MCP server that gives any AI agent **real-time domain availability**, **registrar price comparison** and **domain age lookup**, powered by [DigMyName](https://digmyname.com).

Typical first answer lands in **~100–200 ms** end-to-end (cache-warm). We publish the method with the claim — see [digmyname.com/speed](https://digmyname.com/speed).

No API key. No account. Free.

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

## Requirements

Node.js 18+

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). Current version: **1.1.2**.

## License

MIT
