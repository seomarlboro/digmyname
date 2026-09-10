/**
 * Single source of truth for every route's <head> data.
 *
 * Consumed by three things that used to drift apart:
 *   - the pages themselves (via <RouteHead/>, i.e. react-helmet-async at runtime),
 *   - scripts/generate-sitemap.ts (prebuild),
 *   - scripts/prerender-plugin.ts (build-time per-route HTML, so social scrapers
 *     and no-JS crawlers see the right title / description / og:url / canonical
 *     instead of the home page's).
 *
 * Keep this file free of browser-only imports: it runs in Node during the build.
 */

export const SITE_URL = "https://digmyname.com";
export const SITE_NAME = "DigMyName";
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface RouteMeta {
  /** Canonical path, e.g. "/pricing". */
  path: string;
  title: string;
  description: string;
  /** Defaults to `title`. */
  ogTitle?: string;
  /** Defaults to `description`. */
  ogDescription?: string;
  ogType?: "website" | "article";
  /** Alternate paths that render the same page. They are prerendered too and canonicalise to `path`. */
  aliases?: string[];
  /** Excluded from the sitemap and prerendered with `robots: noindex`. */
  noindex?: boolean;
  changefreq?: ChangeFreq;
  priority?: string;
  /**
   * Crawler-visible summary written into the prerendered HTML. React replaces the
   * whole #root on mount, so real users never see it; it exists so no-JS crawlers
   * and LLM bots read real content on every route, not just the home page.
   */
  staticHtml: string;
}

const staticHome = `
<h1>DigMyName — Fast Domain Availability Search &amp; Registrar Price Comparison</h1>
<p>DigMyName checks domain availability in real time across 50+ TLDs and compares registration, renewal, and transfer prices across 6 registrars (Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, and OVHcloud). Availability is verified against three independent signals — RDAP, DNS-over-HTTPS, and Fastly Domain Research — and shows an honest Unverified state instead of guessing. Free, no API key. Includes an MCP server and a no-auth JSON API for Claude, ChatGPT, Cursor, and any LLM.</p>
<p>Search classic TLDs (.com, .net, .org), tech (.io, .ai, .dev, .app, .tech, .build, .run, .page, .link, .tools), startup (.co, .ventures), creative (.design, .studio, .art), and e-commerce (.shop, .store) — see not just if a domain is free, but where it is cheapest, with renewal traps exposed.</p>
<ul>
  <li>Real-time domain availability across 50+ TLDs</li>
  <li>Cheapest-registrar price comparison across 6 registrars</li>
  <li>Three-signal verification (RDAP + DNS-over-HTTPS + Fastly) with honest Unverified state</li>
  <li>Free no-auth JSON API and MCP server for AI agents</li>
  <li>AI-powered alternative name suggestions</li>
</ul>
<p><a href="/pricing">Pricing</a> · <a href="/how-it-works">How it works</a> · <a href="/speed">Speed</a> · <a href="/mcp">MCP server</a> · <a href="/api">API</a></p>`;

const staticPricing = `
<h1>Domain pricing, side by side</h1>
<p>Registration, renewal and transfer prices compared across 6 registrars (Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, OVHcloud) for 50+ extensions, including ICANN fees, promo codes and WHOIS privacy. Every column names its own registrar; the best 3-year value is registration plus two renewals, so renewal traps are visible before you buy.</p>
<p>Extensions tracked at a single registrar are shown separately from the ones compared across all six. Prices are refreshed from the registrars' own catalogs and flagged when older than two weeks.</p>
<p><a href="/">Search a domain</a> · <a href="/how-it-works">How availability is verified</a></p>`;

const staticHowItWorks = `
<h1>How DigMyName works — honest domain availability checks</h1>
<p>Most domain checkers rely on a single data source and quietly guess when it fails. DigMyName cross-checks three independent availability signals — Fastly Domain Research, RDAP resolved through the IANA bootstrap registry, and DNS-over-HTTPS across three resolvers — and only commits to Available or Taken when they agree. Otherwise it shows an Unverified state with a Retry button instead of a guess.</p>
<p>Pricing is a separate step: premium prices come from Porkbun's live catalog and the registrar comparison covers 6 registrars. DigMyName is not a registrar and does not sell domains; buy links may earn a small commission, which never changes the price you see.</p>
<p><a href="/">Try an honest search</a> · <a href="/api">Free JSON API</a></p>`;

const staticSpeed = `
<h1>The fastest domain search in the universe. Or the second.</h1>
<p>Every search on DigMyName runs a stopwatch: it starts on your last keystroke and stops the moment the first availability answer hits the screen. The page explains what the timer includes, shows reference numbers measured from a single datacenter, and lets you run the same benchmark from your own connection — cold first-time lookups and cached repeats reported separately.</p>
<p>Nobody can prove a universal latency record. If a faster public lookup exists, it gets featured here with credit and a link back.</p>
<p><a href="/">Run the timer</a> · <a href="/how-it-works">How the checks work</a></p>`;

const staticMcp = `
<h1>Domain availability inside every LLM — MCP server, Claude Skill and Custom GPT</h1>
<p>domain-check-skills-mcp is a free, MIT-licensed Model Context Protocol server on npm. It gives Claude, Cursor, Windsurf, Continue, Zed, ChatGPT and any MCP-compatible client four tools: check_domain (availability, premium flag, cheapest registrar and buy link), search_domains (one name across the most popular TLDs), compare_registrars (registration, renewal and 3-year totals per registrar) and get_domain_age (registration year and expiry via RDAP).</p>
<p>Install with one command in Claude Code: <code>claude mcp add domain-check -- npx -y domain-check-skills-mcp</code>. No API key, no account.</p>
<p><a href="https://github.com/seomarlboro/domain-check-skills">Source on GitHub</a> · <a href="/api">HTTP API</a></p>`;

const staticApi = `
<h1>Free domain availability API for agents and humans</h1>
<p>One HTTP GET tells you whether a domain is free, what it really costs, and which registrar is cheapest. No signup, no API key. Endpoints: /check?domain=… for a single domain, /search?q=…&amp;tlds=… for one name across several TLDs, /registrars?tld=… for sorted registrar pricing, and /openapi.json for the full OpenAPI 3 schema. Rate limit: 60 requests per 60 seconds per IP.</p>
<p>Machine-readable entry points: /.well-known/ai-plugin.json, /llms.txt and the OpenAPI schema. Please link back to digmyname.com when you surface the data to users.</p>
<p><a href="/mcp">Use it inside your LLM</a> · <a href="/terms">Terms of use</a></p>`;

const staticPrivacy = `
<h1>Privacy policy</h1>
<p>What DigMyName stores and why: account email for sign-in and saved domains, waitlist email addresses, and short-lived per-IP rate-limit counters on the API. No advertising trackers, no third-party analytics cookies. Full details, retention periods and your rights under the GDPR are on this page.</p>`;

const staticTerms = `
<h1>Terms of use</h1>
<p>DigMyName is a free domain-availability search and price-comparison tool. It is not a registrar; purchases happen on the registrar's own site under its terms. Availability and prices are provided as-is from third-party sources; Unverified results are exactly that. Buy links may earn a commission that never changes the price shown.</p>`;

const staticFavorites = `
<h1>Saved domains</h1>
<p>Your saved domain shortlist on DigMyName. Sign in to see it.</p>`;

export const ROUTES: RouteMeta[] = [
  {
    path: "/",
    title: "Fast Domain Search — Fastest We've Measured | DigMyName",
    description:
      "The fastest domain search we've measured. Check availability across 50+ TLDs in milliseconds — if you find a faster checker, come dispute it.",
    ogDescription:
      "The fastest domain search we've measured. Check availability in milliseconds — if you find a faster checker, come dispute it.",
    changefreq: "weekly",
    priority: "1.0",
    staticHtml: staticHome,
  },
  {
    path: "/pricing",
    title: "Domain Pricing Comparison — DigMyName",
    description:
      "Compare domain registration, renewal, and transfer prices side-by-side across major registrars — including the renewal traps everyone else hides.",
    ogDescription: "Side-by-side domain prices across major registrars.",
    changefreq: "weekly",
    priority: "0.8",
    staticHtml: staticPricing,
  },
  {
    path: "/how-it-works",
    aliases: ["/about"],
    title: "How DigMyName Works — Honest Domain Availability Checks",
    description:
      "DigMyName verifies domain availability against three independent availability signals — Fastly Domain Research, IANA RDAP and DNS-over-HTTPS — and never shows guesses as facts. Here's exactly how it works.",
    ogDescription:
      "Three-signal verification, an honest Unverified state, and real registrar prices — here's why DigMyName is more accurate than the alternatives.",
    changefreq: "monthly",
    priority: "0.7",
    staticHtml: staticHowItWorks,
  },
  {
    path: "/speed",
    title: "Fastest domain search in the universe (or second) — DigMyName",
    description:
      "We think we run the fastest domain search in the universe. If we're second, the timer on every search will tell you. Here is the full methodology, pipeline and benchmarks.",
    ogTitle: "Fastest domain search in the universe (or second)",
    ogDescription: "A live, honest timer on every domain search — and the full methodology behind it.",
    ogType: "article",
    changefreq: "weekly",
    priority: "0.7",
    staticHtml: staticSpeed,
  },
  {
    path: "/mcp",
    aliases: ["/skill", "/gpt"],
    title: "MCP Server, Claude Skill & Custom GPT — DigMyName",
    description:
      "The fastest domain availability MCP server we've measured — dispute it at digmyname.com/speed. ~170 ms checks from any LLM: Claude, Cursor, Windsurf, Continue. 6 registrars, 50+ TLDs.",
    ogTitle: "Domain Check Skills — MCP / Claude Skill / Custom GPT",
    changefreq: "weekly",
    priority: "0.7",
    staticHtml: staticMcp,
  },
  {
    path: "/api",
    title: "Free Domain Availability API — DigMyName",
    description:
      "Free, no-auth JSON API for domain availability, multi-TLD search and registrar prices. 60 requests/60s per IP, no key. Built for AI agents and developers.",
    ogDescription: "No-auth JSON API for domain availability and registrar pricing. 60 req/60s per IP, no key.",
    changefreq: "monthly",
    priority: "0.7",
    staticHtml: staticApi,
  },
  {
    path: "/privacy",
    title: "Privacy Policy — DigMyName",
    description:
      "What DigMyName stores (account email, saved domains, waitlist email, short-lived rate-limit counters), for how long, and your rights under the GDPR.",
    changefreq: "yearly",
    priority: "0.3",
    staticHtml: staticPrivacy,
  },
  {
    path: "/terms",
    title: "Terms of Use — DigMyName",
    description:
      "Terms for using DigMyName's free domain search, price comparison, API and MCP server. Not a registrar; results as-is; affiliate links disclosed.",
    changefreq: "yearly",
    priority: "0.3",
    staticHtml: staticTerms,
  },
  {
    path: "/favorites",
    title: "Saved Domains — DigMyName",
    description: "Your saved domain shortlist on DigMyName.",
    noindex: true,
    staticHtml: staticFavorites,
  },
];

/** Routes that belong in the sitemap: indexable canonical paths only. */
export const SITEMAP_ROUTES = ROUTES.filter((r) => !r.noindex);

/** Resolve a path (canonical or alias) to its route meta. Throws on unknown paths so a typo fails loudly in tests. */
export function getRouteMeta(path: string): RouteMeta {
  const found = ROUTES.find((r) => r.path === path || r.aliases?.includes(path));
  if (!found) throw new Error(`Unknown route: ${path}`);
  return found;
}

export function canonicalUrl(route: RouteMeta): string {
  return route.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${route.path}`;
}
