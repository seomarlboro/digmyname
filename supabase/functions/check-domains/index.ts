import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DomainCheckResult {
  domain: string;
  available: boolean;
  checkedVia: string;
  price?: number;
  premium?: boolean;
}

// Returns true if DNS records exist (domain is likely taken)
async function hasDnsRecords(domain: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "A");
    return records.length > 0;
  } catch {
    try {
      const ns = await Deno.resolveDns(domain, "NS");
      return ns.length > 0;
    } catch {
      return false;
    }
  }
}

async function checkRdap(domain: string): Promise<{ available: boolean; data?: Record<string, unknown> }> {
  try {
    const resp = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (resp.status === 404) {
      return { available: true };
    }

    if (resp.ok) {
      const data = await resp.json();
      return { available: false, data };
    }

    await resp.text();
    return { available: true };
  } catch {
    return { available: true };
  }
}

interface GoDaddyResult {
  available: boolean;
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
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`GoDaddy API error for ${domain}: ${resp.status} ${body}`);
      return null;
    }

    const data = await resp.json();
    // GoDaddy returns: { available, domain, definitive, price, currency }
    // price is in micro-units (1,000,000 = $1)
    const priceDollars = data.price != null ? data.price / 1_000_000 : undefined;
    const tld = domain.split(".").pop() ?? "";
    // Simple premium detection: if GoDaddy price is significantly above standard TLD prices
    const isPremium = priceDollars != null && priceDollars > 50 && !["ai", "inc", "gg"].includes(tld);

    return {
      available: data.available === true,
      price: priceDollars,
      premium: isPremium,
    };
  } catch {
    return null;
  }
}

function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string" || domain.length === 0 || domain.length > 253) return false;
  const domainRegex = /^(?!.*\.\.)(?!.*--)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (!domainRegex.test(domain)) return false;
  const labels = domain.split(".");
  return labels.every((l) => l.length >= 1 && l.length <= 63);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domains } = await req.json() as { domains: string[] };

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return new Response(
        JSON.stringify({ error: "domains array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batch = domains.slice(0, 50).filter(isValidDomain);

    if (batch.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid domains provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const godaddyKey = Deno.env.get("GODADDY_API_KEY");
    const godaddySecret = Deno.env.get("GODADDY_API_SECRET");
    const hasGoDaddy = Boolean(godaddyKey && godaddySecret);

    // Check cache first
    const { data: cached } = await supabase
      .from("domain_cache")
      .select("domain, available, checked_via, rdap_data")
      .in("domain", batch)
      .gt("expires_at", new Date().toISOString());

    const cachedMap = new Map<string, DomainCheckResult>();
    if (cached) {
      for (const c of cached) {
        // Extract cached price/premium from rdap_data if available
        const meta = c.rdap_data as Record<string, unknown> | null;
        cachedMap.set(c.domain, {
          domain: c.domain,
          available: c.available,
          checkedVia: c.checked_via,
          price: meta?.godaddy_price as number | undefined,
          premium: meta?.premium as boolean | undefined,
        });
      }
    }

    const uncached = batch.filter((d) => !cachedMap.has(d));
    const freshResults: DomainCheckResult[] = [];

    if (uncached.length > 0) {
      // Check GoDaddy for pricing (parallel, max 10 concurrent)
      const godaddyResults = new Map<string, GoDaddyResult>();
      if (hasGoDaddy) {
        const chunks: string[][] = [];
        for (let i = 0; i < uncached.length; i += 10) {
          chunks.push(uncached.slice(i, i + 10));
        }
        for (const chunk of chunks) {
          const results = await Promise.all(
            chunk.map(async (domain) => {
              const result = await checkGoDaddy(domain, godaddyKey!, godaddySecret!);
              return { domain, result };
            })
          );
          for (const { domain, result } of results) {
            if (result) godaddyResults.set(domain, result);
          }
        }
      }

      // DNS + RDAP for domains where GoDaddy didn't give definitive answer
      const dnsResults = await Promise.all(
        uncached.map(async (domain) => {
          const hasRecords = await hasDnsRecords(domain);
          return { domain, hasRecords };
        })
      );

      const needRdap = dnsResults.filter((r) => !r.hasRecords && !godaddyResults.has(r.domain));
      const rdapResults = await Promise.all(
        needRdap.map(async ({ domain }) => {
          const rdap = await checkRdap(domain);
          return { domain, ...rdap };
        })
      );
      const rdapMap = new Map(rdapResults.map((r) => [r.domain, r]));

      for (const dns of dnsResults) {
        const gd = godaddyResults.get(dns.domain);

        let available: boolean;
        let checkedVia: string;

        if (gd) {
          available = gd.available;
          checkedVia = "godaddy";
        } else if (dns.hasRecords) {
          available = false;
          checkedVia = "dns";
        } else {
          const rdap = rdapMap.get(dns.domain);
          available = rdap ? rdap.available : true;
          checkedVia = rdap ? "rdap" : "dns";
        }

        freshResults.push({
          domain: dns.domain,
          available,
          checkedVia,
          price: gd?.price,
          premium: gd?.premium,
        });
      }

      // Cache results
      if (freshResults.length > 0) {
        const rows = freshResults.map((r) => ({
          domain: r.domain,
          available: r.available,
          checked_via: r.checkedVia,
          rdap_data: r.price != null ? { godaddy_price: r.price, premium: r.premium ?? false } : null,
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        }));

        await supabase
          .from("domain_cache")
          .upsert(rows, { onConflict: "domain" });
      }
    }

    const allResults: DomainCheckResult[] = [
      ...Array.from(cachedMap.values()),
      ...freshResults,
    ];

    const resultMap = new Map(allResults.map((r) => [r.domain, r]));
    const ordered = batch.map((d) => resultMap.get(d) ?? { domain: d, available: false, checkedVia: "error" });

    return new Response(JSON.stringify({ results: ordered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-domains error:", err instanceof Error ? err.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
