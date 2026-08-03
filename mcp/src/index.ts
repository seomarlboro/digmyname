#!/usr/bin/env node
/**
 * domain-check-skills-mcp
 * MCP server exposing DigMyName's public domain API to AI agents.
 *
 * Tools:
 *  - check_domain      : availability + price for one exact domain
 *  - search_domains    : check one name across many TLDs
 *  - compare_registrars: cheapest registrars for a TLD
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE =
  process.env.DIGMYNAME_API_BASE ||
  "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api";

const USER_AGENT = "domain-check-skills-mcp/1.0.0 (+https://digmyname.com/mcp)";

type Registrar = {
  name: string;
  reg_price_usd: number | null;
  affiliate_url: string | null;
  register_url: string | null;
};

type DomainResult = {
  domain: string;
  available: boolean;
  uncertain?: boolean;
  premium?: boolean;
  likely_premium?: boolean;
  price_usd?: number | null;
  for_sale?: boolean;
  for_sale_via?: string | null;
  listing_url?: string | null;
  cheapest_registrar?: Registrar | null;
  buy_url?: string | null;
  search_url?: string | null;
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
  });
  if (res.status === 429) {
    throw new Error("Rate limited by DigMyName API (60 req/min). Try again in a minute.");
  }
  if (!res.ok) {
    throw new Error(`DigMyName API error ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

function money(n: number | null | undefined): string {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "n/a";
}

function statusLabel(r: DomainResult): string {
  if (r.uncertain) return "UNKNOWN";
  if (!r.available) return r.for_sale ? "TAKEN (listed for sale)" : "TAKEN";
  if (r.premium) return "AVAILABLE (premium)";
  if (r.likely_premium) return "AVAILABLE (likely premium)";
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
  } else if (r.for_sale && r.listing_url) {
    parts.push(`  for sale via ${r.for_sale_via ?? "marketplace"}: ${r.listing_url}`);
  }

  if (r.search_url) parts.push(`  compare: ${r.search_url}`);
  return parts.join("\n");
}

const server = new McpServer({
  name: "domain-check-skills",
  version: "1.0.0",
});

server.tool(
  "check_domain",
  "Check whether a specific domain (e.g. acme.io) is available, and get the cheapest registrar plus a direct purchase link.",
  { domain: z.string().describe("Fully-qualified domain, e.g. acme.io") },
  async ({ domain }: { domain: string }) => {
    const data = await api<{ result: DomainResult }>(
      `/check?domain=${encodeURIComponent(domain.trim().toLowerCase())}`
    );
    return { content: [{ type: "text" as const, text: formatResult(data.result) }] };
  }
);

server.tool(
  "search_domains",
  "Check one name across many TLDs at once. Returns availability, cheapest price and a buy link for each.",
  {
    query: z.string().describe("Name without TLD, e.g. acme"),
    tlds: z
      .string()
      .optional()
      .describe("Comma-separated TLDs, e.g. com,io,ai. Defaults to a curated set of 12."),
  },
  async ({ query, tlds }: { query: string; tlds?: string }) => {
    const qs = new URLSearchParams({ q: query.trim().toLowerCase() });
    if (tlds) qs.set("tlds", tlds.replace(/\s/g, "").toLowerCase());
    const data = await api<{ results: DomainResult[] }>(`/search?${qs.toString()}`);

    const results = data.results ?? [];
    const available = results.filter((r) => r.available && !r.uncertain);
    const taken = results.filter((r) => !r.available && !r.uncertain);

    const lines: string[] = [];
    if (available.length) {
      lines.push(`AVAILABLE (${available.length}):`, ...available.map(formatResult));
    }
    if (taken.length) {
      lines.push("", `TAKEN (${taken.length}): ${taken.map((r) => r.domain).join(", ")}`);
    }
    if (!lines.length) lines.push("No conclusive results.");
    lines.push("", `Full comparison: https://digmyname.com/?q=${encodeURIComponent(query)}`);

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

server.tool(
  "compare_registrars",
  "Compare registrar registration and renewal prices for a TLD (e.g. com, io, ai).",
  { tld: z.string().describe("TLD without the dot, e.g. com") },
  async ({ tld }: { tld: string }) => {
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("domain-check-skills-mcp v1.0.0 ready (stdio)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
