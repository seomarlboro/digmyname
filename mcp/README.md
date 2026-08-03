# domain-check-skills-mcp

[![npm version](https://img.shields.io/npm/v/domain-check-skills-mcp?color=145DFB&label=npm&style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![downloads](https://img.shields.io/npm/dm/domain-check-skills-mcp?color=145DFB&style=flat-square)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![license](https://img.shields.io/npm/l/domain-check-skills-mcp?style=flat-square)](./LICENSE)

MCP server that gives any AI agent **real-time domain availability** and **registrar price comparison**, powered by [DigMyName](https://digmyname.com).

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
| `check_domain` | Availability, premium flags, cheapest registrar and a direct buy link for one domain. |
| `search_domains` | One name across many TLDs at once (defaults to a curated set of 12). |
| `compare_registrars` | Registration, renewal and 3-year totals per registrar for a TLD. |

## Example prompts

- "Is `acme.io` available and where is it cheapest?"
- "Check `nebula` across com, io, ai, dev and app."
- "Compare registrar prices for `.ai`."

## How it works

Availability is resolved through a multi-source chain — RDAP (IANA bootstrap), authoritative DNS, Domainr and registrar APIs — so results are never guessed. Anything unresolved is returned as `UNKNOWN` rather than falsely reported as taken.

Pricing comes from DigMyName's registrar price cache across 7 registrars and 52 TLDs.

Rate limit: 60 requests / minute / IP.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `DIGMYNAME_API_BASE` | DigMyName public API | Point at a self-hosted API instance. |

## Requirements

Node.js 18+

## License

MIT
