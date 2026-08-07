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

    console.log(`Done: ${upserted} prices upserted, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        scraped: allPrices.length,
        upserted,
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
