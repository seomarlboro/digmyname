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

function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string" || domain.length === 0 || domain.length > 253) return false;
  // Must have at least one dot, no consecutive dots/hyphens, valid label lengths
  const domainRegex = /^(?!.*\.\.)(?!.*--)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (!domainRegex.test(domain)) return false;
  // Reject domains with labels longer than 63 chars
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

    // Validate and limit batch size
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
          const hasRecords = await hasDnsRecords(domain);
          return { domain, hasRecords };
        })
      );

      // DNS finds records → taken (fast path). No records → RDAP to confirm.
      const needRdap = dnsResults.filter((r) => !r.hasRecords);
      const rdapResults = await Promise.all(
        needRdap.map(async ({ domain }) => {
          const rdap = await checkRdap(domain);
          return { domain, ...rdap };
        })
      );

      const rdapMap = new Map(rdapResults.map((r) => [r.domain, r]));

      for (const dns of dnsResults) {
        if (dns.hasRecords) {
          freshResults.push({ domain: dns.domain, available: false, checkedVia: "dns" });
        } else {
          const rdap = rdapMap.get(dns.domain);
          freshResults.push({
            domain: dns.domain,
            available: rdap ? rdap.available : true,
            checkedVia: rdap ? "rdap" : "dns",
          });
        }
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
    console.error("check-domains error:", err instanceof Error ? err.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
