import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Admin-only function: triggers paid Firecrawl scraping. Tightly locked.
// CORS deliberately disabled — browsers should NEVER call this.
const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
};

/**
 * Authorize callers: must present EITHER
 *   • Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>, OR
 *   • x-cron-secret: <CRON_SECRET>
 */
function isAuthorized(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");

  const auth = req.headers.get("authorization") ?? "";
  if (serviceRole && auth === `Bearer ${serviceRole}`) return true;

  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && provided === cronSecret) return true;

  return false;
}

// TLDs we track
const TRACKED_TLDS = [
  // Classic
  "com", "net", "org", "info", "biz",
  // Tech
  "io", "ai", "app", "dev", "tech", "digital", "cloud", "code", "software", "systems",
  "build", "run", "page", "link", "tools",
  // Startup / Business
  "co", "startup", "agency", "company", "ventures", "capital", "inc",
  // Creative
  "design", "studio", "art", "media",
  // Short / Brandable
  "xyz", "me", "cc", "tv", "gg", "so",
  // E-commerce
  "shop", "store", "market", "buy",
  // Community / Social
  "community", "social", "club", "group",
  // Finance
  "finance", "money", "fund",
  // Other popular
  "life", "world", "site", "online", "space", "pro", "one", "wtf", "lol",
];

// Registrar pricing page URLs for Firecrawl scraping
const REGISTRAR_SOURCES: Record<string, { url: string; parseMode: "tldspy" | "porkbun" | "namecheap" | "spaceship" }> = {
  // TLDSpy aggregates multiple registrars — we scrape per-registrar pages
  Cloudflare: { url: "https://tldspy.com/registrar/cloudflare", parseMode: "tldspy" },
  GoDaddy: { url: "https://tldspy.com/registrar/godaddy", parseMode: "tldspy" },
  OVHcloud: { url: "https://tldspy.com/registrar/ovhcloud", parseMode: "tldspy" },
  Porkbun: { url: "https://tldspy.com/registrar/porkbun", parseMode: "tldspy" },
  Spaceship: { url: "https://tldspy.com/registrar/spaceship", parseMode: "tldspy" },
  Namecheap: { url: "https://tldspy.com/registrar/namecheap", parseMode: "tldspy" },
};

interface ParsedPrice {
  registrar: string;
  tld: string;
  reg_price: number;
  renew_price: number;
  transfer_price: number | null;
}

function parseTldSpyMarkdown(markdown: string, registrar: string): ParsedPrice[] {
  const results: ParsedPrice[] = [];

  // TLDSpy uses markdown tables: | .com | $10.46 | $10.46 | $10.46 | ...
  const lines = markdown.split("\n");
  for (const line of lines) {
    if (!line.includes("|") || !line.includes("$")) continue;

    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;

    // Find TLD cell
    const tldCell = cells[0];
    const tldMatch = tldCell.match(/\.(\w+)/);
    if (!tldMatch) continue;

    const tld = tldMatch[1].toLowerCase();
    if (!TRACKED_TLDS.includes(tld)) continue;

    // Extract prices from cells
    const prices = cells.slice(1).map((c) => {
      const m = c.match(/\$?([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    });

    const regPrice = prices[0];
    const renewPrice = prices[1];
    const transferPrice = prices[2] ?? null;

    if (regPrice != null && renewPrice != null && regPrice > 0 && renewPrice > 0) {
      results.push({
        registrar,
        tld,
        reg_price: regPrice,
        renew_price: renewPrice,
        transfer_price: transferPrice,
      });
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const allPrices: ParsedPrice[] = [];
    const errors: string[] = [];

    // Scrape each registrar page
    for (const [registrar, source] of Object.entries(REGISTRAR_SOURCES)) {
      try {
        console.log(`Scraping ${registrar} from ${source.url}`);
        const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: source.url,
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          errors.push(`${registrar}: HTTP ${response.status}`);
          console.error(`Error scraping ${registrar}: HTTP ${response.status} - ${data?.error || 'Unknown error'}`);
          continue;
        }

        const markdown = data.data?.markdown || data.markdown || "";
        if (!markdown) {
          errors.push(`${registrar}: empty markdown`);
          continue;
        }

        const parsed = parseTldSpyMarkdown(markdown, registrar);
        console.log(`${registrar}: parsed ${parsed.length} TLD prices`);
        allPrices.push(...parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${registrar}: ${msg}`);
        console.error(`Error scraping ${registrar}:`, msg);
      }
    }

    // ---- Catalog sources for long-tail TLDs (fault-tolerant, gap-filling) --------
    // TLDSpy per-registrar pages only list ~core TLDs. These two no-auth catalog
    // sources cover the long-tail (Porkbun ~627 TLDs, Cloudflare ~400 at-cost).
    // Each is wrapped so a failure is logged and skipped — never breaks the run.
    // We only FILL GAPS: a TLD already priced by TLDSpy this run is left as-is.
    const tldsCoveredByTldspy = new Set(allPrices.map((p) => p.tld));
    const needsCatalog = TRACKED_TLDS.filter((t) => !tldsCoveredByTldspy.has(t));

    // Source 1 (primary): Porkbun public pricing catalog — no auth.
    // POST https://api.porkbun.com/api/json/v3/pricing/get
    //   -> { status:"SUCCESS", pricing: { <tld>: { registration, renewal, transfer } } }
    async function fetchPorkbunCatalog(): Promise<Map<string, { reg: number; renew: number; transfer: number | null }>> {
      const out = new Map<string, { reg: number; renew: number; transfer: number | null }>();
      try {
        const resp = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) { console.warn(`porkbun catalog HTTP ${resp.status}`); return out; }
        const data = await resp.json();
        if (data?.status !== "SUCCESS" || !data.pricing) { console.warn("porkbun catalog non-success"); return out; }
        for (const [tld, v] of Object.entries(data.pricing as Record<string, Record<string, string>>)) {
          const reg = Number(v?.registration);
          const renew = Number(v?.renewal);
          const transfer = v?.transfer != null ? Number(v.transfer) : null;
          if (Number.isFinite(reg) && Number.isFinite(renew) && reg > 0) {
            out.set(tld.toLowerCase(), { reg, renew: Number.isFinite(renew) ? renew : reg, transfer: (transfer != null && Number.isFinite(transfer)) ? transfer : null });
          }
        }
        console.log(`porkbun catalog: ${out.size} TLDs`);
      } catch (e) {
        console.warn(`porkbun catalog failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      return out;
    }

    // Source 2 (backup): Cloudflare wholesale at-cost prices, community-maintained
    // JSON. No auth. Cloudflare is flat (reg == renew, at-cost). Try a couple of
    // known raw locations; if all fail, skip silently.
    async function fetchCloudflareCatalog(): Promise<Map<string, number>> {
      const out = new Map<string, number>();
      const urls = [
        "https://raw.githubusercontent.com/matteotrubini/cloudflare-registrar-domain-prices/master/prices.json",
        "https://raw.githubusercontent.com/matteotrubini/cloudflare-registrar-domain-prices/main/prices.json",
      ];
      for (const url of urls) {
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!resp.ok) continue;
          const data = await resp.json();
          // Expected shape: { "com": 10.44, "io": 34.0, ... } OR { "com": { price: 10.44 } }
          for (const [tld, v] of Object.entries(data as Record<string, unknown>)) {
            const price = typeof v === "number" ? v : Number((v as { price?: unknown })?.price);
            if (Number.isFinite(price) && price > 0) out.set(tld.toLowerCase(), price as number);
          }
          if (out.size > 0) { console.log(`cloudflare catalog: ${out.size} TLDs from ${url}`); break; }
        } catch (e) {
          console.warn(`cloudflare catalog ${url} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return out;
    }

    if (needsCatalog.length > 0) {
      const [porkbunCat, cloudflareCat] = await Promise.all([fetchPorkbunCatalog(), fetchCloudflareCatalog()]);
      for (const tld of needsCatalog) {
        // Primary: Porkbun (has reg+renew+transfer).
        const pb = porkbunCat.get(tld);
        if (pb) {
          allPrices.push({ registrar: "Porkbun", tld, reg_price: pb.reg, renew_price: pb.renew, transfer_price: pb.transfer });
          continue;
        }
        // Backup: Cloudflare at-cost (flat: reg == renew, no transfer figure).
        const cf = cloudflareCat.get(tld);
        if (cf) {
          allPrices.push({ registrar: "Cloudflare", tld, reg_price: cf, renew_price: cf, transfer_price: null });
        }
        // else: neither source had it — leave supported=false (honest "Check price").
      }
      console.log(`catalog gap-fill: ${needsCatalog.length} TLDs needed, ${allPrices.length} total prices after catalog`);
    }

    // Upsert prices into database

    let upserted = 0;
    for (const p of allPrices) {
      const { error } = await supabase
        .from("registrar_prices")
        .upsert(
          {
            registrar: p.registrar,
            tld: p.tld,
            reg_price: p.reg_price,
            renew_price: p.renew_price,
            transfer_price: p.transfer_price,
            supported: true,
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "registrar,tld" }
        );

      if (error) {
        console.error(`Upsert error for ${p.registrar}/${p.tld}:`, error.message);
      } else {
        upserted++;
      }
    }

    // Auto-quarantine: any row not re-verified in the last 21 days is no longer
    // trustworthy, so we flip supported=false and it falls through to the honest
    // "Check price" state. Rows with verified_at IS NULL are the old manually
    // quarantined seed cohort and are deliberately left alone.
    let quarantined = 0;
    const staleCutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleRows, error: quarantineError } = await supabase
      .from("registrar_prices")
      .update({ supported: false })
      .lt("verified_at", staleCutoff)
      .eq("supported", true)
      .select("id");

    if (quarantineError) {
      console.error("Auto-quarantine error:", quarantineError.message);
      errors.push(`quarantine: ${quarantineError.message}`);
    } else {
      quarantined = staleRows?.length ?? 0;
      console.log(`Auto-quarantined ${quarantined} stale price rows (verified_at < ${staleCutoff})`);
    }

    console.log(`Done: ${upserted} prices upserted, ${quarantined} quarantined, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        scraped: allPrices.length,
        upserted,
        quarantined,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fatal error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
