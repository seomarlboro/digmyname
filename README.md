# DigMyName

**The fastest domain search — or the second. Dispute it.** Free, honest domain availability checks across 52 TLDs with 7-registrar price comparison.

## Links

- Website: https://digmyname.com
- Free API: https://digmyname.com/api
- MCP server: https://digmyname.com/mcp (npm: [`domain-check-skills-mcp`](https://www.npmjs.com/package/domain-check-skills-mcp))
- Speed benchmark: https://digmyname.com/speed

## What it does

DigMyName checks domain availability in real time across 52 TLDs. Availability is cross-checked against three independent signals — RDAP (resolved via the IANA bootstrap registry), DNS-over-HTTPS (Cloudflare, hedged with Google), and Domainr — and when they disagree we show an honest **Unverified** state instead of guessing. Pricing comes from Porkbun's live catalog.

On top of availability you get side-by-side registrar pricing for 7 registrars, including the renewal traps that first-year promo prices hide (a $1 registration that renews at $61 is not a deal). Everything is also exposed through a free, no-auth JSON API for agents, plus an MCP server so any LLM — Claude, Cursor, Windsurf, Continue, Zed — can check domains directly.

## Speed

**~170 ms** typical first answer · **~370 ms median** full pipeline (availability + premium + pricing), **p95 under 1 second**. Measured Aug 2026, single datacenter; your numbers vary by network/TLD/cache — see [digmyname.com/speed](https://digmyname.com/speed).

## Tech stack

- Vite
- React
- TypeScript
- shadcn/ui
- Tailwind CSS
- Supabase edge functions (Deno)

## Development

The only requirement is having Node.js & npm installed — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
# Step 1: Clone the repository.
git clone https://github.com/Seomarlboro/digmyname.git

# Step 2: Navigate to the project directory.
cd digmyname

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```



## License

MIT. The `mcp/` package is published under MIT as well.

## Built with Lovable

DigMyName is built and shipped with [Lovable](https://lovable.dev). If you want to try it, this is a **referral link** — signing up through it gives *you* free Lovable credits and supports DigMyName's development at no cost to you: **https://lovable.dev/invite/8W3RM72**

(Prefer no referral? Just go to [lovable.dev](https://lovable.dev) directly.)
