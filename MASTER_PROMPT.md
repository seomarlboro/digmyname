# DigMyName — Project Context

## Overview

DigMyName is a fast domain name search engine monetized through affiliate registrar links. Authenticated users get personalized features (favorites).

## Tech Stack

- **Frontend:** React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui · Lucide icons
- **Backend:** Supabase (Edge Functions + PostgreSQL)
- **Libraries:** TanStack Query · react-router-dom · next-themes · @lovable.dev/cloud-auth-js
- **Auth providers:** Email, Google, Apple

## Features

### Domain Search

- Checks availability across 52+ TLDs via `check-domains` Edge Function (DNS + RDAP fallback)
- Results cached in `domain_cache` table (6h TTL)
- AI prefix suggestions toggle: get, my, the, app, pro
- Two display modes: Cards and Compact list
- Stats bar: total found, available (green), taken

### Price Comparison

- 7 registrars: Cloudflare, GoDaddy, OVHcloud, Google Domains, Porkbun, Spaceship, Namecheap
- "Best 3-Year Value" calculation
- Weekly scrape (Monday 06:00 UTC) from tldspy.com via `fetch-registrar-prices` Edge Function + Firecrawl
- Stored in `registrar_prices` table

### Monetization

- Affiliate URLs per registrar, prioritizing cheapest option
- Unauthenticated users see sign-up prompt when saving favorites

### Favorites

- Authenticated users can save domains to favorites
- Dedicated `/favorites` page for viewing and managing saved domains

## Database

| Table | Purpose | Access |
|---|---|---|
| `domain_cache` | Availability cache | Public read, service-role write |
| `domain_favorites` | Saved domains | RLS: own data only |
| `profiles` | User profiles (auto-created on signup via trigger) | RLS: own data only |
| `registrar_prices` | Pricing per TLD | Public read, service-role write |

## Edge Functions

- `check-domains` — bulk availability check
- `fetch-registrar-prices` — weekly price scraping via Firecrawl

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | Index | Main search page with dynamic search bar positioning |
| `/favorites` | Favorites | User's saved domains (requires auth) |
| `/pricing` | Pricing | Pricing information |
| `*` | NotFound | 404 page |

## Design System

- **Brand color:** #145DFB (blue), blue-to-purple gradients for CTAs
- **Style:** Glassmorphism, backdrop-blur, 80% card opacity, muted category color-coding (10% bg, 15% border)
- **Dark theme** default, soft multi-color background glow
- **Logo:** Inter Black, `wght 900`, `-webkit-text-stroke: 0.5px`, `letter-spacing: -0.01em`
- **Layout:** Max-width 968px for results, search field centered at 50vh → sticky under header on input
- **Filter bar:** Floating bottom, `backdrop-blur-2xl`, popups 16px above, full-width Extensions popup

## Secrets

- `FIRECRAWL_API_KEY` — web scraping
- `LOVABLE_API_KEY` — AI gateway
