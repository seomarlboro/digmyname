import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mergePrices,
  parseGodaddyTldPage,
  parseNamecheapTldList,
  parseOvhTldPage,
  parseTldSpyMarkdown,
  type ParsedPrice,
} from "./parsers.ts";

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
  "io", "ai", "app", "dev", "tech", "digital", "cloud", "software", "systems",
  "build", "run", "page", "link", "tools",
  // Startup / Business
  "co", "agency", "company", "ventures", "capital", "inc",
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
const TRACKED = new Set(TRACKED_TLDS);

// tldspy.com aggregates registrars, but its per-registrar pages list only the
// ~17-18 core TLDs and its per-TLD pages are members-only. It stays the source
// for Cloudflare and Spaceship (no scrapable own list) and a first pass for the rest.
const REGISTRAR_SOURCES: Record<string, { url: string }> = {
  Cloudflare: { url: "https://tldspy.com/registrar/cloudflare" },
  GoDaddy: { url: "https://tldspy.com/registrar/godaddy" },
  OVHcloud: { url: "https://tldspy.com/registrar/ovhcloud" },
  Porkbun: { url: "https://tldspy.com/registrar/porkbun" },
  Spaceship: { url: "https://tldspy.com/registrar/spaceship" },
  Namecheap: { url: "https://tldspy.com/registrar/namecheap" },
};

// Registrars' own pages (server-rendered, verified 2026-09-10) fill the long tail.
const NAMECHEAP_LIST_URL = "https://www.namecheap.com/domains/full-tld-list/";
const ovhTldUrl = (tld: string) => `https://www.ovhcloud.com/en/domains/tld/${tld}/`;
const godaddyTldUrl = (tld: string) => `https://www.godaddy.com/tlds/${tld}-domain`;

/** Direct fetches per registrar run this many at a time — polite, and well inside the function's wall clock. */
const PAGE_CONCURRENCY = 4;
/** Firecrawl is billed per call: cap the fallbacks a single run may spend on registrar pages. */
const FIRECRAWL_FALLBACK_CAP = 24;

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 DigMyNamePriceBot/1.0 (+https://digmyname.com)",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
};

interface SourceReport {
  source: string;
  attempted: number;
  fetched: number;
  parsed: number;
  firecrawlUsed: number;
  errors: string[];
  sample?: ParsedPrice[];
}

type FetchResult = { ok: true; body: string; status: number } | { ok: false; status: number; error: string };

async function fetchPage(url: string): Promise<FetchResult> {
  try {
    const resp = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
    const body = await resp.text();
    if (!resp.ok) return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
    return { ok: true, body, status: resp.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Firecrawl scrape; `formats` decides whether we get markdown (tldspy tables) or the raw HTML (registrar pages). */
async function firecrawl(apiKey: string, url: string, format: "markdown" | "rawHtml"): Promise<FetchResult> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: [format], onlyMainContent: format === "markdown", waitFor: 3000 }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, status: response.status, error: `firecrawl HTTP ${response.status} ${data?.error ?? ""}`.trim() };
    const body: string = data.data?.[format] ?? data[format] ?? "";
    if (!body) return { ok: false, status: response.status, error: "firecrawl: empty body" };
    return { ok: true, body, status: response.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Registrar own-page source: fetch each TLD's page directly; when the direct
 * fetch fails or the page doesn't parse (bot wall, redirect), spend a Firecrawl
 * raw-HTML fallback — up to the shared cap for the run.
 */
async function scrapePerTldPages(
  name: string,
  tlds: string[],
  urlFor: (tld: string) => string,
  parse: (html: string, tld: string) => ParsedPrice | null,
  firecrawlKey: string | undefined,
  fallbackBudget: { left: number },
): Promise<{ prices: ParsedPrice[]; report: SourceReport }> {
  const report: SourceReport = { source: name, attempted: tlds.length, fetched: 0, parsed: 0, firecrawlUsed: 0, errors: [] };
  const prices: ParsedPrice[] = [];
  await mapConcurrent(tlds, PAGE_CONCURRENCY, async (tld) => {
    const url = urlFor(tld);
    let res = await fetchPage(url);
    let parsed = res.ok ? parse(res.body, tld) : null;
    if (res.ok) report.fetched++;
    if (!parsed && firecrawlKey && fallbackBudget.left > 0) {
      fallbackBudget.left--;
      report.firecrawlUsed++;
      const fc = await firecrawl(firecrawlKey, url, "rawHtml");
      if (fc.ok) {
        res = fc;
        parsed = parse(fc.body, tld);
      } else {
        report.errors.push(`${tld}: ${fc.error}`);
      }
    }
    if (parsed) {
      prices.push(parsed);
      report.parsed++;
    } else if (report.errors.length < 40) {
      report.errors.push(`${tld}: ${res.ok ? "page fetched but no price found" : res.error}`);
    }
  });
  report.sample = prices.slice(0, 3);
  return { prices, report };
}

interface RunOptions {
  /** Report what every source would write, write nothing. */
  dryRun: boolean;
  /** Restrict per-TLD sources to these TLDs (dry runs, debugging). */
  tlds?: string[];
  /** Restrict to these sources: tldspy | porkbun | namecheap | ovh | godaddy. */
  sources?: string[];
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

  const startedAt = Date.now();
  try {
    let opts: RunOptions = { dryRun: false };
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        opts = {
          dryRun: body.dryRun === true,
          tlds: Array.isArray(body.tlds) ? body.tlds.map((t: unknown) => String(t).toLowerCase()).filter((t: string) => TRACKED.has(t)) : undefined,
          sources: Array.isArray(body.sources) ? body.sources.map((s: unknown) => String(s)) : undefined,
        };
      }
    } catch {
      /* empty body → defaults */
    }
    const wants = (s: string) => !opts.sources || opts.sources.includes(s);
    const tlds = opts.tlds?.length ? opts.tlds : TRACKED_TLDS;

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? undefined;
    const reports: SourceReport[] = [];
    const fallbackBudget = { left: FIRECRAWL_FALLBACK_CAP };

    // ---- 1. tldspy per-registrar pages (Firecrawl markdown) ------------------
    const tldspyPrices: ParsedPrice[] = [];
    if (wants("tldspy")) {
      const report: SourceReport = { source: "tldspy", attempted: 0, fetched: 0, parsed: 0, firecrawlUsed: 0, errors: [] };
      if (!firecrawlKey) {
        report.errors.push("FIRECRAWL_API_KEY not configured");
      } else {
        for (const [registrar, source] of Object.entries(REGISTRAR_SOURCES)) {
          report.attempted++;
          report.firecrawlUsed++;
          const res = await firecrawl(firecrawlKey, source.url, "markdown");
          if (!res.ok) {
            report.errors.push(`${registrar}: ${res.error}`);
            continue;
          }
          report.fetched++;
          const parsed = parseTldSpyMarkdown(res.body, registrar, TRACKED);
          report.parsed += parsed.length;
          tldspyPrices.push(...parsed);
          console.log(`tldspy ${registrar}: ${parsed.length} TLD prices`);
        }
      }
      report.sample = tldspyPrices.slice(0, 3);
      reports.push(report);
    }

    // ---- 2. Porkbun public catalog — every tracked TLD -------------------------
    const porkbunPrices: ParsedPrice[] = [];
    if (wants("porkbun")) {
      const report: SourceReport = { source: "porkbun", attempted: 1, fetched: 0, parsed: 0, firecrawlUsed: 0, errors: [] };
      try {
        const resp = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(20000),
        });
        const data = await resp.json();
        if (!resp.ok || data?.status !== "SUCCESS" || !data.pricing) {
          report.errors.push(`porkbun catalog HTTP ${resp.status} status=${data?.status}`);
        } else {
          report.fetched = 1;
          for (const tld of tlds) {
            const v = data.pricing[tld] as Record<string, string> | undefined;
            const reg = Number(v?.registration);
            const renew = Number(v?.renewal);
            const transfer = v?.transfer != null ? Number(v.transfer) : NaN;
            if (Number.isFinite(reg) && reg > 0) {
              porkbunPrices.push({
                registrar: "Porkbun",
                tld,
                reg_price: reg,
                renew_price: Number.isFinite(renew) && renew > 0 ? renew : reg,
                transfer_price: Number.isFinite(transfer) ? transfer : null,
              });
            }
          }
          report.parsed = porkbunPrices.length;
        }
      } catch (e) {
        report.errors.push(`porkbun catalog failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      report.sample = porkbunPrices.slice(0, 3);
      reports.push(report);
    }

    // ---- 3. Namecheap full TLD list (one server-rendered page) -----------------
    const namecheapPrices: ParsedPrice[] = [];
    if (wants("namecheap")) {
      const report: SourceReport = { source: "namecheap", attempted: 1, fetched: 0, parsed: 0, firecrawlUsed: 0, errors: [] };
      let res = await fetchPage(NAMECHEAP_LIST_URL);
      let parsed = res.ok ? parseNamecheapTldList(res.body, new Set(tlds)) : [];
      if (res.ok) report.fetched = 1;
      if (parsed.length === 0 && firecrawlKey && fallbackBudget.left > 0) {
        fallbackBudget.left--;
        report.firecrawlUsed = 1;
        res = await firecrawl(firecrawlKey, NAMECHEAP_LIST_URL, "rawHtml");
        parsed = res.ok ? parseNamecheapTldList(res.body, new Set(tlds)) : [];
      }
      if (!res.ok) report.errors.push(res.error);
      else if (parsed.length === 0) report.errors.push("page fetched but no rows parsed");
      namecheapPrices.push(...parsed);
      report.parsed = parsed.length;
      report.sample = parsed.slice(0, 3);
      reports.push(report);
    }

    // ---- 4. OVHcloud per-TLD pages ------------------------------------------------
    let ovhPrices: ParsedPrice[] = [];
    if (wants("ovh")) {
      const r = await scrapePerTldPages("ovh", tlds, ovhTldUrl, parseOvhTldPage, firecrawlKey, fallbackBudget);
      ovhPrices = r.prices;
      reports.push(r.report);
    }

    // ---- 5. GoDaddy per-TLD pages -------------------------------------------------
    let godaddyPrices: ParsedPrice[] = [];
    if (wants("godaddy")) {
      const r = await scrapePerTldPages("godaddy", tlds, godaddyTldUrl, parseGodaddyTldPage, firecrawlKey, fallbackBudget);
      godaddyPrices = r.prices;
      reports.push(r.report);
    }

    // The registrar's own page beats the aggregator for the same (registrar, tld).
    const allPrices = mergePrices(tldspyPrices, porkbunPrices, namecheapPrices, ovhPrices, godaddyPrices);
    const perRegistrar: Record<string, number> = {};
    for (const p of allPrices) perRegistrar[p.registrar] = (perRegistrar[p.registrar] ?? 0) + 1;

    if (opts.dryRun) {
      return new Response(
        JSON.stringify({ success: true, dryRun: true, ms: Date.now() - startedAt, perRegistrar, total: allPrices.length, reports }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Upsert prices into database -----------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();
    let upserted = 0;
    const upsertErrors: string[] = [];
    for (const p of allPrices) {
      const row: Record<string, unknown> = {
        registrar: p.registrar,
        tld: p.tld,
        reg_price: p.reg_price,
        renew_price: p.renew_price,
        transfer_price: p.transfer_price,
        supported: true,
        verified_at: now,
        updated_at: now,
      };
      if (p.icann_fee !== undefined) row.icann_fee = p.icann_fee;
      const { error } = await supabase.from("registrar_prices").upsert(row, { onConflict: "registrar,tld" });
      if (error) {
        upsertErrors.push(`${p.registrar}/${p.tld}: ${error.message}`);
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
      upsertErrors.push(`quarantine: ${quarantineError.message}`);
    } else {
      quarantined = staleRows?.length ?? 0;
      console.log(`Auto-quarantined ${quarantined} stale price rows (verified_at < ${staleCutoff})`);
    }

    console.log(`Done in ${Date.now() - startedAt}ms: ${upserted} prices upserted, ${quarantined} quarantined, per registrar ${JSON.stringify(perRegistrar)}`);

    return new Response(
      JSON.stringify({
        success: true,
        ms: Date.now() - startedAt,
        scraped: allPrices.length,
        perRegistrar,
        upserted,
        quarantined,
        errors: [...reports.flatMap((r) => r.errors.map((e) => `${r.source}: ${e}`)), ...upsertErrors],
        reports,
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
