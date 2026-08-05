// Public agent-friendly API for DigMyName.
// Endpoints:
//   GET /public-api/check?domain=<fqdn>
//   GET /public-api/search?q=<word>&tlds=com,io,ai     (defaults to a curated 12-TLD set)
//   GET /public-api/registrars?tld=com                 (cheapest registrars from cache)
//   GET /public-api/age?domain=<fqdn>                    (registration year for taken domains)
//   GET /public-api/openapi.json
//
// Notes:
//  - No auth (CORS *), designed for AI agents / scripts.
//  - In-memory rate limit: 60 requests / minute / IP. Best-effort (per edge instance),
//    intentionally conservative to avoid impacting normal users.
//  - Delegates availability checks to the existing `check-domains` function so logic stays in one place.
//  - Returns minimal, stable JSON. No internal cache/source-chain details exposed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkDomains, isValidDomain } from "../_shared/pipeline.ts";

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

// Uses the SAME validator as the core pipeline (punycode xn-- labels allowed),
// after normalizing away protocol/path, so the API can never reject a domain
// the web UI accepts.
function validateDomain(raw: string): string | null {
  const d = normalize(raw);
  return isValidDomain(d) ? d : null;
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

// Runs the pipeline IN-PROCESS — no edge→edge invoke — so repeated checks are
// served from the shared warm L1 cache inside this isolate.
// Hard ceiling: no single request can hang beyond HARD_BUDGET_MS. On timeout we
// resolve (never reject) with uncertain placeholders so the UI shows Retry.
const HARD_BUDGET_MS = 1500;

async function invokeCheck(domains: string[]) {
  const fallback = domains.map((domain) => ({
    domain,
    available: false,
    uncertain: true,
    checkedVia: "timeout",
  }));
  let timer: number | undefined;
  const budget = new Promise<any[]>((resolve) => {
    timer = setTimeout(() => resolve(fallback), HARD_BUDGET_MS) as unknown as number;
  });
  try {
    return await Promise.race([checkDomains(domains), budget]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Registrar pricing is a nice-to-have: never let a cold DB call drag the
// availability answer. Resolves to the fallback instead of rejecting.
const PRICE_LOOKUP_BUDGET_MS = 800;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: number | undefined;
  const budget = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms) as unknown as number;
  });
  return Promise.race([promise, budget]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// ---------- shaped response cache (in-isolate, per endpoint+query) ----------
const RESPONSE_TTL_MS = 60_000;
const RESPONSE_CACHE_MAX = 2000;
const responseCache = new Map<string, { body: unknown; expires: number }>();

function cacheKey(path: string, params: URLSearchParams): string {
  const parts = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${path.replace(/^\//, "")}?${parts.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

function readResponseCache(key: string): unknown | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  // LRU touch
  responseCache.delete(key);
  responseCache.set(key, hit);
  return hit.body;
}

function writeResponseCache(key: string, body: unknown) {
  responseCache.set(key, { body, expires: Date.now() + RESPONSE_TTL_MS });
  while (responseCache.size > RESPONSE_CACHE_MAX) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

async function invokeAge(domains: string[]) {
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supa.functions.invoke("domain-age", {
    body: { domains },
  });
  if (error) throw error;
  return (data?.results ?? {}) as Record<string, { created: string | null; expires: string | null }>;
}

function shapeResult(r: any, cheapest?: { registrar: string; regPrice: number; affiliateUrl: string | null } | null) {
  const available = !!r.available;
  const likelyPremium = !!r.likelyPremium;
  // Don't expose a standard retail price for likely-premium names: the real
  // registry price can be 10-1000x higher and must be verified first.
  const priceOk = available && !likelyPremium && typeof r.price === "number";
  const registrarOk = priceOk && cheapest;
  return {
    domain: r.domain,
    available,
    uncertain: !!r.uncertain,
    premium: !!r.premium,
    likely_premium: likelyPremium,
    // Price only makes sense when the domain is actually available and not
    // a heuristic premium candidate.
    price_usd: priceOk ? r.price : null,
    for_sale: !!r.forSale,
    for_sale_via: r.forSaleVia || null,
    listing_url: r.listingUrl || null,
    cheapest_registrar: registrarOk
      ? {
          name: cheapest.registrar,
          reg_price_usd: cheapest.regPrice,
          affiliate_url: cheapest.affiliateUrl,
          register_url: cheapest.affiliateUrl || registerUrl(cheapest.registrar, r.domain),
        }
      : null,
    // Best link to hand to the user: buy it, or see the full comparison on DigMyName.
    buy_url: registrarOk
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
    version: "1.1.1",
    description:
      "Agent-friendly endpoints for domain availability checks and registrar pricing. Free, no auth, 60 requests/min per IP. Every result carries a buy_url and a search_url — please surface them so users can act. Please link users back to digmyname.com.",

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
    "/fast": {
      get: {
        summary: "Fast DNS-only availability signal",
        parameters: [{ name: "domains", in: "query", required: true, schema: { type: "string", example: "myname.com,myname.io" } }],
        responses: { "200": { description: "Quick available/taken/uncertain signal" } },
      },
    },
    "/age": {
      get: {
        summary: "Registration year for a taken domain",
        parameters: [{ name: "domain", in: "query", required: true, schema: { type: "string", example: "myname.com" } }],
        responses: { "200": { description: "Domain creation/expiration dates" } },
      },
    },
  },
};

// Fast DNS-only status. Returns quickly so the UI can flip cards before the
// authoritative RDAP/pricing check finishes. Uses DNS-over-HTTPS (Cloudflare)
// — the same transport as the main pipeline, which abandoned Deno.resolveDns
// because it hangs on some resolvers. Deliberately a single-resolver probe,
// not the full hedged pipeline.
async function fastStatus(domain: string): Promise<{ available: boolean; uncertain: boolean }> {
  try {
    const answers = await Promise.all(
      ["NS", "A"].map((type) =>
        fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(2000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      ),
    );

    let nxdomain = false;
    for (const data of answers) {
      if (!data) continue;
      if (Array.isArray(data.Answer) && data.Answer.length > 0) {
        return { available: false, uncertain: false };
      }
      if (data.Status === 3) nxdomain = true; // NXDOMAIN
    }
    if (nxdomain) return { available: true, uncertain: true };
    return { available: false, uncertain: true };
  } catch {
    return { available: false, uncertain: true };
  }
}

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

  // Shaped-response cache (only /check and /search). Rate limiting already applied above.
  const cacheable = path === "/check" || path === "/search";
  const key = cacheable ? cacheKey(path, url.searchParams) : "";
  if (cacheable) {
    const cached = readResponseCache(key);
    if (cached !== null) {
      return json(cached, 200, { ...rlHeaders, "X-Cache": "HIT" });
    }
  }
  const missHeaders = cacheable ? { ...rlHeaders, "X-Cache": "MISS" } : rlHeaders;

  try {
    if (path === "/" || path === "") {
      return json(
        {
          name: "DigMyName Public API",
          docs: "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api/openapi.json",
          endpoints: ["/check?domain=", "/search?q=&tlds=", "/registrars?tld=", "/fast?domains=", "/openapi.json"],
          rate_limit: `${LIMIT} requests / 60s / IP`,
          website: "https://digmyname.com",
        },
        200,
        rlHeaders,
      );
    }

    if (path === "/fast") {
      const raw = url.searchParams.get("domains") || url.searchParams.get("domain") || "";
      const domains = raw
        .split(",")
        .map((d) => validateDomain(d))
        .filter((d): d is string => !!d)
        .slice(0, 24);
      if (!domains.length) return json({ error: "invalid_domain", hint: "Use form 'name.tld', a-z 0-9 - only." }, 400, rlHeaders);
      const results = await Promise.all(domains.map(async (domain) => ({ domain, ...(await fastStatus(domain)) })));
      return json({ count: results.length, results }, 200, { ...rlHeaders, "Cache-Control": "no-store" });
    }

    if (path === "/check") {
      const raw = url.searchParams.get("domain") || "";
      const domain = validateDomain(raw);
      if (!domain) return json({ error: "invalid_domain", hint: "Use form 'name.tld', a-z 0-9 - only." }, 400, rlHeaders);

      const tld = domain.split(".").slice(1).join(".");
      const [results, cheap] = await Promise.all([invokeCheck([domain]), cheapestForTlds([tld])]);
      const r = results[0];
      if (!r) return json({ error: "upstream_error" }, 502, rlHeaders);
      const shaped = shapeResult(r, cheap.get(tld) || null);
      const body = { result: shaped };
      if (!shaped.uncertain) writeResponseCache(key, body);
      return json(body, 200, missHeaders);
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
      const body = { query: sld, count: shaped.length, results: shaped };
      if (!shaped.some((s) => s.uncertain)) writeResponseCache(key, body);
      return json(body, 200, missHeaders);
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
            three_year_total_usd:
              Math.round((Number(r.reg_price) + 2 * Number(r.renew_price)) * 100) / 100,

            promo_code: r.promo_code || null,
            affiliate_url: r.affiliate_url || null,
            register_url:
              r.affiliate_url ||
              registerUrl(r.registrar, validateDomain(url.searchParams.get("domain") || "") || null),
            whois_privacy_included: !!r.whois_privacy,
          })),
          compare_url: `https://digmyname.com/pricing?${UTM}`,

        },
        200,
        rlHeaders,
      );
    }

    if (path === "/age") {
      const raw = url.searchParams.get("domains") || url.searchParams.get("domain") || "";
      const domains = raw
        .split(",")
        .map((d) => validateDomain(d))
        .filter((d): d is string => !!d)
        .slice(0, 50);
      if (!domains.length) return json({ error: "invalid_domain", hint: "Use form 'name.tld', a-z 0-9 - only." }, 400, rlHeaders);
      const ages = await invokeAge(domains);
      const results = domains.map((d) => ({ domain: d, created: ages[d]?.created ?? null, expires: ages[d]?.expires ?? null }));
      return json({ count: results.length, results }, 200, rlHeaders);
    }

    return json({ error: "not_found", path }, 404, rlHeaders);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return json({ error: "internal_error", detail: msg.slice(0, 200) }, 500, rlHeaders);
  }
});
