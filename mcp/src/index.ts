#!/usr/bin/env node
/**
 * domain-check-skills-mcp
 * MCP server exposing DigMyName's public domain API to AI agents.
 *
 * Tools:
 *  - check_domain      : availability + price + age for one exact domain
 *  - search_domains    : check one name across many TLDs
 *  - compare_registrars: cheapest registrars for a TLD
 *  - get_domain_age    : registration year for a taken domain
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Cloudflare edge cache (60s TTL) in front of the same Supabase functions.
// Set DIGMYNAME_API_BASE to the direct supabase.co URL to bypass the cache.
const API_BASE =
  process.env.DIGMYNAME_API_BASE ||
  "https://api.digmyname.com/functions/v1/public-api";

const VERSION = "1.2.8";
const USER_AGENT = `domain-check-skills-mcp/${VERSION} (+https://digmyname.com/mcp)`;
const CACHE_TTL_MS = Number(process.env.DIGMYNAME_CACHE_TTL_MS || "30000");
const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
const AGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RETRIES = Number(process.env.DIGMYNAME_MAX_RETRIES || "2");
// Per-attempt hang-guard. The API's server budget is ~1s, so if no response
// arrives within this window the isolate is cold or the network stalled — abort
// and let the bounded retry path decide, instead of hanging to the MCP client's
// deadline (the cause of the 30s timeouts seen in cold-path testing).
const REQUEST_TIMEOUT_MS = Number(process.env.DIGMYNAME_REQUEST_TIMEOUT_MS || "1700");
// Hard wall-clock ceiling across ALL retries of a single api() call.
const OVERALL_DEADLINE_MS = Number(process.env.DIGMYNAME_DEADLINE_MS || "1700");
// Registration-year enrichment is optional — never let it dominate the answer.
const AGE_ENRICH_BUDGET_MS = Number(process.env.DIGMYNAME_AGE_BUDGET_MS || "200");

const RegistrarSchema = z.object({
  name: z.string(),
  reg_price_usd: z.number().nullable(),
  affiliate_url: z.string().nullable(),
  register_url: z.string().nullable(),
});

const DomainResultSchema = z.object({
  domain: z.string(),
  available: z.boolean(),
  uncertain: z.boolean().optional(),
  premium: z.boolean().optional(),
  likely_premium: z.boolean().optional(),
  price_usd: z.number().nullable().optional(),
  for_sale: z.boolean().optional(),
  for_sale_via: z.string().nullable().optional(),
  listing_url: z.string().nullable().optional(),
  cheapest_registrar: RegistrarSchema.nullable().optional(),
  buy_url: z.string().nullable().optional(),
  search_url: z.string().nullable().optional(),
  since_year: z.number().nullable().optional(),
});

type DomainResult = z.infer<typeof DomainResultSchema>;
type AgeBatch = {
  count: number;
  results: Array<{ domain: string; created: string | null; expires: string | null }>;
};

// Simple in-memory TTL cache so repeated queries in the same conversation are instant.
const apiCache = new Map<string, { value: unknown; expires: number }>();

function cacheGet(key: string): unknown | undefined {
  const entry = apiCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    apiCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: unknown, ttlMs = CACHE_TTL_MS): void {
  apiCache.set(key, { value, expires: Date.now() + ttlMs });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiError extends Error {
  status?: number;
  retryable: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = status === undefined || status === 429 || status >= 500;
  }
}

async function fetchApi(path: string): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Transport-level failure — no HTTP status, always retryable.
    throw new ApiError(err instanceof Error ? err.message : String(err));
  }

  if (res.status === 429) {
    throw new ApiError(
      "Rate limited by DigMyName API (60 req/min). Try again in a minute.",
      429
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new ApiError(`DigMyName API error ${res.status}: ${body}`, res.status);
  }
  return res.json();
}

function ttlForPath(path: string): number {
  if (path.startsWith("/registrars")) return PRICING_TTL_MS;
  if (path.startsWith("/age")) return AGE_TTL_MS;
  return CACHE_TTL_MS;
}

async function api<T>(path: string): Promise<T> {
  const cached = cacheGet(path);
  if (cached) return cached as T;

  const startedAt = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await fetchApi(path);
      cacheSet(path, data, ttlForPath(path));
      return data as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable = err instanceof ApiError ? err.retryable : true;
      const backoff = 300 * 2 ** attempt;
      // Bounded: never let retries push a single call past OVERALL_DEADLINE_MS.
      if (retryable && attempt < MAX_RETRIES && Date.now() - startedAt + backoff < OVERALL_DEADLINE_MS) {
        await sleep(backoff);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Unknown API error");
}

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .split("/")[0]
    .split(":")[0];
}

function money(n: number | null | undefined): string {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "n/a";
}

function yearFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) && y > 1990 ? y : null;
}

function statusLabel(r: DomainResult): string {
  if (r.uncertain) return "UNKNOWN";
  if (!r.available) return r.for_sale ? "TAKEN (listed for sale)" : "TAKEN";
  if (r.premium) return "AVAILABLE (premium)";
  if (r.likely_premium) return "AVAILABLE (likely premium — real price may differ)";
  return "AVAILABLE";
}

function formatResult(r: DomainResult): string {
  const parts = [`${r.domain} — ${statusLabel(r)}`];

  if (r.available) {
    if (r.cheapest_registrar) {
      parts.push(
        `  cheapest: ${r.cheapest_registrar.name} ${money(r.cheapest_registrar.reg_price_usd)}/yr`
      );
    } else if (typeof r.price_usd === "number") {
      parts.push(`  price: ${money(r.price_usd)}`);
    }
    if (r.buy_url) parts.push(`  buy: ${r.buy_url}`);
  } else {
    if (r.for_sale && r.listing_url) {
      parts.push(`  for sale via ${r.for_sale_via ?? "marketplace"}: ${r.listing_url}`);
    }
    if (typeof r.since_year === "number") {
      parts.push(`  registered since: ${r.since_year}`);
    }
  }

  if (r.search_url) parts.push(`  compare: ${r.search_url}`);
  return parts.join("\n");
}

const server = new McpServer({
  name: "domain-check-skills",
  version: VERSION,
});

// Work around MCP SDK's deep type inference by registering tools via an any-typed wrapper.
function registerTool(
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  handler: (...args: any[]) => any
) {
  (server as any).tool(name, description, schema, handler);
}

registerTool(
  "check_domain",
  "Check if ONE specific domain (e.g. acme.io) is registrable right now. Use for a single fully-qualified name; to test one word across many extensions, use search_domains instead. Returns an availability verdict, the cheapest registrar and its buy link, the first-year price, and \u2014 for taken names \u2014 the registration year. Availability is cross-checked against three independent signals (RDAP, DNS-over-HTTPS, Fastly Domain Research); when they disagree or a zone has no reliable RDAP (e.g. .co), the verdict comes back as uncertain rather than guessed \u2014 treat uncertain as 'unknown, NOT available', and note that price may be absent for such names.",
  { domain: z.string().describe("A single fully-qualified domain including its TLD, e.g. 'acme.io'. URLs and 'www.' prefixes are stripped automatically. Not a bare word \u2014 use search_domains to test a word across multiple TLDs.") },
  async ({ domain }) => {
    const clean = normalizeDomain(domain);
    const check = await api<{ result: DomainResult }>(
      `/check?domain=${encodeURIComponent(clean)}`
    );

    // Registration year only exists for taken domains — skip the round-trip otherwise.
    // Prefer the registration year if the API returned it inline (newer server) —
    // that skips the extra /age round-trip entirely. Otherwise fetch it, hard-capped
    // so a cold /age never stretches the answer past the budget.
    let sinceYear: number | null =
      typeof check.result.since_year === "number" ? check.result.since_year : null;
    if (sinceYear === null && check.result.available === false && !check.result.uncertain) {
      const age = await Promise.race([
        api<AgeBatch>(`/age?domains=${encodeURIComponent(clean)}`).catch(() => null),
        sleep(AGE_ENRICH_BUDGET_MS).then(() => null),
      ]);
      sinceYear = yearFromIso(age?.results.find((a) => a.domain === clean)?.created ?? null);
    }

    const result = { ...check.result, since_year: sinceYear };
    return { content: [{ type: "text" as const, text: formatResult(result) }] };
  }
);

registerTool(
  "search_domains",
  "Check ONE name across MANY TLDs in a single call (e.g. 'acme' \u2192 com, io, ai \u2026). Use when comparing extensions for the same word; for a single known domain use check_domain instead. Results are grouped AVAILABLE / TAKEN / UNKNOWN, each carrying cheapest price, buy link, and (for taken names) registration year. Names whose availability cannot be confirmed appear under UNKNOWN and must NOT be treated as available (honest 'unverified' state, never a guess).",
  {
    query: z.string().describe("The name WITHOUT any TLD, e.g. 'acme' (not 'acme.com'). This single word is tested against each TLD in the tlds list."),
    tlds: z
      .string()
      .optional()
      .describe("Optional comma-separated TLDs without dots, e.g. 'com,io,ai'. Omit to use a curated default set of 12 popular TLDs. Whitespace is ignored."),
  },
  async ({ query, tlds }) => {
    const qs = new URLSearchParams({ q: query.trim().toLowerCase() });
    if (tlds) qs.set("tlds", tlds.replace(/\s/g, "").toLowerCase());

    const data = await api<{ results: DomainResult[] }>(`/search?${qs.toString()}`);
    const results = data.results ?? [];

    const takenDomains = results.filter((r) => !r.available && !r.uncertain).map((r) => r.domain);
    let ageByDomain: Record<string, string | null> = {};
    if (takenDomains.length) {
      const ageBatch = await Promise.race([
        api<AgeBatch>(
          `/age?domains=${encodeURIComponent(takenDomains.join(","))}`
        ).catch(() => null),
        sleep(AGE_ENRICH_BUDGET_MS).then(() => null),
      ]);
      ageByDomain = ageBatch
        ? Object.fromEntries(ageBatch.results.map((a) => [a.domain, a.created]))
        : {};
    }

    const enriched = results.map((r) => ({
      ...r,
      since_year: !r.available && !r.uncertain ? yearFromIso(ageByDomain[r.domain] ?? null) : null,
    }));

    const available = enriched.filter((r) => r.available && !r.uncertain);
    const taken = enriched.filter((r) => !r.available && !r.uncertain);
    const unknown = enriched.filter((r) => r.uncertain);

    const lines: string[] = [];
    if (available.length) {
      lines.push(`AVAILABLE (${available.length}):`, ...available.map(formatResult));
    }
    if (taken.length) {
      lines.push("", `TAKEN (${taken.length}):`, ...taken.map(formatResult));
    }
    if (unknown.length) {
      lines.push("", `UNKNOWN (${unknown.length}): ${unknown.map((r) => r.domain).join(", ")}`);
    }
    if (!lines.length) lines.push("No conclusive results.");
    lines.push("", `Full comparison: https://digmyname.com/?q=${encodeURIComponent(query)}`);

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

registerTool(
  "compare_registrars",
  "Compare what 6 registrars (Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, OVHcloud) charge for a given TLD \u2014 first-year registration, renewal, and 3-year total \u2014 exposing the renewal traps that cheap first-year promos hide. Use for pricing a TLD you already intend to buy; this does NOT check whether a specific domain is free (use check_domain for that). Returns per-registrar rows with buy links, or a notice if no fresh cached pricing exists for that TLD.",
  { tld: z.string().describe("A single TLD WITHOUT the leading dot, e.g. 'com', 'io', 'ai'. A leading dot is stripped if present.") },
  async ({ tld }) => {
    const data = await api<{
      tld: string;
      registrars: Array<{
        name: string;
        reg_price_usd: number | null;
        renew_price_usd?: number | null;
        three_year_total_usd?: number | null;
        register_url?: string | null;
      }>;
    }>(`/registrars?tld=${encodeURIComponent(tld.replace(/^\./, "").toLowerCase())}`);

    const rows = (data.registrars ?? []).map((r) => {
      const bits = [
        `${r.name}: ${money(r.reg_price_usd)} first year`,
        r.renew_price_usd != null ? `renew ${money(r.renew_price_usd)}` : null,
        r.three_year_total_usd != null ? `3yr ${money(r.three_year_total_usd)}` : null,
      ].filter(Boolean);
      return `${bits.join(" · ")}${r.register_url ? `\n  ${r.register_url}` : ""}`;
    });

    const text = rows.length
      ? `.${data.tld} pricing:\n${rows.join("\n")}\n\nFull table: https://digmyname.com/pricing`
      : `No cached pricing for .${tld}. See https://digmyname.com/pricing`;

    return { content: [{ type: "text" as const, text }] };
  }
);

registerTool(
  "get_domain_age",
  "Return the registration (creation) year and expiration date of a TAKEN domain, via RDAP. Use to gauge how long a name has been held or when it may expire; it does NOT report availability (use check_domain for that). Returns a 'could not determine' notice for names with no RDAP creation record (some ccTLDs, e.g. .co).",
  { domain: z.string().describe("A fully-qualified domain including its TLD, e.g. 'acme.com'. Meaningful only for taken/registered domains; available names have no registration date.") },
  async ({ domain }) => {
    const clean = normalizeDomain(domain);
    const data = await api<AgeBatch>(`/age?domains=${encodeURIComponent(clean)}`);
    const info = data.results.find((a) => a.domain === clean);
    if (!info) {
      return {
        content: [
          { type: "text" as const, text: `Could not determine registration date for ${clean}.` },
        ],
      };
    }
    const y = yearFromIso(info.created);
    const text = info.created
      ? `${info.domain} — registered ${info.created}${y ? ` (since ${y})` : ""}${
          info.expires ? `, expires ${info.expires}` : ""
        }`
      : `Could not determine registration date for ${info.domain}.`;
    return { content: [{ type: "text" as const, text }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`domain-check-skills-mcp v${VERSION} ready (stdio)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
