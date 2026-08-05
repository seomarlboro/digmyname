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

const API_BASE =
  process.env.DIGMYNAME_API_BASE ||
  "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api";

const VERSION = "1.1.7";
const USER_AGENT = `domain-check-skills-mcp/${VERSION} (+https://digmyname.com/mcp)`;
const CACHE_TTL_MS = Number(process.env.DIGMYNAME_CACHE_TTL_MS || "30000");
const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
const AGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RETRIES = Number(process.env.DIGMYNAME_MAX_RETRIES || "2");

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

async function fetchApi(path: string): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
  });

  if (res.status === 429) {
    throw new Error("Rate limited by DigMyName API (60 req/min). Try again in a minute.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(`DigMyName API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function api<T>(path: string): Promise<T> {
  const cached = cacheGet(path);
  if (cached) return cached as T;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await fetchApi(path);
      cacheSet(path, data);
      return data as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isNetwork =
        lastError.message.includes("fetch") ||
        lastError.message.includes("network") ||
        lastError.message.includes("ECONNREFUSED") ||
        lastError.message.includes("ETIMEDOUT");
      const isRateLimit = lastError.message.includes("Rate limited");
      if ((isNetwork || isRateLimit) && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
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
  version: "1.1.6",
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
  "Check whether a specific domain (e.g. acme.io) is available. Returns cheapest registrar, buy link, and registration year when taken.",
  { domain: z.string().describe("Fully-qualified domain, e.g. acme.io") },
  async ({ domain }) => {
    const clean = normalizeDomain(domain);
    const [check, age] = await Promise.all([
      api<{ result: DomainResult }>(`/check?domain=${encodeURIComponent(clean)}`),
      api<AgeBatch>(`/age?domains=${encodeURIComponent(clean)}`).catch(() => ({
        count: 1,
        results: [{ domain: clean, created: null, expires: null }],
      })),
    ]);
    const created = age.results.find((a) => a.domain === clean)?.created ?? null;
    const result = { ...check.result, since_year: yearFromIso(created) };
    return { content: [{ type: "text" as const, text: formatResult(result) }] };
  }
);

registerTool(
  "search_domains",
  "Check one name across many TLDs at once. Returns availability, cheapest price, buy link and registration year (for taken domains) for each.",
  {
    query: z.string().describe("Name without TLD, e.g. acme"),
    tlds: z
      .string()
      .optional()
      .describe("Comma-separated TLDs, e.g. com,io,ai. Defaults to a curated set of 12."),
  },
  async ({ query, tlds }) => {
    const qs = new URLSearchParams({ q: query.trim().toLowerCase() });
    if (tlds) qs.set("tlds", tlds.replace(/\s/g, "").toLowerCase());

    const data = await api<{ results: DomainResult[] }>(`/search?${qs.toString()}`);
    const results = data.results ?? [];

    const takenDomains = results.filter((r) => !r.available && !r.uncertain).map((r) => r.domain);
    let ageByDomain: Record<string, string | null> = {};
    if (takenDomains.length) {
      const ageBatch = await api<AgeBatch>(
        `/age?domains=${encodeURIComponent(takenDomains.join(","))}`
      ).catch(() => ({ count: 0, results: [] }));
      ageByDomain = Object.fromEntries(ageBatch.results.map((a) => [a.domain, a.created]));
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
  "Compare registrar registration and renewal prices for a TLD (e.g. com, io, ai).",
  { tld: z.string().describe("TLD without the dot, e.g. com") },
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
  "Return the registration (creation) year and expiration date for a taken domain using RDAP.",
  { domain: z.string().describe("Fully-qualified domain, e.g. acme.com") },
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
  console.error("domain-check-skills-mcp v1.1.6 ready (stdio)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
