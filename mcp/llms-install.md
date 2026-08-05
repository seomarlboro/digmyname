# Installing domain-check-skills-mcp

Free MCP server for domain availability, registrar pricing and domain age. **No API key, no account, no auth.**

## One-line install

```bash
npx -y domain-check-skills-mcp
```

Claude Code:

```bash
claude mcp add domain-check -- npx -y domain-check-skills-mcp
```

## MCP client config

Add this to your MCP client configuration (Claude Desktop, Cursor, Windsurf, Cline, VS Code):

```json
{
  "mcpServers": {
    "domain-check-skills": {
      "command": "npx",
      "args": ["-y", "domain-check-skills-mcp"]
    }
  }
}
```

Transport: `stdio`. Requires Node.js 18+.

## Tools

| Tool | Description |
| --- | --- |
| `check_domain` | Check one domain: availability, premium flags, cheapest registrar, buy link, registration year. |
| `search_domains` | Check one name across many TLDs at once (defaults to a curated set of 12). |
| `compare_registrars` | Compare registration, renewal and 3-year totals across 7 registrars for a TLD. |
| `get_domain_age` | Registration year and expiration date for a taken domain via RDAP. |

## Configuration

| Env var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DIGMYNAME_API_BASE` | No | `https://api.digmyname.com/functions/v1/public-api` | Override the API endpoint (e.g. to bypass the edge cache or self-host). |

No credentials are needed. Rate limit: 60 requests / minute / IP.

## Verify the install

Ask your assistant: "Is acme.io available and where is it cheapest?"
