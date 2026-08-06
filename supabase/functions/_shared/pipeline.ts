// ============================================================================
// SHARED DOMAIN-RESOLUTION PIPELINE
//
// Extracted from `check-domains/index.ts` so that BOTH the `check-domains`
// edge function and the `public-api` edge function can run the exact same
// pipeline in-process — no edge→edge network hop — and share the same warm
// module-level caches (L1 hot cache, RDAP bootstrap, pricing catalog,
// Domainr circuit-breaker, Porkbun budget) inside an isolate.
//
// This module contains NO HTTP handling and NO rate limiting: those stay in
// the HTTP wrappers. Availability/pricing logic is unchanged.
// ============================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  interpretDomainr,
  isLikelyBlocked,
  shouldEscalateToDomainr,
  type DomainrStatusEntry,
} from "./availability-rules.ts";

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

// Bump this whenever availability/premium logic changes so old cached rows are
// treated as misses instead of returning stale interpretations.
const CACHE_VERSION = 1;


export interface DomainCheckResult {
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

export function isLikelyPremium(domain: string): boolean {
  const [sld, ...rest] = domain.split(".");
  const tld = rest.join(".");
  if (!sld || !tld) return false;

  // 1-3 char SLD on ANY TLD: registry premium tier almost always applies.
  if (sld.length <= 3) return true;

  // 4-char SLD on any commercial premium TLD = aftermarket / premium tier.
  if (sld.length === 4 && PREMIUM_TLDS.has(tld)) return true;

  // 5-char pure-letter SLD on contested TLDs (premium/aftermarket candidates).
  if (sld.length <= 5 && /^[a-z]+$/i.test(sld) && (PREMIUM_TLDS.has(tld) || tld === "com" || tld === "io" || tld === "ai" || tld === "co")) return true;

  // Tiny dictionary-shaped names on premium TLDs and .com.
  if (sld.length <= 5 && PREMIUM_TLDS.has(tld) && COMMON_WORDS_RE.test(sld)) return true;
  if (tld === "com" && sld.length <= 4 && COMMON_WORDS_RE.test(sld)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// DNS via DoH (P2) — fast, no Deno.resolveDns hangs.
//
// Speed: Cloudflare is the primary resolver, Google is a *hedge* fired only if
// Cloudflare hasn't answered within 400ms. The first decisive answer wins, so a
// single slow/edge-cold resolver never dictates the latency of the batch.
// ---------------------------------------------------------------------------
type DnsState = "has_records" | "no_records" | "error";

const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

/**
 * Combine an optional caller signal with a per-probe timeout so a losing
 * hedged request is cancelled the moment a decisive answer wins the race.
 */
function probeSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

const sleep = (ms: number) =>
  new Promise<void>((res) => {
    const id = setTimeout(res, ms);
    Deno.unrefTimer?.(id);
  });

async function dohProbe(endpoint: string, domain: string, timeoutMs: number, signal?: AbortSignal): Promise<DnsState> {
  try {
    const responses = await Promise.all(
      ["A", "NS"].map((t) =>
        fetch(`${endpoint}?name=${encodeURIComponent(domain)}&type=${t}`, {
          headers: { Accept: "application/dns-json" },
          signal: probeSignal(timeoutMs, signal),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      )
    );
    let any = false;
    let hasRecords = false;
    let nxdomain = false;
    for (const data of responses) {
      if (!data) continue;
      any = true;
      if (Array.isArray(data.Answer) && data.Answer.length > 0) hasRecords = true;
      // Status 3 = NXDOMAIN
      if (data.Status === 3) nxdomain = true;
    }
    // Records take precedence: a domain can have NS records but no A record.
    if (hasRecords) return "has_records";
    // Only call it "no records" if at least one resolver explicitly answered NXDOMAIN.
    if (nxdomain) return "no_records";
    return any ? "no_records" : "error";
  } catch {
    return "error";
  }
}

async function checkDnsDoH(domain: string, signal?: AbortSignal): Promise<DnsState> {
  // Own controller: once one resolver answers decisively the other fetch is
  // cancelled instead of holding the isolate open for its full timeout.
  const ctl = new AbortController();
  const sig = signal ? AbortSignal.any([signal, ctl.signal]) : ctl.signal;

  const primary = dohProbe(DOH_ENDPOINTS[0], domain, 2000, sig);
  const hedge = sleep(400).then(() => dohProbe(DOH_ENDPOINTS[1], domain, 2000, sig));

  const decisive = (p: Promise<DnsState>) =>
    p.then((s) => (s === "error" ? PENDING_FOREVER<DnsState>() : s));

  try {
    return await Promise.race([
      decisive(primary),
      decisive(hedge),
      Promise.all([primary, hedge]).then(([a, b]) => (a !== "error" ? a : b)),
    ]);
  } finally {
    ctl.abort();
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

async function fetchNsRecords(domain: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { Accept: "application/dns-json" },
      signal: probeSignal(2000, signal),
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

async function rdapQueryOnce(url: string, timeoutMs: number, signal?: AbortSignal): Promise<RdapState> {
  try {
    const resp = await fetch(url, { signal: probeSignal(timeoutMs, signal) });
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

// Prewarm the bootstrap as soon as the isolate boots so the first user request
// doesn't pay the IANA download latency.
// Lazily started on the first request (not at module load, which would leak an
// in-flight fetch into the test runner) and reused by every later call.
let rdapBootstrapPrewarm: Promise<Map<string, string[]>> | null = null;
export function warmRdapBootstrap(): Promise<Map<string, string[]>> {
  if (!rdapBootstrapPrewarm) {
    rdapBootstrapPrewarm = loadRdapBootstrap().catch(() => new Map<string, string[]>());
  }
  return rdapBootstrapPrewarm;
}

// Hardcoded RDAP endpoints for the top TLDs (≈95% of every real search).
// These never change in practice, so for popular zones we skip the IANA
// bootstrap wait entirely and hit the registry on the very first millisecond.
// Verified against https://data.iana.org/rdap/dns.json — every entry below was
// live-tested (HTTP 200/404, no redirects). Zones missing from the IANA
// bootstrap (.io, .co, .me, .us) intentionally keep the aggregator path.
export const FAST_RDAP: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1",
  net: "https://rdap.verisign.com/net/v1",
  org: "https://rdap.publicinterestregistry.org/rdap",
  info: "https://rdap.identitydigital.services/rdap",
  biz: "https://rdap.nic.biz",
  ai: "https://rdap.identitydigital.services/rdap",
  app: "https://pubapi.registry.google/rdap",
  dev: "https://pubapi.registry.google/rdap",
  page: "https://pubapi.registry.google/rdap",
  new: "https://pubapi.registry.google/rdap",
  tech: "https://rdap.radix.host/rdap",
  digital: "https://rdap.identitydigital.services/rdap",
  cloud: "https://rdap.registry.cloud/rdap",
  software: "https://rdap.identitydigital.services/rdap",
  systems: "https://rdap.identitydigital.services/rdap",
  agency: "https://rdap.identitydigital.services/rdap",
  company: "https://rdap.identitydigital.services/rdap",
  ventures: "https://rdap.identitydigital.services/rdap",
  capital: "https://rdap.identitydigital.services/rdap",
  inc: "https://rdap.centralnic.com/inc",
  design: "https://rdap.nic.design",
  studio: "https://rdap.identitydigital.services/rdap",
  art: "https://rdap.centralnic.com/art",
  media: "https://rdap.identitydigital.services/rdap",
  xyz: "https://rdap.centralnic.com/xyz",
  cc: "https://tld-rdap.verisign.com/cc/v1",
  tv: "https://rdap.nic.tv",
  shop: "https://rdap.gmoregistry.net/rdap",
  store: "https://rdap.radix.host/rdap",
  market: "https://rdap.identitydigital.services/rdap",
  buy: "https://rdap.nominet.uk/buy",
  community: "https://rdap.identitydigital.services/rdap",
  social: "https://rdap.identitydigital.services/rdap",
  club: "https://rdap.nic.club",
  group: "https://rdap.identitydigital.services/rdap",
  finance: "https://rdap.identitydigital.services/rdap",
  money: "https://rdap.identitydigital.services/rdap",
  fund: "https://rdap.identitydigital.services/rdap",
  life: "https://rdap.identitydigital.services/rdap",
  live: "https://rdap.identitydigital.services/rdap",
  world: "https://rdap.identitydigital.services/rdap",
  site: "https://rdap.radix.host/rdap",
  online: "https://rdap.radix.host/rdap",
  space: "https://rdap.radix.host/rdap",
  pro: "https://rdap.identitydigital.services/rdap",
  one: "https://rdap.nic.one",
  wtf: "https://rdap.identitydigital.services/rdap",
  lol: "https://rdap.centralnic.com/lol",
  solutions: "https://rdap.identitydigital.services/rdap",
  works: "https://rdap.identitydigital.services/rdap",
  land: "https://rdap.identitydigital.services/rdap",
  top: "https://rdap.zdnsgtld.com/top",
  vip: "https://rdap.nic.vip",
  icu: "https://rdap.centralnic.com/icu",
  // Not published in the IANA bootstrap, but verified live (registered → 200,
  // unregistered → 404). Kept in a documented exception list, see the test.
  io: "https://rdap.identitydigital.services/rdap",
  us: "https://rdap.nic.us",
};

/** FAST_RDAP entries deliberately absent from the IANA bootstrap file. */
export const FAST_RDAP_EXCEPTIONS = new Set(["io", "us"]);

/**
 * TLDs where the public rdap.org aggregator answers 404 even for *registered*
 * names (.co, .me have no working public RDAP). A 404 from the aggregator on
 * these zones must never be read as "available".
 */
const AGGREGATOR_UNRELIABLE_TLDS = new Set(["co", "me"]);

async function checkRdap(domain: string, signal?: AbortSignal): Promise<RdapState> {
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";

  // Fast lane: popular TLD → known registry endpoint, zero lookup latency.
  const fast = FAST_RDAP[tld];
  let bases: string[];
  if (fast) {
    bases = [fast];
    // Keep the bootstrap warming in the background for the long-tail zones.
    warmRdapBootstrap();
  } else {
    // Never block on the bootstrap for more than 700ms — if it isn't warm yet we
    // go straight to the public aggregator instead of stalling the whole batch.
    const bootstrap = await Promise.race([
      warmRdapBootstrap(),
      new Promise<Map<string, string[]>>((res) => {
        const id = setTimeout(() => res(new Map()), 700);
        Deno.unrefTimer?.(id);
      }),
    ]);
    bases = (bootstrap.get(tld) ?? []).slice(0, 2);
  }

  // Query the registry endpoint(s) and hedge with the public aggregator after
  // 700ms instead of waiting out a full 3s timeout before falling back.
  const decisive = (p: Promise<RdapState>) =>
    p.then((s) => (s === "unknown" ? PENDING_FOREVER<RdapState>() : s));

  // Cancel the losing RDAP probes as soon as one is decisive.
  const ctl = new AbortController();
  const sig = signal ? AbortSignal.any([signal, ctl.signal]) : ctl.signal;

  const probes = bases.map((base) => rdapQueryOnce(`${base}/domain/${domain}`, 3000, sig));

  // On zones with no trustworthy RDAP server, the aggregator may only *confirm*
  // a registration — its 404s are downgraded to "unknown".
  const trustAggregator404 = bases.length > 0 || !AGGREGATOR_UNRELIABLE_TLDS.has(tld);
  const aggregator = sleep(probes.length ? 700 : 0)
    .then(() => rdapQueryOnce(`https://rdap.org/domain/${domain}`, 3000, sig))
    .then((s) => (s === "available" && !trustAggregator404 ? "unknown" as RdapState : s));

  const all = [...probes, aggregator];

  try {
    return await Promise.race([
      ...all.map(decisive),
      Promise.all(all).then((states) => states.find((s) => s !== "unknown") ?? "unknown"),
    ]);
  } finally {
    ctl.abort();
  }
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

// The first attempt is hard-capped at 4s so nothing that could ever end up on
// a request path pays a long tail. Porkbun's catalog endpoint measurably takes
// ~14s to serve its ~80KB payload, so the retries (which only ever run in the
// background via getTldPricing()/waitUntil) get a realistic budget — otherwise
// pricing would never load at all and every available domain would lose its
// price.
const PRICING_FIRST_TIMEOUT_MS = 4000;
const PRICING_RETRY_TIMEOUT_MS = 20000;
const PRICING_ATTEMPTS = 3;

export async function loadTldPricing(): Promise<Map<string, TldPrice>> {
  const now = Date.now();
  if (pricingCache && pricingCache.expiresAt > now) return pricingCache.map;

  let lastError = "unknown";
  for (let attempt = 1; attempt <= PRICING_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(attempt === 1 ? PRICING_FIRST_TIMEOUT_MS : PRICING_RETRY_TIMEOUT_MS),
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
      pricingCache = { map, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
      console.log(`porkbun pricing catalog loaded: ${map.size} TLDs (attempt ${attempt})`);
      return map;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`porkbun pricing catalog attempt ${attempt} failed: ${lastError}`);
    }
  }

  const empty = new Map<string, TldPrice>();
  pricingCache = { map: empty, expiresAt: Date.now() + 5 * 60 * 1000 };
  return empty;
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

// Circuit breaker: if RapidAPI answers 401/403 (key invalid / not subscribed)
// stop calling it for the lifetime of this isolate instead of burning a
// round-trip on every request. A 429 (quota) triggers a temporary cooldown.
let domainrDisabledReason: string | null = null;
let domainrDisabledUntil = 0;
let domainrCooldownUntil = 0;

async function checkDomainrBatch(domains: string[], rapidKey: string): Promise<Map<string, DomainrStatusEntry> | null> {
  if (domains.length === 0) return new Map();
  if (Date.now() < domainrDisabledUntil) return null;
  if (Date.now() < domainrCooldownUntil) return null;
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
          // Cooldown instead of a permanent kill switch: a transient auth blip
          // must not disable Domainr for the whole life of the isolate.
          domainrDisabledUntil = Date.now() + 5 * 60 * 1000;
          console.error(`domainr disabled for 5 min — ${domainrDisabledReason}. Check the RapidAPI subscription for domainr.p.rapidapi.com.`);
        } else if (resp.status === 429) {
          domainrCooldownUntil = Date.now() + 60_000;
          console.warn("domainr 429 — cooling down for 60s, RDAP/DNS results stand");
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
export type { DomainrVerdict } from "./availability-rules.ts";
export { interpretDomainr };


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
// L1 hot cache — per-isolate, in memory. A repeated search (user retypes, tweaks
// a filter, or another visitor hits the same warm isolate) skips both the DB
// round-trip and every network probe.
// ---------------------------------------------------------------------------
const HOT_CACHE_TTL_MS = 10 * 60 * 1000;
const HOT_CACHE_MAX = 5000;
const hotCache = new Map<string, { result: DomainCheckResult; expiresAt: number }>();
function pruneHotCache(): void {
  if (hotCache.size < HOT_CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of hotCache) if (v.expiresAt <= now) hotCache.delete(k);
  // Still oversized → drop least-recently-used (front of the Map).
  while (hotCache.size > HOT_CACHE_MAX) hotCache.delete(hotCache.keys().next().value as string);
}

// ---------------------------------------------------------------------------

// Resolve a single domain using RDAP + DNS only. GoDaddy is intentionally
// removed from the verification chain — production API access requires
// 50+ domains on the account or Reseller status, which we don't have.
//
// Speed: both probes start in parallel and whichever proves "taken" first wins
// immediately — we don't wait for the slower one just to confirm a negative.
// ---------------------------------------------------------------------------
const PENDING_FOREVER = <T,>(): Promise<T> => new Promise<T>(() => {});

async function resolveDomain(domain: string): Promise<DomainCheckResult> {
  const likelyPremium = isLikelyPremium(domain);
  // One controller per domain: the moment a decisive answer wins, every
  // still-running DNS/RDAP probe for this domain is cancelled. An aborted
  // probe is caught inside its own helper and simply reads as "lost".
  const ctl = new AbortController();
  const dnsP = checkDnsDoH(domain, ctl.signal);
  const rdapP = checkRdap(domain, ctl.signal);

  // Fast path: the first decisive "taken" signal ends the check.
  const winner = await Promise.race([
    rdapP.then((r) => (r === "taken" ? "rdap" : PENDING_FOREVER<string>())),
    dnsP.then((d) => (d === "has_records" ? "dns" : PENDING_FOREVER<string>())),
    Promise.all([dnsP, rdapP]).then(() => "settled"),
  ]);
  if (winner === "rdap" || winner === "dns") {
    ctl.abort();
    return { domain, available: false, checkedVia: winner, likelyPremium };
  }

  const [dns, rdap] = await Promise.all([dnsP, rdapP]);
  ctl.abort();

  // RDAP 404 is authoritative for "not registered" only when DNS also answers
  // NXDOMAIN. A DNS lookup error or ambiguous answer must not be treated as
  // confirmation that the name is free.
  if (rdap === "available" && dns === "no_records") {
    return {
      domain,
      available: true,
      checkedVia: "rdap",
      likelyPremium: likelyPremium || undefined,
    };
  }

  // Zones without a trustworthy RDAP server (.co, .me): a hard NXDOMAIN from
  // two independent resolvers means the name isn't delegated → not registered.
  if (rdap === "unknown" && dns === "no_records" && AGGREGATOR_UNRELIABLE_TLDS.has(domain.split(".").pop() ?? "")) {
    return {
      domain,
      available: true,
      checkedVia: "dns",
      likelyPremium: likelyPremium || undefined,
    };
  }

  // RDAP says available but DNS could not confirm NXDOMAIN → uncertain.
  if (rdap === "available" && dns === "error") {
    return { domain, available: false, checkedVia: "rdap", uncertain: true };
  }

  // Heuristic fallback — short SLD on premium TLD with no clear answer.
  if (likelyPremium) {
    return { domain, available: false, checkedVia: "heuristic", likelyPremium: true, uncertain: true };
  }

  return { domain, available: false, checkedVia: "unknown", uncertain: true };
}


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

// ---------------------------------------------------------------------------
// Lazily-created service-role client, reused across requests in this isolate.
// ---------------------------------------------------------------------------
let sharedClient: SupabaseClient | null = null;
export function getServiceClient(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return sharedClient;
}

/**
 * Core pipeline. Accepts raw domain strings, filters invalid ones, resolves
 * availability/pricing and returns results in the same order as the (valid)
 * input. Contains no rate limiting — that belongs to the HTTP wrappers.
 */
export async function checkDomains(
  domains: string[],
  deps: { supabase?: SupabaseClient } = {}
): Promise<DomainCheckResult[]> {
  const supabase = deps.supabase ?? getServiceClient();

  const batch = domains.slice(0, 50).filter(isValidDomain);
  if (batch.length === 0) return [];

  const porkbunKey = Deno.env.get("PORKBUN_API_KEY");
  const porkbunSecret = Deno.env.get("PORKBUN_SECRET_KEY");
  const porkbun = porkbunKey && porkbunSecret ? { key: porkbunKey, secret: porkbunSecret } : null;

  const rapidKey = Deno.env.get("RAPIDAPI_DOMAINR_KEY");

  // ---- L1: in-isolate hot cache (zero network, zero DB) ----------------
  const cachedMap = new Map<string, DomainCheckResult>();
  const nowMs = Date.now();
  const missAfterL1: string[] = [];
  for (const d of batch) {
    const hot = hotCache.get(d);
    if (hot && hot.expiresAt > nowMs) {
      // LRU touch: re-insert so the most recently used key moves to the end.
      hotCache.delete(d);
      hotCache.set(d, hot);
      cachedMap.set(d, { ...hot.result });
    } else missAfterL1.push(d);
  }

  // ---- L2: shared DB cache --------------------------------------------
  if (missAfterL1.length > 0) {
    const { data: cached } = await supabase
      .from("domain_cache")
      .select("domain, available, checked_via, rdap_data")
      .in("domain", missAfterL1)
      .gt("expires_at", new Date().toISOString());

    for (const c of cached ?? []) {
      const meta = (c.rdap_data ?? {}) as Record<string, unknown>;
      // Ignore rows written by older logic versions — they may encode stale
      // availability/premium interpretations.
      if ((meta.cache_version as number | undefined) !== CACHE_VERSION) continue;
      const result: DomainCheckResult = {
        domain: c.domain,
        available: c.available,
        checkedVia: c.checked_via,
        // Accept the legacy key so rows cached before the rename still resolve.
        price: (meta.reg_price ?? meta.godaddy_price) as number | undefined,
        premium: meta.premium as boolean | undefined,
        likelyPremium: meta.likely_premium as boolean | undefined,
        forSale: meta.for_sale as boolean | undefined,
        forSaleVia: meta.for_sale_via as string | undefined,
        listingUrl: meta.listing_url as string | undefined,
      };
      cachedMap.set(c.domain, result);
      pruneHotCache();
      hotCache.delete(c.domain);
      hotCache.set(c.domain, { result, expiresAt: nowMs + HOT_CACHE_TTL_MS });
    }
  }

  const uncached = batch.filter((d) => !cachedMap.has(d));

  // ---- Pass 1: free authoritative sources (RDAP + DNS) -----------------
  const baseResults = await pMap(uncached, 25, (d) => resolveDomain(d));

  // ---- Pass 2: Domainr, only where it adds value -----------------------
  const needsDomainr = baseResults
    .filter((r) => shouldEscalateToDomainr({ ...r, likelyPremium: r.likelyPremium ?? isLikelyPremium(r.domain) }))
    .map((r) => r.domain);

  const domainrResults = rapidKey && needsDomainr.length > 0
    ? await checkDomainrBatch(needsDomainr, rapidKey)
    : null;
  if (rapidKey) {
    console.log(
      `domainr consulted for ${needsDomainr.length}/${uncached.length} domains, returned=${domainrResults?.size ?? "null"}`
    );
  } else if (needsDomainr.length > 0) {
    console.warn("domainr key NOT set (RAPIDAPI_DOMAINR_KEY missing) — RDAP/DNS only");
  }

  const fresh: DomainCheckResult[] = [];
  for (const base of baseResults) {
    const verdict = interpretDomainr(domainrResults?.get(base.domain.toLowerCase()));
    const likelyPremium = base.likelyPremium ?? isLikelyPremium(base.domain);

    if (verdict.kind === "available") {
      // Registry-premium names ARE registerable — available:true + premium flag.
      fresh.push({
        domain: base.domain,
        available: true,
        checkedVia: "domainr",
        premium: verdict.premium || undefined,
        likelyPremium: verdict.premium || likelyPremium || undefined,
      });
    } else if (verdict.kind === "taken") {
      fresh.push({
        domain: base.domain,
        available: false,
        checkedVia: "domainr",
        likelyPremium,
        forSale: verdict.forSale || undefined,
        forSaleVia: verdict.forSale ? "Aftermarket" : undefined,
        listingUrl: verdict.forSale ? `https://www.afternic.com/domain/${base.domain}` : undefined,
      });
    } else {
      // No Domainr verdict. An absence-only "available" (RDAP 404 + NXDOMAIN)
      // cannot be distinguished from a registry-reserved / DPML-blocked name.
      // Downgrade to honest uncertain (never shown available, never priced,
      // never cached) when either:
      //   • Domainr was reachable but had no signal for this name, OR
      //   • the SLD trips the brand-block list — even with Domainr down
      //     (degraded-mode rider: this is what stops google.* from being sold).
      const absenceOnly =
        base.available && base.uncertain !== true &&
        (base.checkedVia === "rdap" || base.checkedVia === "dns");
      const downgrade = absenceOnly && (domainrResults !== null || isLikelyBlocked(base.domain));
      fresh.push(downgrade
        ? { domain: base.domain, available: false, checkedVia: base.checkedVia, uncertain: true }
        : base);
    }
  }

  // ---- Aftermarket NS detection ---------------------------------------
  const aftermarketTargets = fresh.filter((r) => !r.available && !r.uncertain && !r.forSale);
  if (aftermarketTargets.length > 0) {
    const hits = await pMap(aftermarketTargets, 20, async (r) => ({
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
  const pricing = getTldPricing();

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
    // Don't attach a standard retail price to likely-premium names until a
    // registrar has verified the real price.
    if (!r.available || r.price != null || r.likelyPremium) continue;
    const tld = r.domain.split(".").slice(1).join(".");
    const p = dbPrice.get(tld) ?? pricing.get(tld)?.registration;
    if (p != null) fresh[i] = { ...r, price: p };
  }

  // ---- Porkbun verification pass (rate-limited 1/10s) ----------------
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
          const price = pb.available
            ? (isPremium ? pb.price : (pb.price ?? standard ?? fresh[idx].price))
            : undefined;
          fresh[idx] = {
            ...fresh[idx],
            available: pb.available,
            checkedVia: "porkbun",
            price,
            premium: pb.available ? (isPremium || undefined) : undefined,
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
    const rows = cacheable.map(({ r, ttl }) => {
      // L1: keep it in this isolate too, so a repeat search is instant.
      pruneHotCache();
      hotCache.delete(r.domain);
      hotCache.set(r.domain, {
        result: r,
        expiresAt: Date.now() + Math.min(ttl * 1000, HOT_CACHE_TTL_MS),
      });
      return {
        domain: r.domain,
        available: r.available,
        checked_via: r.checkedVia,
        rdap_data: {
          cache_version: CACHE_VERSION,
          reg_price: r.price ?? null,
          premium: r.premium ?? false,
          likely_premium: r.likelyPremium ?? false,
          for_sale: r.forSale ?? false,
          for_sale_via: r.forSaleVia ?? null,
          listing_url: r.listingUrl ?? null,
        },
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    });
    // Persist in the background — the user's response doesn't wait for the write.
    const write = supabase.from("domain_cache").upsert(rows, { onConflict: "domain" });
    const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(Promise.resolve(write).catch(() => {}));
    else await write;
  }

  const all = new Map<string, DomainCheckResult>();
  for (const c of cachedMap.values()) all.set(c.domain, c);
  for (const r of fresh) all.set(r.domain, r);

  return batch.map(
    (d) => all.get(d) ?? { domain: d, available: false, checkedVia: "error", uncertain: true }
  );
}
