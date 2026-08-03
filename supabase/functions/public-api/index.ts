// Public agent-friendly API for DigMyName.
// Endpoints:
//   GET /public-api/check?domain=<fqdn>
//   GET /public-api/search?q=<word>&tlds=com,io,ai     (defaults to a curated 12-TLD set)
//   GET /public-api/registrars?tld=com                 (cheapest registrars from cache)
//   GET /public-api/openapi.json
//
// Notes:
//  - No auth (CORS *), designed for AI agents / scripts.
//  - In-memory rate limit: 10 requests / minute / IP. Best-effort (per edge instance),
//    intentionally conservative to avoid impacting normal users.
//  - Delegates availability checks to the existing `check-domains` function so logic stays in one place.
//  - Returns minimal, stable JSON. No internal cache/source-chain details exposed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEFAULT_TLDS = ["com", "io", "ai", "app", "dev", "co", "net", "org", "xyz", "me", "so", "tech"];
const MAX_SLD_LEN = 63;
const SLD_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^[a-z]{2,24}(?:\.[a-z]{2,24})?$/;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,24}(?:\.[a-z]{2,24})?$/;

// ---------- rate limiting (in-memory, per edge instance) ----------
const WINDOW_MS = 60_000;
const LIMIT = 60;
const buckets = new Map<string, number[]>();

// ---------- registrar deeplinks (domain prefilled) ----------
const REGISTRAR_LINKS: Record<string, (d: string) => string> = {
  GoDaddy: (d) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d)}`,
  Porkbun: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
  Namecheap: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`,
  Spaceship: (d) => `https://www.spaceship.com/domain-search/?query=${encodeURIComponent(d)}`,
  Cloudflare: () => `https://www.cloudflare.com/products/registrar/`,
  OVHcloud: (d) =>
    `https://order.ca.ovhcloud.com/us/order/webcloud/?#/webCloud/domain/select?selection=~()&domain=${encodeURIComponent(d)}`,
  "Google Domains": (d) => `https://domains.google/registrar/?searchTerm=${encodeURIComponent(d)}`,
};

function registerUrl(registrar: string, domain?: string | null): string {
  const fn = REGISTRAR_LINKS[registrar];
  if (fn && domain) return fn(domain);
  if (fn) return fn("");
  return `https://www.google.com/search?q=${encodeURIComponent(`${domain ?? ""} ${registrar} register`)}`;
}

const UTM = "utm_source=mcp&utm_medium=api&utm_campaign=domain-check-skills";


function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "anon";
}

function rateCheck(ip: string): { ok: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - arr[0])) / 1000);
    buckets.set(ip, arr);
    return { ok: false, retryAfter, remaining: 0 };
  }
  arr.push(now);
  buckets.set(ip, arr);
  // best-effort GC
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > WINDOW_MS) buckets.delete(k);
    }
  }
  return { ok: true, retryAfter: 0, remaining: LIMIT - arr.length };
}

// ---------- helpers ----------
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
      "X-RateLimit-Limit": String(LIMIT),
      ...extra,
    },
  });
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function validateDomain(raw: string): string | null {
  const d = normalize(raw);
  if (!DOMAIN_RE.test(d)) return null;
  if (d.length > 253) return null;
  return d;
}

function validateSld(raw: string): string | null {
  const s = normalize(raw).split(".")[0];
  if (!s || s.length > MAX_SLD_LEN) return null;
  if (!SLD_RE.test(s)) return null;
  return s;
}

function validateTld(raw: string): string | null {
  const t = normalize(raw).replace(/^\./, "");
  if (!TLD_RE.test(t)) return null;
  return t;
}

async function invokeCheck(domains: string[]) {
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supa.functions.invoke("check-domains", {
    body: { domains },
  });
  if (error) throw error;
  return data?.results ?? [];
}

function shapeResult(r: any, cheapest?: { registrar: string; regPrice: number; affiliateUrl: string | null } | null) {
  return {
    domain: r.domain,
    available: !!r.available,
    uncertain: !!r.uncertain,
    premium: !!r.premium,
    likely_premium: !!r.likelyPremium,
    price_usd: typeof r.price === "number" ? r.price : null,
    for_sale: !!r.forSale,
    for_sale_via: r.forSaleVia || null,
    listing_url: r.listingUrl || null,
    cheapest_registrar: cheapest
      ? {
          name: cheapest.registrar,
          reg_price_usd: cheapest.regPrice,
          affiliate_url: cheapest.affiliateUrl,
          register_url: cheapest.affiliateUrl || registerUrl(cheapest.registrar, r.domain),
        }
      : null,
    // Best link to hand to the user: buy it, or see the full comparison on DigMyName.
    buy_url: cheapest
      ? cheapest.affiliateUrl || registerUrl(cheapest.registrar, r.domain)
      : `https://digmyname.com/?q=${encodeURIComponent(r.domain.split(".")[0])}&${UTM}`,
    search_url: `https://digmyname.com/?q=${encodeURIComponent(r.domain.split(".")[0])}&${UTM}`,
  };
}


async function cheapestForTlds(tlds: string[]): Promise<Map<string, { registrar: string; regPrice: number; affiliateUrl: string | null }>> {
  const result = new Map<string, { registrar: string; regPrice: number; affiliateUrl: string | null }>();
  if (!tlds.length) return result;
  const supa = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await supa
    .from("registrar_prices")
    .select("tld, registrar, reg_price, affiliate_url")
    .in("tld", tlds);
  if (error || !data) return result;
  for (const row of data as any[]) {
    const existing = result.get(row.tld);
    if (!existing || row.reg_price < existing.regPrice) {
      result.set(row.tld, { registrar: row.registrar, regPrice: Number(row.reg_price), affiliateUrl: row.affiliate_url ?? null });
    }
  }
  return result;
}

// ---------- OpenAPI ----------
const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "DigMyName Public API",
    version: "1.0.0",
    description:
      "Agent-friendly endpoints for domain availability checks and registrar pricing. Free, no auth, 10 requests/min per IP. Please link users back to digmyname.com.",
    contact: { url: "https://digmyname.com" },
  },
  servers: [{ url: "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api" }],
  paths: {
    "/check": {
      get: {
        summary: "Check availability of a single domain",
        parameters: [
          { name: "domain", in: "query", required: true, schema: { type: "string", example: "myname.com" } },
        ],
        responses: { "200": { description: "Availability result" } },
      },
    },
    "/search": {
      get: {
        summary: "Check a name across multiple TLDs",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", example: "myname" } },
          { name: "tlds", in: "query", required: false, schema: { type: "string", example: "com,io,ai" } },
        ],
        responses: { "200": { description: "List of availability results" } },
      },
    },
    "/registrars": {
      get: {
        summary: "Cheapest registrar for a TLD",
        parameters: [{ name: "tld", in: "query", required: true, schema: { type: "string", example: "com" } }],
        responses: { "200": { description: "Sorted registrar pricing" } },
      },
    },
  },
};

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  // strip the supabase functions prefix: /functions/v1/public-api/<path>
  const path = url.pathname.replace(/^.*\/public-api/, "") || "/";

  if (path === "/openapi.json" || path === "/openapi") {
    return json(OPENAPI);
  }

  const ip = clientIp(req);
  const rl = rateCheck(ip);
  if (!rl.ok) {
    return json(
      { error: "rate_limited", limit: LIMIT, window_seconds: 60, retry_after_seconds: rl.retryAfter },
      429,
      { "Retry-After": String(rl.retryAfter), "X-RateLimit-Remaining": "0" },
    );
  }
  const rlHeaders = { "X-RateLimit-Remaining": String(rl.remaining) };

  try {
    if (path === "/" || path === "") {
      return json(
        {
          name: "DigMyName Public API",
          docs: "https://digmyname.com/api/openapi.json",
          endpoints: ["/check?domain=", "/search?q=&tlds=", "/registrars?tld=", "/openapi.json"],
          rate_limit: `${LIMIT} requests / 60s / IP`,
          website: "https://digmyname.com",
        },
        200,
        rlHeaders,
      );
    }

    if (path === "/check") {
      const raw = url.searchParams.get("domain") || "";
      const domain = validateDomain(raw);
      if (!domain) return json({ error: "invalid_domain", hint: "Use form 'name.tld', a-z 0-9 - only." }, 400, rlHeaders);

      const results = await invokeCheck([domain]);
      const tld = domain.split(".").slice(1).join(".");
      const cheap = await cheapestForTlds([tld]);
      const r = results[0];
      if (!r) return json({ error: "upstream_error" }, 502, rlHeaders);
      return json({ result: shapeResult(r, cheap.get(tld) || null) }, 200, rlHeaders);
    }

    if (path === "/search") {
      const sld = validateSld(url.searchParams.get("q") || "");
      if (!sld) return json({ error: "invalid_query", hint: "1-63 chars, a-z 0-9 - only." }, 400, rlHeaders);

      const rawTlds = (url.searchParams.get("tlds") || "").split(",").map((t) => t.trim()).filter(Boolean);
      let tlds = rawTlds.length ? rawTlds.map(validateTld).filter((t): t is string => !!t) : DEFAULT_TLDS;
      tlds = Array.from(new Set(tlds)).slice(0, 12); // cap to keep response cheap
      if (!tlds.length) return json({ error: "invalid_tlds" }, 400, rlHeaders);

      const domains = tlds.map((t) => `${sld}.${t}`);
      const [results, cheapest] = await Promise.all([invokeCheck(domains), cheapestForTlds(tlds)]);
      const byDomain = new Map<string, any>(results.map((r: any) => [r.domain, r]));
      const shaped = domains.map((d) => {
        const r = byDomain.get(d) || { domain: d, available: false, uncertain: true };
        const tld = d.split(".").slice(1).join(".");
        return shapeResult(r, cheapest.get(tld) || null);
      });
      return json({ query: sld, count: shaped.length, results: shaped }, 200, rlHeaders);
    }

    if (path === "/registrars") {
      const tld = validateTld(url.searchParams.get("tld") || "");
      if (!tld) return json({ error: "invalid_tld" }, 400, rlHeaders);
      const supa = createClient(SUPABASE_URL, ANON_KEY);
      const { data, error } = await supa
        .from("registrar_prices")
        .select("registrar, reg_price, renew_price, transfer_price, promo_code, affiliate_url, whois_privacy")
        .eq("tld", tld)
        .order("reg_price", { ascending: true });
      if (error) return json({ error: "upstream_error" }, 502, rlHeaders);
      return json(
        {
          tld,
          count: data?.length || 0,
          registrars: (data || []).map((r: any) => ({
            name: r.registrar,
            reg_price_usd: Number(r.reg_price),
            renew_price_usd: Number(r.renew_price),
            transfer_price_usd: r.transfer_price != null ? Number(r.transfer_price) : null,
            promo_code: r.promo_code || null,
            affiliate_url: r.affiliate_url || null,
            whois_privacy_included: !!r.whois_privacy,
          })),
        },
        200,
        rlHeaders,
      );
    }

    return json({ error: "not_found", path }, 404, rlHeaders);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return json({ error: "internal_error", detail: msg.slice(0, 200) }, 500, rlHeaders);
  }
});
