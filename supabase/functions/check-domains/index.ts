import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================================
// Trust hierarchy (P0):
//   AVAILABLE only when ≥1 authoritative "yes" exists:
//     • GoDaddy { available: true, definitive: true }, OR
//     • RDAP 404 AND no DNS records.
//   TAKEN when:
//     • GoDaddy { available: false, definitive: true }, OR
//     • RDAP returns a registration object, OR
//     • DNS A/NS/MX records exist.
//   UNCERTAIN otherwise (API failure, non-definitive answers, conflicts).
//   On uncertain → return available:false + uncertain:true (never falsely "available").
// ============================================================================

interface DomainCheckResult {
  domain: string;
  available: boolean;
  checkedVia: string;
  price?: number;
  premium?: boolean;
  uncertain?: boolean;
  likelyPremium?: boolean;
  /** Registered but parked on an aftermarket marketplace (Sedo, Dan, Afternic, …). */
  forSale?: boolean;
  forSaleVia?: string;
  listingUrl?: string;
}

// TLDs where registries actively price short names as premium / aftermarket.
// Almost every commercial gTLD/ccTLD has a premium tier for 1-4 char SLDs.
const PREMIUM_TLDS = new Set([
  "com", "net", "org", "info", "biz", "co", "io", "ai", "app", "dev",
  "me", "tv", "cc", "us", "in", "ws", "to", "fm", "gg", "so",
  "xyz", "tech", "studio", "cloud", "pro", "shop", "store", "online",
  "site", "live", "world", "life", "art", "blog", "club", "design",
  "agency", "company", "digital", "media", "news",
]);

// Single-syllable / very common English words that are aftermarket on .com.
const COMMON_WORDS_RE = /^(?:[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]?|[aeiou][bcdfghjklmnpqrstvwxz]{1,2})$/i;

function isLikelyPremium(domain: string): boolean {
  const [sld, ...rest] = domain.split(".");
  const tld = rest.join(".");
  if (!sld || !tld) return false;

  // 1-3 char SLD on ANY TLD: registry premium tier almost always applies.
  if (sld.length <= 3) return true;

  // 4-char SLD on any commercial premium TLD = aftermarket / premium tier.
  if (sld.length === 4 && PREMIUM_TLDS.has(tld)) return true;

  // 5-char pure-letter SLD on the most contested TLDs.
  if (sld.length <= 5 && /^[a-z]+$/i.test(sld) && (tld === "com" || tld === "io" || tld === "ai" || tld === "co")) return true;

  // Tiny dictionary-shaped names on .com.
  if (tld === "com" && sld.length <= 4 && COMMON_WORDS_RE.test(sld)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// DNS via Cloudflare DoH (P2) — fast, no Deno.resolveDns hangs.
// ---------------------------------------------------------------------------
type DnsState = "has_records" | "no_records" | "error";

async function checkDnsDoH(domain: string): Promise<DnsState> {
  const types = ["A", "NS"];
  try {
    const responses = await Promise.all(
      types.map((t) =>
        fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${t}`, {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(2000),
        }).then((r) => (r.ok ? r.json() : null))
      )
    );
    let any = false;
    for (const data of responses) {
      if (!data) continue;
      any = true;
      if (Array.isArray(data.Answer) && data.Answer.length > 0) return "has_records";
      // Status 3 = NXDOMAIN
      if (data.Status === 3) return "no_records";
    }
    return any ? "no_records" : "error";
  } catch {
    return "error";
  }
}



// ---------------------------------------------------------------------------
// Aftermarket / parked-domain detection (NS-based).
//
// When a domain is registered (taken) we additionally check whether its
// nameservers belong to a known marketplace / parking provider. If yes, the
// domain is almost certainly listed for resale and we surface a direct
// listing link instead of just saying "Taken".
// ---------------------------------------------------------------------------
interface AftermarketHit {
  marketplace: string;
  buildUrl: (domain: string) => string;
}

const AFTERMARKET_NS_PATTERNS: Array<[RegExp, AftermarketHit]> = [
  [/(^|\.)sedoparking\.com$/i,    { marketplace: "Sedo",         buildUrl: (d) => `https://sedo.com/search/?keyword=${encodeURIComponent(d)}&language=us` }],
  [/(^|\.)dan\.com$/i,            { marketplace: "Dan.com",      buildUrl: (d) => `https://dan.com/buy-domain/${d}` }],
  [/(^|\.)(afternic|dnsowl)\.com$/i, { marketplace: "Afternic",  buildUrl: (d) => `https://www.afternic.com/domain/${d}` }],
  [/(^|\.)hugedomains\.com$/i,    { marketplace: "HugeDomains",  buildUrl: (d) => `https://www.hugedomains.com/domain_profile.aspx?d=${d.split(".").slice(0, -1).join(".")}&e=${d.split(".").pop()}` }],
  [/(^|\.)domainmarket\.com$/i,   { marketplace: "DomainMarket", buildUrl: (d) => `https://www.domainmarket.com/buynow/${d}` }],
  [/(^|\.)uniregistrymarket\.link$/i, { marketplace: "Uniregistry", buildUrl: (d) => `https://uniregistry.com/market/domain/${d}` }],
  [/(^|\.)(atom|squadhelp)\.com$/i, { marketplace: "Atom.com",   buildUrl: (d) => `https://www.atom.com/name/${d.split(".")[0]}` }],
  // Spaceship marketplace parks listed domains on launch{1,2}.spaceship.net
  [/(^|\.)spaceship\.net$/i,      { marketplace: "Spaceship",    buildUrl: (d) => `https://www.spaceship.com/domain-search/?query=${encodeURIComponent(d)}` }],
  [/(^|\.)(bodis|parkingcrew|above|saw|namebright|fabulous|voodoo|undeveloped|parklogic)\.(com|net|link)$/i, { marketplace: "Aftermarket", buildUrl: (d) => `https://www.afternic.com/domain/${d}` }],
];

export function classifyAftermarket(nsHosts: string[]): AftermarketHit | null {
  for (const raw of nsHosts) {
    const host = raw.replace(/\.$/, "").toLowerCase();
    for (const [re, hit] of AFTERMARKET_NS_PATTERNS) {
      if (re.test(host)) return hit;
    }
  }
  return null;
}

async function fetchNsRecords(domain: string): Promise<string[]> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data?.Answer)) return [];
    return data.Answer
      .map((a: { data?: string }) => String(a?.data ?? "").replace(/\.$/, "").toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function detectAftermarket(
  domain: string
): Promise<{ marketplace: string; listingUrl: string } | null> {
  const ns = await fetchNsRecords(domain);
  const hit = classifyAftermarket(ns);
  if (!hit) return null;
  return { marketplace: hit.marketplace, listingUrl: hit.buildUrl(domain) };
}


// ---------------------------------------------------------------------------
// RDAP — authoritative for "registered yes/no" but no pricing.
//
// P0.1: Resolve TLD → official RDAP server via IANA bootstrap file
// (https://data.iana.org/rdap/dns.json). This is the authoritative mapping
// every registry publishes, and is far more reliable than the public
// rdap.org aggregator (which 5xx / times out for many ccTLDs and newer
// gTLDs like .io, .ai, .co, .gg).
//
// Strategy:
//   1. Try the IANA-mapped RDAP server for the TLD (with one alternate).
//   2. Fall back to rdap.org if no mapping or all mapped servers fail.
// ---------------------------------------------------------------------------
type RdapState = "available" | "taken" | "unknown";

// Module-level cache for the IANA RDAP bootstrap file (TTL: 24h).
interface RdapBootstrap {
  services: Array<[string[], string[]]>; // [tlds, rdapBaseUrls]
}
let rdapBootstrapCache: { map: Map<string, string[]>; expiresAt: number } | null = null;

export async function loadRdapBootstrap(): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (rdapBootstrapCache && rdapBootstrapCache.expiresAt > now) {
    return rdapBootstrapCache.map;
  }
  try {
    const resp = await fetch("https://data.iana.org/rdap/dns.json", {
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) {
      await resp.text().catch(() => {});
      throw new Error(`IANA bootstrap HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as RdapBootstrap;
    const map = new Map<string, string[]>();
    for (const entry of data.services ?? []) {
      const [tlds, bases] = entry;
      const cleanBases = bases.map((b) => b.replace(/\/+$/, ""));
      for (const tld of tlds) {
        map.set(tld.toLowerCase(), cleanBases);
      }
    }
    rdapBootstrapCache = { map, expiresAt: now + 24 * 60 * 60 * 1000 };
    console.log(`rdap bootstrap loaded: ${map.size} TLDs mapped`);
    return map;
  } catch (e) {
    console.warn(`rdap bootstrap load failed: ${e instanceof Error ? e.message : String(e)}`);
    // Cache an empty map for 5 min to avoid hammering on failures.
    const empty = new Map<string, string[]>();
    rdapBootstrapCache = { map: empty, expiresAt: now + 5 * 60 * 1000 };
    return empty;
  }
}

async function rdapQueryOnce(url: string, timeoutMs: number): Promise<RdapState> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (resp.status === 404) {
      await resp.text().catch(() => {});
      return "available";
    }
    if (resp.ok) {
      await resp.text().catch(() => {});
      return "taken";
    }
    await resp.text().catch(() => {});
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function checkRdap(domain: string): Promise<RdapState> {
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";
  const bootstrap = await loadRdapBootstrap();
  const bases = bootstrap.get(tld) ?? [];

  // Try official IANA-mapped RDAP servers first (max 2 to bound latency).
  for (const base of bases.slice(0, 2)) {
    const state = await rdapQueryOnce(`${base}/domain/${domain}`, 4000);
    if (state !== "unknown") return state;
  }

  // Fallback to public aggregator.
  return await rdapQueryOnce(`https://rdap.org/domain/${domain}`, 4000);
}

// GoDaddy removed: production API requires 50+ domains on account or Reseller status.


// ---------------------------------------------------------------------------
// Porkbun — authoritative for premium / aftermarket pricing.
// Endpoint: POST /api/json/v3/domain/checkDomain/{domain}
// Returns: { status, response: { avail: "yes"|"no", price, regularPrice, premium: "yes"|"no", additional?: { renewal } } }
// ---------------------------------------------------------------------------
interface PorkbunResult {
  available: boolean;
  premium: boolean;
  price?: number;
  regularPrice?: number;
  renewPrice?: number;
}

async function checkPorkbun(domain: string, apiKey: string, secretKey: string): Promise<PorkbunResult | null> {
  try {
    const resp = await fetch(
      `https://api.porkbun.com/api/json/v3/domain/checkDomain/${encodeURIComponent(domain)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: apiKey, secretapikey: secretKey }),
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn(`porkbun HTTP ${resp.status} for ${domain}: ${txt.slice(0, 200)}`);
      return null;
    }
    const data = await resp.json();
    if (data?.status !== "SUCCESS" || !data.response) {
      console.warn(`porkbun non-success for ${domain}: ${JSON.stringify(data).slice(0, 200)}`);
      return null;
    }
    const r = data.response;
    const price = r.price != null ? Number(r.price) : undefined;
    const regular = r.regularPrice != null ? Number(r.regularPrice) : undefined;
    const renewal = r.additional?.renewal != null ? Number(r.additional.renewal) : undefined;
    return {
      available: r.avail === "yes",
      premium: r.premium === "yes",
      price: Number.isFinite(price) ? price : undefined,
      regularPrice: Number.isFinite(regular) ? regular : undefined,
      renewPrice: Number.isFinite(renewal) ? renewal : undefined,
    };
  } catch (e) {
    console.warn(`porkbun error for ${domain}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Porkbun public pricing catalog — no auth, no rate limit.
// POST https://api.porkbun.com/api/json/v3/pricing/get
//   → { status:"SUCCESS", pricing: { com: { registration, renewal, transfer } } }
// Gives us a standard registration price for EVERY available domain, instead of
// relying on the 1-call-per-10s authenticated checkDomain endpoint.
// Cached at module scope for 12h.
// ---------------------------------------------------------------------------
interface TldPrice { registration?: number; renewal?: number }
let pricingCache: { map: Map<string, TldPrice>; expiresAt: number } | null = null;

/**
 * Non-blocking accessor: returns whatever pricing we already have and refreshes
 * in the background. The catalog is ~80KB and can take >15s on a cold isolate,
 * so we never make a user request wait for it.
 */
let pricingInflight: Promise<Map<string, TldPrice>> | null = null;
export function getTldPricing(): Map<string, TldPrice> {
  const fresh = pricingCache && pricingCache.expiresAt > Date.now();
  if (!fresh && !pricingInflight) {
    pricingInflight = loadTldPricing().finally(() => {
      pricingInflight = null;
    });
    // Keep the isolate alive until the catalog finishes downloading.
    const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    rt?.waitUntil?.(pricingInflight.catch(() => {}));
  }
  return pricingCache?.map ?? new Map();
}

export async function loadTldPricing(): Promise<Map<string, TldPrice>> {
  const now = Date.now();
  if (pricingCache && pricingCache.expiresAt > now) return pricingCache.map;
  try {
    const resp = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data?.status !== "SUCCESS" || !data.pricing) throw new Error("non-success");
    const map = new Map<string, TldPrice>();
    for (const [tld, v] of Object.entries(data.pricing as Record<string, Record<string, string>>)) {
      const reg = Number(v?.registration);
      const ren = Number(v?.renewal);
      map.set(tld.toLowerCase(), {
        registration: Number.isFinite(reg) ? reg : undefined,
        renewal: Number.isFinite(ren) ? ren : undefined,
      });
    }
    pricingCache = { map, expiresAt: now + 12 * 60 * 60 * 1000 };
    console.log(`porkbun pricing catalog loaded: ${map.size} TLDs`);
    return map;
  } catch (e) {
    console.warn(`porkbun pricing catalog failed: ${e instanceof Error ? e.message : String(e)}`);
    const empty = new Map<string, TldPrice>();
    pricingCache = { map: empty, expiresAt: now + 5 * 60 * 1000 };
    return empty;
  }
}


// ---------------------------------------------------------------------------
// Domainr (via RapidAPI) — batch authoritative status for up to 32 domains.
// Statuses we care about (space-separated string per domain):
//   undelegated / inactive    → available for standard registration
//   active / parked           → taken
//   marketed / priced / premium → aftermarket / registry-premium tier
//   suffix                    → not registerable (it's a TLD itself)
// Docs: https://domainr.com/docs/api/v2/status
// ---------------------------------------------------------------------------
interface DomainrStatusEntry {
  domain: string;
  zone?: string;
  status: string;
  summary?: string;
}

// Circuit breaker: if RapidAPI answers 401/403 (key invalid / not subscribed)
// stop calling it for the lifetime of this isolate instead of burning a
// round-trip on every request.
let domainrDisabledReason: string | null = null;

async function checkDomainrBatch(domains: string[], rapidKey: string): Promise<Map<string, DomainrStatusEntry> | null> {
  if (domains.length === 0) return new Map();
  if (domainrDisabledReason) return null;
  try {
    const out = new Map<string, DomainrStatusEntry>();
    // Domainr accepts up to 32 domains per call.
    for (let i = 0; i < domains.length; i += 32) {
      const slice = domains.slice(i, i + 32);
      const url = `https://domainr.p.rapidapi.com/v2/status?domain=${encodeURIComponent(slice.join(","))}`;
      const resp = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": rapidKey,
          "X-RapidAPI-Host": "domainr.p.rapidapi.com",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        if (resp.status === 401 || resp.status === 403) {
          domainrDisabledReason = `HTTP ${resp.status}: ${txt.slice(0, 120)}`;
          console.error(`domainr DISABLED for this isolate — ${domainrDisabledReason}. Check the RapidAPI subscription for domainr.p.rapidapi.com.`);
        } else {
          console.warn(`domainr HTTP ${resp.status}: ${txt.slice(0, 200)}`);
        }
        return out.size > 0 ? out : null;
      }
      const data = await resp.json();
      if (Array.isArray(data?.status)) {
        for (const entry of data.status as DomainrStatusEntry[]) {
          if (entry?.domain) out.set(entry.domain.toLowerCase(), entry);
        }
      }
    }
    return out;
  } catch (e) {
    console.warn(`domainr error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// Domainr status tokens are a SET ordered by increasing precedence. The docs say
// the right-most token is the most important, but in practice the tokens fall into
// three buckets:
//   • FREE:    inactive | undelegated | unregistered  → available for registration
//   • PREMIUM: premium                                  → available, registry-premium price
//   • TAKEN:   active | parked | claimed | reserved | dpml | pending | disallowed |
//              invalid | suffix | tld | zone | deleting | expiring
//   • AFTERMARKET: marketed | priced | transferable    → taken, listed for resale
//
// The old implementation treated priced/transferable as premium/free, which wrongly
// marked aftermarket domains as available. Per the docs, priced/transferable are
// explicitly aftermarket (for-sale) statuses.
export type DomainrVerdict =
  | { kind: "available"; premium: boolean }
  | { kind: "taken"; forSale: boolean }
  | { kind: "unknown" };

const DOMAINR_TAKEN = new Set([
  "active", "parked", "claimed", "dpml", "deleting", "pending", "expiring",
  "reserved", "disallowed", "invalid", "suffix", "tld", "zone",
]);
const DOMAINR_FREE = new Set(["undelegated", "inactive", "unregistered"]);
const DOMAINR_PREMIUM = new Set(["premium"]);
const DOMAINR_AFTERMARKET = new Set(["marketed", "priced", "transferable"]);

export function interpretDomainr(entry: DomainrStatusEntry | undefined): DomainrVerdict {
  if (!entry?.status) return { kind: "unknown" };
  const tokens = entry.status.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "unknown" };

  const taken = tokens.some((t) => DOMAINR_TAKEN.has(t));
  const free = tokens.some((t) => DOMAINR_FREE.has(t));
  const premium = tokens.some((t) => DOMAINR_PREMIUM.has(t));
  const aftermarket = tokens.some((t) => DOMAINR_AFTERMARKET.has(t));

  // Aftermarket tokens (marketed/priced/transferable) mean the domain is already
  // registered and listed for sale — they take precedence over free/inactive.
  if (taken || aftermarket) return { kind: "taken", forSale: aftermarket };
  if (free) return { kind: "available", premium };
  return { kind: "unknown" };
}


// Concurrency limiter (no extra deps).
async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string" || domain.length === 0 || domain.length > 253) return false;
  // Allow punycode IDN labels (xn--…) — the previous `(?!.*--)` guard rejected them.
  const re = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+(xn--[a-z0-9-]{2,59}|[a-z]{2,63})$/i;
  if (!re.test(domain)) return false;
  return domain
    .split(".")
    .every((l) => l.length >= 1 && l.length <= 63 && !l.startsWith("-") && !l.endsWith("-"));
}


// Tiered cache TTL (P4).
function ttlSecondsFor(checkedVia: string, uncertain: boolean): number {
  if (uncertain) return 0; // never cache uncertain results
  switch (checkedVia) {
    case "porkbun": return 24 * 60 * 60;             // 24h — authoritative pricing
    case "domainr": return 24 * 60 * 60;             // 24h — authoritative status
    case "godaddy_definitive": return 24 * 60 * 60; // 24h
    case "rdap": return 6 * 60 * 60;                 // 6h
    case "dns": return 30 * 60;                      // 30m
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Resolve a single domain using RDAP + DNS only. GoDaddy is intentionally
// removed from the verification chain — production API access requires
// 50+ domains on the account or Reseller status, which we don't have.
// ---------------------------------------------------------------------------
async function resolveDomain(domain: string): Promise<DomainCheckResult> {
  const [dns, rdap] = await Promise.all([checkDnsDoH(domain), checkRdap(domain)]);
  const likelyPremium = isLikelyPremium(domain);

  // RDAP is authoritative for registration status.
  if (rdap === "taken") {
    return { domain, available: false, checkedVia: "rdap", likelyPremium };
  }
  // RDAP 404 is authoritative for "not registered". A DNS lookup error must not
  // downgrade that to uncertain — only actual DNS records can contradict it.
  if (rdap === "available" && dns !== "has_records") {
    return {
      domain,
      available: true,
      checkedVia: "rdap",
      likelyPremium: likelyPremium || undefined,
    };
  }


  // DNS-only signal: records exist → taken.
  if (dns === "has_records") {
    return { domain, available: false, checkedVia: "dns", likelyPremium };
  }

  // Heuristic fallback — short SLD on premium TLD with no clear answer.
  if (likelyPremium) {
    return { domain, available: false, checkedVia: "heuristic", likelyPremium: true, uncertain: true };
  }

  return { domain, available: false, checkedVia: "unknown", uncertain: true };
}

// ---------------------------------------------------------------------------
// Lightweight per-IP rate limiter (in-memory, sliding window).
// Each isolate gets its own counter — good enough to stop trivial abuse
// without external infra. Combine with Cloudflare/edge limits for stronger guarantees.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 30;            // requests
const RATE_LIMIT_WINDOW_MS = 60_000;  // per minute
const rateBuckets = new Map<string, number[]>();

// Porkbun checkDomain endpoint allows 1 request per 10 seconds globally per API key.
// Track last successful call timestamp at module scope (per isolate).
const PORKBUN_MIN_INTERVAL_MS = 11_000;
let porkbunLastCallMs = 0;
function porkbunBudgetReady(): boolean {
  return Date.now() - porkbunLastCallMs >= PORKBUN_MIN_INTERVAL_MS;
}
function consumePorkbunBudget(): void {
  porkbunLastCallMs = Date.now();
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(req: Request): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  const window = rateBuckets.get(ip) ?? [];
  const recent = window.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  // Best-effort cleanup to prevent unbounded growth.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (rateLimited(req)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }


  try {
    const { domains } = (await req.json()) as { domains: string[] };
    if (!Array.isArray(domains) || domains.length === 0) {
      return new Response(JSON.stringify({ error: "domains array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batch = domains.slice(0, 50).filter(isValidDomain);
    if (batch.length === 0) {
      return new Response(JSON.stringify({ error: "No valid domains provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // GoDaddy removed from verification chain.

    const porkbunKey = Deno.env.get("PORKBUN_API_KEY");
    const porkbunSecret = Deno.env.get("PORKBUN_SECRET_KEY");
    const porkbun = porkbunKey && porkbunSecret ? { key: porkbunKey, secret: porkbunSecret } : null;

    const rapidKey = Deno.env.get("RAPIDAPI_DOMAINR_KEY");

    // Cache lookup.
    const { data: cached } = await supabase
      .from("domain_cache")
      .select("domain, available, checked_via, rdap_data")
      .in("domain", batch)
      .gt("expires_at", new Date().toISOString());

    const cachedMap = new Map<string, DomainCheckResult>();
    if (cached) {
      for (const c of cached) {
        const meta = (c.rdap_data ?? {}) as Record<string, unknown>;
        cachedMap.set(c.domain, {
          domain: c.domain,
          available: c.available,
          checkedVia: c.checked_via,
          price: meta.godaddy_price as number | undefined,
          premium: meta.premium as boolean | undefined,
          likelyPremium: meta.likely_premium as boolean | undefined,
          forSale: meta.for_sale as boolean | undefined,
          forSaleVia: meta.for_sale_via as string | undefined,
          listingUrl: meta.listing_url as string | undefined,
        });
      }
    }

    const uncached = batch.filter((d) => !cachedMap.has(d));

    // ---- Domainr batch pass (top-tier authoritative status) -------------
    // One batched call covers up to 32 domains — much faster than per-domain checks.
    // We trust Domainr for available / taken / premium classification, then only
    // fall back to GoDaddy/RDAP/DNS for domains it didn't classify confidently.
    const domainrResults = rapidKey ? await checkDomainrBatch(uncached, rapidKey) : null;
    if (rapidKey) {
      const sample = uncached.slice(0, 5).map((d) => {
        const e = domainrResults?.get(d.toLowerCase());
        return `${d}=${e?.status ?? "MISSING"}`;
      });
      console.log(`domainr keyPresent=true returned=${domainrResults?.size ?? "null"} sample=[${sample.join(", ")}]`);
    } else {
      console.warn("domainr key NOT set (RAPIDAPI_DOMAINR_KEY missing) — falling back to RDAP/DNS only");
    }
    const fresh: DomainCheckResult[] = [];
    const needsFallback: string[] = [];

    for (const d of uncached) {
      const verdict = interpretDomainr(domainrResults?.get(d.toLowerCase()));
      const likelyPremium = isLikelyPremium(d);
      if (verdict.kind === "available") {
        // Registry-premium names ARE registerable — available:true + premium flag.
        fresh.push({
          domain: d,
          available: true,
          checkedVia: "domainr",
          premium: verdict.premium || undefined,
          likelyPremium: verdict.premium || likelyPremium || undefined,
        });
      } else if (verdict.kind === "taken") {
        fresh.push({
          domain: d,
          available: false,
          checkedVia: "domainr",
          likelyPremium,
          // Aftermarket tokens (marketed/priced/transferable) mean there is a
          // buy-now / fast-transfer listing we can send the user to.
          forSale: verdict.forSale || undefined,
          forSaleVia: verdict.forSale ? "Aftermarket" : undefined,
          listingUrl: verdict.forSale ? `https://www.afternic.com/domain/${d}` : undefined,
        });
      } else {
        needsFallback.push(d);
      }
    }


    const fallback = await pMap(needsFallback, 10, (d) => resolveDomain(d));
    fresh.push(...fallback);

    // ---- Aftermarket NS detection ---------------------------------------
    // For every "taken" result, peek at the NS records — if they point to a
    // known marketplace (Sedo, Dan, Afternic, HugeDomains, …) flag it as
    // forSale so the UI can surface a buy-listing link instead of a dead end.
    const aftermarketTargets = fresh.filter(
      (r) => !r.available && !r.uncertain && !r.forSale
    );
    if (aftermarketTargets.length > 0) {
      const hits = await pMap(aftermarketTargets, 10, async (r) => ({
        domain: r.domain,
        hit: await detectAftermarket(r.domain),
      }));
      for (const { domain, hit } of hits) {
        if (!hit) continue;
        const idx = fresh.findIndex((r) => r.domain === domain);
        if (idx >= 0) {
          fresh[idx] = {
            ...fresh[idx],
            forSale: true,
            forSaleVia: hit.marketplace,
            listingUrl: hit.listingUrl,
          };
        }
      }
    }


    // ---- Standard price enrichment (free Porkbun pricing catalog) --------
    // Every available, non-premium domain gets its real registration price.
    const pricing = getTldPricing();

    // Primary price source: our own weekly-scraped registrar_prices table
    // (instant, always warm). Porkbun's live catalog is the fallback.
    const neededTlds = [...new Set(
      fresh.filter((r) => r.available && r.price == null).map((r) => r.domain.split(".").slice(1).join("."))
    )];
    const dbPrice = new Map<string, number>();
    if (neededTlds.length > 0) {
      const { data: priceRows } = await supabase
        .from("registrar_prices")
        .select("tld, reg_price")
        .in("tld", neededTlds);
      for (const row of priceRows ?? []) {
        const v = Number(row.reg_price);
        if (!Number.isFinite(v)) continue;
        const cur = dbPrice.get(row.tld);
        if (cur == null || v < cur) dbPrice.set(row.tld, v);
      }
    }

    for (let i = 0; i < fresh.length; i++) {
      const r = fresh[i];
      if (!r.available || r.price != null) continue;
      const tld = r.domain.split(".").slice(1).join(".");
      const p = dbPrice.get(tld) ?? pricing.get(tld)?.registration;
      if (p != null) fresh[i] = { ...r, price: p };
    }

    // ---- Porkbun verification pass (rate-limited 1/10s) ----------------
    // Porkbun's authenticated checkDomain is the only source that returns the
    // REAL premium price for a specific name. Budget is 1 call per ~10s, so we
    // spend it on the single most suspicious result (available + premium-ish,
    // no confirmed price yet).
    if (porkbun && porkbunBudgetReady()) {
      const candidates = fresh
        .filter((r) => r.available && (r.premium || r.likelyPremium) && r.checkedVia !== "porkbun")
        // Prefer shortest SLD (most likely premium).
        .sort((a, b) => a.domain.split(".")[0].length - b.domain.split(".")[0].length);
      const target = candidates[0];
      if (target) {
        consumePorkbunBudget();
        const pb = await checkPorkbun(target.domain, porkbun.key, porkbun.secret);
        if (pb) {
          const idx = fresh.findIndex((r) => r.domain === target.domain);
          if (idx >= 0) {
            const standard = pricing.get(target.domain.split(".").slice(1).join("."))?.registration;
            const isPremium =
              pb.premium ||
              (pb.price != null && standard != null && pb.price > standard * 2) ||
              (pb.price != null && standard == null && pb.price >= 50);
            fresh[idx] = {
              ...fresh[idx],
              available: pb.available,
              checkedVia: "porkbun",
              price: pb.price ?? fresh[idx].price,
              premium: isPremium || undefined,
              likelyPremium: isPremium || undefined,
              uncertain: undefined,
            };
          }
        }
      }
    }


    // Telemetry (visible in edge logs).
    if (fresh.length > 0) {
      const dist: Record<string, number> = {};
      for (const r of fresh) dist[r.checkedVia] = (dist[r.checkedVia] ?? 0) + 1;
      console.log(`check-domains via=${JSON.stringify(dist)} n=${fresh.length}`);
    }

    // Cache only trustworthy results, with tiered TTL.
    const cacheable = fresh
      .map((r) => {
        let ttl = ttlSecondsFor(r.checkedVia, r.uncertain === true);
        // Don't lock in a price-less "available" result for hours just because
        // the pricing catalog was still warming up — re-check it soon.
        if (ttl > 600 && r.available && r.price == null) ttl = 600;
        return { r, ttl };
      })
      .filter(({ ttl }) => ttl > 0);

    if (cacheable.length > 0) {
      const rows = cacheable.map(({ r, ttl }) => ({
        domain: r.domain,
        available: r.available,
        checked_via: r.checkedVia,
        rdap_data: {
          godaddy_price: r.price ?? null,
          premium: r.premium ?? false,
          likely_premium: r.likelyPremium ?? false,
          for_sale: r.forSale ?? false,
          for_sale_via: r.forSaleVia ?? null,
          listing_url: r.listingUrl ?? null,
        },
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      }));
      await supabase.from("domain_cache").upsert(rows, { onConflict: "domain" });
    }

    const all = new Map<string, DomainCheckResult>();
    for (const c of cachedMap.values()) all.set(c.domain, c);
    for (const r of fresh) all.set(r.domain, r);

    const ordered = batch.map(
      (d) => all.get(d) ?? { domain: d, available: false, checkedVia: "error", uncertain: true }
    );

    return new Response(JSON.stringify({ results: ordered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-domains error:", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
