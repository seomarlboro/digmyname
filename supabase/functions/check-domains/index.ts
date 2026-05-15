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
}

// TLDs where short SLDs are almost always premium / aftermarket.
const PREMIUM_TLDS = new Set(["com", "io", "ai", "co", "app", "dev", "net", "org"]);

function isLikelyPremium(domain: string): boolean {
  const [sld, ...rest] = domain.split(".");
  const tld = rest.join(".");
  if (!sld || !tld) return false;
  // Short SLDs (≤4 chars) on premium TLDs are almost certainly registered/aftermarket.
  if (sld.length <= 4 && PREMIUM_TLDS.has(tld)) return true;
  // Common single dictionary words on .com are also aftermarket.
  if (tld === "com" && sld.length <= 5 && /^[a-z]+$/.test(sld)) return true;
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
// RDAP — authoritative for "registered yes/no" but no pricing.
// ---------------------------------------------------------------------------
type RdapState = "available" | "taken" | "unknown";

async function checkRdap(domain: string): Promise<RdapState> {
  try {
    const resp = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(4000),
    });
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

// ---------------------------------------------------------------------------
// GoDaddy — pricing + premium detection. Respects the `definitive` flag.
// ---------------------------------------------------------------------------
interface GoDaddyResult {
  available: boolean;
  definitive: boolean;
  price?: number;
  premium?: boolean;
}

async function checkGoDaddy(domain: string, apiKey: string, apiSecret: string): Promise<GoDaddyResult | null> {
  try {
    const baseUrl = Deno.env.get("GODADDY_ENV") === "production" ? "api.godaddy.com" : "api.ote-godaddy.com";
    const resp = await fetch(
      `https://${baseUrl}/v1/domains/available?domain=${encodeURIComponent(domain)}&checkType=FULL`,
      {
        headers: {
          Authorization: `sso-key ${apiKey}:${apiSecret}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!resp.ok) {
      await resp.text().catch(() => {});
      return null;
    }
    const data = await resp.json();
    const priceDollars = data.price != null ? Number(data.price) / 1_000_000 : undefined;
    // Lowered threshold: GoDaddy aftermarket starts well under $200.
    const isPremium = priceDollars != null && priceDollars >= 50;
    return {
      available: data.available === true,
      definitive: data.definitive === true,
      price: priceDollars,
      premium: isPremium,
    };
  } catch {
    return null;
  }
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

function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string" || domain.length === 0 || domain.length > 253) return false;
  const re = /^(?!.*\.\.)(?!.*--)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (!re.test(domain)) return false;
  return domain.split(".").every((l) => l.length >= 1 && l.length <= 63);
}

// Tiered cache TTL (P4).
function ttlSecondsFor(checkedVia: string, uncertain: boolean): number {
  if (uncertain) return 0; // never cache uncertain results
  switch (checkedVia) {
    case "godaddy_definitive": return 24 * 60 * 60; // 24h
    case "rdap": return 6 * 60 * 60;                 // 6h
    case "dns": return 30 * 60;                      // 30m
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Resolve a single domain by combining all signals.
// ---------------------------------------------------------------------------
async function resolveDomain(
  domain: string,
  godaddy: { key: string; secret: string } | null
): Promise<DomainCheckResult> {
  const [gd, dns, rdap] = await Promise.all([
    godaddy ? checkGoDaddy(domain, godaddy.key, godaddy.secret) : Promise.resolve(null),
    checkDnsDoH(domain),
    checkRdap(domain),
  ]);

  const likelyPremium = isLikelyPremium(domain);

  // 1. Trust GoDaddy when definitive.
  if (gd && gd.definitive) {
    return {
      domain,
      available: gd.available,
      checkedVia: "godaddy_definitive",
      price: gd.price,
      premium: gd.premium,
      likelyPremium: gd.premium || (gd.available && likelyPremium) ? true : undefined,
    };
  }

  // 2. RDAP is authoritative for registration status.
  if (rdap === "taken") {
    return { domain, available: false, checkedVia: "rdap", price: gd?.price, premium: gd?.premium, likelyPremium };
  }
  if (rdap === "available" && dns === "no_records") {
    // Both say "no" → confidently available. Premium heuristic still flags pricey aftermarket risk.
    return {
      domain,
      available: true,
      checkedVia: "rdap",
      price: gd?.price,
      premium: gd?.premium,
      likelyPremium: likelyPremium || gd?.premium ? true : undefined,
    };
  }

  // 3. DNS-only signal: records exist → taken.
  if (dns === "has_records") {
    return { domain, available: false, checkedVia: "dns", price: gd?.price, premium: gd?.premium, likelyPremium };
  }

  // 4. GoDaddy non-definitive but said "available" → still uncertain (often aftermarket).
  if (gd && gd.available) {
    return {
      domain,
      available: false,
      checkedVia: "godaddy_uncertain",
      price: gd.price,
      premium: gd.premium,
      likelyPremium: true,
      uncertain: true,
    };
  }

  // 5. Heuristic fallback — short SLD on premium TLD with no clear answer.
  if (likelyPremium) {
    return { domain, available: false, checkedVia: "heuristic", likelyPremium: true, uncertain: true };
  }

  // 6. All sources failed.
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

    const godaddyKey = Deno.env.get("GODADDY_API_KEY");
    const godaddySecret = Deno.env.get("GODADDY_API_SECRET");
    const godaddy = godaddyKey && godaddySecret ? { key: godaddyKey, secret: godaddySecret } : null;

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
        });
      }
    }

    const uncached = batch.filter((d) => !cachedMap.has(d));
    const fresh = await pMap(uncached, 10, (d) => resolveDomain(d, godaddy));

    // Telemetry (visible in edge logs).
    if (fresh.length > 0) {
      const dist: Record<string, number> = {};
      for (const r of fresh) dist[r.checkedVia] = (dist[r.checkedVia] ?? 0) + 1;
      console.log(`check-domains via=${JSON.stringify(dist)} n=${fresh.length}`);
    }

    // Cache only trustworthy results, with tiered TTL.
    const cacheable = fresh
      .map((r) => ({ r, ttl: ttlSecondsFor(r.checkedVia, r.uncertain === true) }))
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
