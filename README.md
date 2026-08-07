# DigMyName

[![npm version](https://img.shields.io/npm/v/domain-check-skills-mcp?color=6d28d9&label=npm&logo=npm)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![npm downloads](https://img.shields.io/npm/dm/domain-check-skills-mcp?color=10b981&label=downloads)](https://www.npmjs.com/package/domain-check-skills-mcp)
[![license MIT](https://img.shields.io/badge/license-MIT-2563eb)](https://github.com/seomarlboro/domain-check-skills)
![MCP compatible](https://img.shields.io/badge/MCP-compatible-7c3aed)
![free, no API key](https://img.shields.io/badge/free-no%20API%20key-16a34a)

**The fastest domain search — or the second. Dispute it.** Free, honest domain availability checks across 50 TLDs with 6-registrar price comparison.

## Links

- Website: https://digmyname.com
- Free API: https://digmyname.com/api
- MCP server: https://digmyname.com/mcp (npm: [`domain-check-skills-mcp`](https://www.npmjs.com/package/domain-check-skills-mcp))
- Speed benchmark: https://digmyname.com/speed

## What it does

DigMyName checks domain availability in real time across 50 TLDs. Availability is cross-checked against three independent signals — RDAP (resolved via the IANA bootstrap registry), DNS-over-HTTPS (Cloudflare, Google and AdGuard, hedged), and Fastly Domain Research — and when they disagree we show an honest **Unverified** state instead of guessing. Pricing comes from Porkbun's live catalog.

On top of availability you get side-by-side registrar pricing for 6 registrars, including the renewal traps that first-year promo prices hide (a $1 registration that renews at $61 is not a deal). Everything is also exposed through a free, no-auth JSON API for agents, plus an MCP server so any LLM — Claude, Cursor, Windsurf, Continue, Zed — can check domains directly.

## Speed

**~170 ms** typical first answer · **~370 ms typical** full pipeline (availability + premium + pricing). Everyday numbers from a single datacenter, Aug 2026 — not a lab result, the on-screen stopwatch is the live proof; your numbers vary by network/TLD/cache — see [digmyname.com/speed](https://digmyname.com/speed).

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
