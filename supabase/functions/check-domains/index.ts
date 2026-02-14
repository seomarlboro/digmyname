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
}

async function checkDns(domain: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "NS");
    return records.length === 0;
  } catch (err) {
    // NXDOMAIN or SERVFAIL typically means domain doesn't exist = available
    if (err instanceof Deno.errors.NotFound) {
      return true;
    }
    // For NotCapable or other errors, try A record as fallback
    try {
      const aRecords = await Deno.resolveDns(domain, "A");
      return aRecords.length === 0;
    } catch {
      // If DNS resolution fails completely, domain is likely available
      return true;
    }
  }
}

async function checkRdap(domain: string): Promise<{ available: boolean; data?: Record<string, unknown> }> {
  try {
    const resp = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (resp.status === 404) {
      // 404 = domain not found in RDAP = available
      return { available: true };
    }

    if (resp.ok) {
      const data = await resp.json();
      return { available: false, data };
    }

    // Non-200/404 — inconclusive, consume body
    await resp.text();
    return { available: true };
  } catch {
    // Timeout or network error — inconclusive, assume available
    return { available: true };
  }
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

    // Limit batch size
    const batch = domains.slice(0, 50);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache first
    const { data: cached } = await supabase
      .from("domain_cache")
      .select("domain, available, checked_via")
      .in("domain", batch)
      .gt("expires_at", new Date().toISOString());

    const cachedMap = new Map<string, DomainCheckResult>();
    if (cached) {
      for (const c of cached) {
        cachedMap.set(c.domain, {
          domain: c.domain,
          available: c.available,
          checkedVia: c.checked_via,
        });
      }
    }

    const uncached = batch.filter((d) => !cachedMap.has(d));
    const freshResults: DomainCheckResult[] = [];

    // DNS check all uncached domains in parallel
    if (uncached.length > 0) {
      const dnsResults = await Promise.all(
        uncached.map(async (domain) => {
          const available = await checkDns(domain);
          return { domain, available };
        })
      );

      // For domains that DNS says are taken, do RDAP to confirm
      // For available ones, trust DNS (fast path)
      const rdapChecks = dnsResults.filter((r) => !r.available);
      const rdapResults = await Promise.all(
        rdapChecks.map(async ({ domain }) => {
          const rdap = await checkRdap(domain);
          return { domain, ...rdap };
        })
      );

      const rdapMap = new Map(rdapResults.map((r) => [r.domain, r]));

      for (const dns of dnsResults) {
        const rdap = rdapMap.get(dns.domain);
        const result: DomainCheckResult = {
          domain: dns.domain,
          available: rdap ? rdap.available : dns.available,
          checkedVia: rdap ? "rdap" : "dns",
        };
        freshResults.push(result);
      }

      // Cache results (upsert)
      if (freshResults.length > 0) {
        const rows = freshResults.map((r) => ({
          domain: r.domain,
          available: r.available,
          checked_via: r.checkedVia,
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        }));

        await supabase
          .from("domain_cache")
          .upsert(rows, { onConflict: "domain" });
      }
    }

    // Merge cached + fresh
    const allResults: DomainCheckResult[] = [
      ...Array.from(cachedMap.values()),
      ...freshResults,
    ];

    // Return in same order as input
    const resultMap = new Map(allResults.map((r) => [r.domain, r]));
    const ordered = batch.map((d) => resultMap.get(d) ?? { domain: d, available: false, checkedVia: "error" });

    return new Response(JSON.stringify({ results: ordered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-domains error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
