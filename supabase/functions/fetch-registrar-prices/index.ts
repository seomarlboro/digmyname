import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mergePrices,
  parseGodaddyTldPage,
  parseNamecheapMarkdown,
  parseNamecheapTldList,
  parseOvhTldPage,
  parseTldListExtensions,
  parseTldSpyMarkdown,
  rotationSlice,
  stripTags,
  TLDLIST_REGISTRARS,
  weekIndex,
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

/**
 * Primary source: tld-list.com's API (https://tld-list.com/docs-api). One POST
 * returns every tracked registrar × TLD with promos, terms and ICANN fees, so a
 * run that gets an answer from it skips every scraper below (and spends no
 * Firecrawl credit). Needs a subscription keypair in TLDLIST_API_PUBLIC /
 * TLDLIST_API_PRIVATE; without the keys the scrapers run as before.
 * Rate limit is 100 requests / 15 min — a run makes exactly one.
 */
const TLDLIST_API_URL = "https://api.tld-list.com/v1/extension/get";

// Fallback scrapers.
// tldspy.com aggregates registrars, but its per-registrar pages list only the
// ~17-18 core TLDs and its per-TLD pages are members-only. It stays the source
// for Cloudflare and Spaceship (no scrapable own list) and a first pass for the rest.
// Porkbun (public catalog) and OVHcloud (own pages, plain fetch) no longer need
// tldspy, which keeps the run's Firecrawl calls inside a small plan's rate limit.
const REGISTRAR_SOURCES: Record<string, { url: string }> = {
  Cloudflare: { url: "https://tldspy.com/registrar/cloudflare" },
  GoDaddy: { url: "https://tldspy.com/registrar/godaddy" },
  Spaceship: { url: "https://tldspy.com/registrar/spaceship" },
  Namecheap: { url: "https://tldspy.com/registrar/namecheap" },
};

// Registrars' own pages (server-rendered, verified 2026-09-10) fill the long tail.
//   - OVHcloud answers a plain fetch (no Firecrawl needed).
//   - GoDaddy and Namecheap sit behind bot walls for a plain fetch (0/5 in the
//     first live dry run) and are read through Firecrawl.
const NAMECHEAP_LIST_URL = "https://www.namecheap.com/domains/full-tld-list/";
const ovhTldUrl = (tld: string) => `https://www.ovhcloud.com/en/domains/tld/${tld}/`;
const godaddyTldUrl = (tld: string) => `https://www.godaddy.com/tlds/${tld}-domain`;

/**
 * GoDaddy costs one Firecrawl credit per TLD page and the plan allows ~10
 * scrapes/min, so only the TLDs tldspy does not already cover are scraped, a
 * quarter of them per weekly run. Every row is still re-verified inside the
 * quarantine window below.
 */
const GODADDY_ROTATION_PARTS = 4;
/** Rows not re-verified within this many days flip to supported=false ("Check price"). Must exceed the slowest rotation (4 weeks). */
const QUARANTINE_DAYS = 30;

/** Direct fetches per registrar run this many at a time — polite, and well inside the function's wall clock. */
const DIRECT_CONCURRENCY = 4;
/**
 * Firecrawl on the current plan: 10 requests/min, 2 concurrent browsers (the
 * 2026-09-10 run hit 429 + 408 with anything more). Every Firecrawl call in a
 * run goes through one pacer: strictly sequential, starts ≥ 6.5 s apart.
 */
const FIRECRAWL_MIN_INTERVAL_MS = 6500;
/** Firecrawl is billed per call: cap what a single run may spend on registrar pages (tldspy's pages are on top). */
const FIRECRAWL_PAGE_CAP = 16;

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
  /** Histogram of direct-fetch outcomes, e.g. { "403": 5 } — says whether a source needs Firecrawl. */
  directStatus: Record<string, number>;
  errors: string[];
  sample?: ParsedPrice[];
  /** First characters of a page that fetched but did not parse (what did we actually get?). */
  unparsedSnippet?: string;
  ms?: number;
}

const newReport = (source: string): SourceReport => ({ source, attempted: 0, fetched: 0, parsed: 0, firecrawlUsed: 0, directStatus: {}, errors: [] });
const snippet = (html: string) => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  return `${title ? `title="${stripTags(title).slice(0, 80)}" ` : ""}${stripTags(html).slice(0, 220)}`;
};

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One pacer per run: serialises every Firecrawl call and spaces their starts. */
class FirecrawlPacer {
  private chain: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;
  run<T>(fn: () => Promise<T>): Promise<T> {
    const turn = this.chain.then(async () => {
      const wait = this.nextAllowedAt - Date.now();
      if (wait > 0) await sleep(wait);
      this.nextAllowedAt = Date.now() + FIRECRAWL_MIN_INTERVAL_MS;
    });
    const result = turn.then(fn);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }
}
const pacer = new FirecrawlPacer();

/** Firecrawl scrape; `format` decides whether we get markdown (tables) or the raw HTML (structured pages). Paced. */
function firecrawl(apiKey: string, url: string, format: "markdown" | "rawHtml"): Promise<FetchResult> {
  return pacer.run(() => firecrawlNow(apiKey, url, format));
}

async function firecrawlNow(apiKey: string, url: string, format: "markdown" | "rawHtml"): Promise<FetchResult> {
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
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Registrar own-page source: one page per TLD. `direct` sources are fetched
 * plainly and only fall back to Firecrawl when the page fails or doesn't parse;
 * bot-walled sources skip the doomed direct attempt and go to Firecrawl at once.
 * Every Firecrawl call draws on the run's shared page budget.
 */
async function scrapePerTldPages(
  name: string,
  tlds: string[],
  urlFor: (tld: string) => string,
  parse: (html: string, tld: string) => ParsedPrice | null,
  opts: { direct: boolean; firecrawlKey: string | undefined; budget: { left: number } },
): Promise<{ prices: ParsedPrice[]; report: SourceReport }> {
  const started = Date.now();
  const report = newReport(name);
  report.attempted = tlds.length;
  const prices: ParsedPrice[] = [];
  const concurrency = opts.direct ? DIRECT_CONCURRENCY : 1;
  await mapConcurrent(tlds, concurrency, async (tld) => {
    const url = urlFor(tld);
    let res: FetchResult | null = null;
    let parsed: ParsedPrice | null = null;
    if (opts.direct) {
      res = await fetchPage(url);
      report.directStatus[String(res.status)] = (report.directStatus[String(res.status)] ?? 0) + 1;
      if (res.ok) {
        report.fetched++;
        parsed = parse(res.body, tld);
      }
    }
    if (!parsed && opts.firecrawlKey && opts.budget.left > 0) {
      opts.budget.left--;
      report.firecrawlUsed++;
      const fc = await firecrawl(opts.firecrawlKey, url, "rawHtml");
      if (fc.ok) {
        res = fc;
        parsed = parse(fc.body, tld);
      } else if (report.errors.length < 40) {
        report.errors.push(`${tld}: ${fc.error}`);
      }
    }
    if (parsed) {
      prices.push(parsed);
      report.parsed++;
    } else if (report.errors.length < 40) {
      report.errors.push(`${tld}: ${res?.ok ? "page fetched but no price found" : res?.error ?? "no fetch attempted (no Firecrawl key or budget)"}`);
      if (res?.ok && !report.unparsedSnippet) report.unparsedSnippet = snippet(res.body);
    }
  });
  report.sample = prices.slice(0, 3);
  report.ms = Date.now() - started;
  return { prices, report };
}

interface RunOptions {
  /** Report what every source would write, write nothing. */
  dryRun: boolean;
  /** Restrict per-TLD sources to these TLDs (dry runs, debugging). Disables the GoDaddy rotation. */
  tlds?: string[];
  /** Restrict to these sources: tldlist | tldspy | porkbun | namecheap | ovh | godaddy. Naming a scraper runs it even when tld-list answered. */
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
    const explicitTlds = Boolean(opts.tlds?.length);
    const tlds = explicitTlds ? opts.tlds! : TRACKED_TLDS;

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? undefined;
    const budget = { left: FIRECRAWL_PAGE_CAP };

    // ---- 0. tld-list.com API — every tracked registrar × TLD in one call -------
    const tldlist = async () => {
      const started = Date.now();
      const report = newReport("tldlist");
      const prices: ParsedPrice[] = [];
      const apiKeyPublic = Deno.env.get("TLDLIST_API_PUBLIC");
      const apiKeyPrivate = Deno.env.get("TLDLIST_API_PRIVATE");
      if (!apiKeyPublic || !apiKeyPrivate) {
        report.errors.push("TLDLIST_API_PUBLIC / TLDLIST_API_PRIVATE not configured");
      } else {
        report.attempted = 1;
        try {
          const resp = await fetch(TLDLIST_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": BROWSER_HEADERS["user-agent"] },
            body: JSON.stringify({
              apiKeyPublic,
              apiKeyPrivate,
              extensions: tlds,
              includeRegistrars: Object.keys(TLDLIST_REGISTRARS),
              includeFields: ["name", "punycode", "registrars", "pricingUpdated"],
              omitExtensionsWithoutRegistrars: true,
            }),
            signal: AbortSignal.timeout(40000),
          });
          report.directStatus[String(resp.status)] = 1;
          const text = await resp.text();
          let data: { status?: string; data?: unknown; errors?: { code?: string; message?: string }[] } | null = null;
          try {
            data = JSON.parse(text);
          } catch {
            report.errors.push(/just a moment|challenge/i.test(text) ? "api.tld-list.com answered with a bot challenge instead of JSON (ask tld-list to allow the API client)" : `non-JSON answer: ${snippet(text)}`);
          }
          if (data) {
            if (!resp.ok || data.status !== "SUCCESS") {
              report.errors.push(`HTTP ${resp.status} status=${data.status} ${(data.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ")}`.trim());
            } else {
              report.fetched = 1;
              prices.push(...parseTldListExtensions(data.data, new Set(tlds)));
              report.parsed = prices.length;
              if (prices.length === 0) report.unparsedSnippet = text.replace(/\s+/g, " ").slice(0, 300);
            }
          }
        } catch (e) {
          report.errors.push(`request failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      report.sample = prices.slice(0, 3);
      report.ms = Date.now() - started;
      return { prices, report };
    };

    // ---- 1. tldspy per-registrar pages (Firecrawl markdown, sequential) -------
    const tldspy = async () => {
      const started = Date.now();
      const report = newReport("tldspy");
      const prices: ParsedPrice[] = [];
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
          if (parsed.length === 0 && !report.unparsedSnippet) report.unparsedSnippet = `${registrar}: ${res.body.replace(/\s+/g, " ").slice(0, 220)}`;
          report.parsed += parsed.length;
          prices.push(...parsed);
          console.log(`tldspy ${registrar}: ${parsed.length} TLD prices`);
        }
      }
      report.sample = prices.slice(0, 3);
      report.ms = Date.now() - started;
      return { prices, report };
    };

    // ---- 2. Porkbun public catalog — every tracked TLD -------------------------
    const porkbun = async () => {
      const started = Date.now();
      const report = newReport("porkbun");
      report.attempted = 1;
      const prices: ParsedPrice[] = [];
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
              prices.push({
                registrar: "Porkbun",
                tld,
                reg_price: reg,
                renew_price: Number.isFinite(renew) && renew > 0 ? renew : reg,
                transfer_price: Number.isFinite(transfer) ? transfer : null,
              });
            }
          }
          report.parsed = prices.length;
        }
      } catch (e) {
        report.errors.push(`porkbun catalog failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      report.sample = prices.slice(0, 3);
      report.ms = Date.now() - started;
      return { prices, report };
    };

    // ---- 3. Namecheap full TLD list (one page; direct → Firecrawl HTML → Firecrawl markdown) ----
    const namecheap = async () => {
      const started = Date.now();
      const report = newReport("namecheap");
      report.attempted = 1;
      const tracked = new Set(tlds);
      let prices: ParsedPrice[] = [];
      const direct = await fetchPage(NAMECHEAP_LIST_URL);
      report.directStatus[String(direct.status)] = 1;
      if (direct.ok) {
        report.fetched = 1;
        prices = parseNamecheapTldList(direct.body, tracked);
        if (prices.length === 0) report.unparsedSnippet = `direct: ${snippet(direct.body)}`;
      }
      if (prices.length === 0 && firecrawlKey && budget.left > 0) {
        budget.left--;
        report.firecrawlUsed++;
        const html = await firecrawl(firecrawlKey, NAMECHEAP_LIST_URL, "rawHtml");
        if (html.ok) {
          prices = parseNamecheapTldList(html.body, tracked);
          if (prices.length === 0) report.unparsedSnippet = `firecrawl rawHtml: ${snippet(html.body)}`;
        } else {
          report.errors.push(`rawHtml: ${html.error}`);
        }
      }
      if (prices.length === 0 && firecrawlKey && budget.left > 0) {
        budget.left--;
        report.firecrawlUsed++;
        const md = await firecrawl(firecrawlKey, NAMECHEAP_LIST_URL, "markdown");
        if (md.ok) {
          prices = parseNamecheapMarkdown(md.body, tracked);
          if (prices.length === 0) report.unparsedSnippet = `firecrawl markdown: ${md.body.replace(/\s+/g, " ").slice(0, 300)}`;
        } else {
          report.errors.push(`markdown: ${md.error}`);
        }
      }
      if (prices.length === 0) report.errors.push("no rows parsed from any variant");
      report.parsed = prices.length;
      report.sample = prices.slice(0, 3);
      report.ms = Date.now() - started;
      return { prices, report };
    };

    // ---- 4. OVHcloud per-TLD pages (plain fetch works; no Firecrawl fallback — a 404 there means OVH doesn't sell the TLD) ----
    const ovh = () => scrapePerTldPages("ovh", tlds, ovhTldUrl, parseOvhTldPage, { direct: true, firecrawlKey: undefined, budget });

    // ---- 5. GoDaddy per-TLD pages (bot-walled → Firecrawl) — only the long tail tldspy
    // does not cover, a quarter per weekly run, after tldspy so both share the pacer.
    const godaddyAfterTldspy = (covered: Set<string>) => {
      const longTail = tlds.filter((t) => !covered.has(t));
      const slice = explicitTlds ? longTail : rotationSlice(longTail, weekIndex(), GODADDY_ROTATION_PARTS);
      return scrapePerTldPages("godaddy", slice, godaddyTldUrl, parseGodaddyTldPage, { direct: false, firecrawlKey, budget });
    };

    type Outcome = { prices: ParsedPrice[]; report: SourceReport };
    const guarded = (name: string, job: () => Promise<Outcome>) =>
      job().catch((e: unknown): Outcome => ({ prices: [], report: { ...newReport(name), errors: [`crashed: ${e instanceof Error ? e.message : String(e)}`] } }));

    // tld-list first. When it answers, the scrapers only run if the caller named them.
    const settled: Outcome[] = [];
    let primary: "tldlist" | "scrapers" = "scrapers";
    if (wants("tldlist")) {
      const t = await guarded("tldlist", tldlist);
      settled.push(t);
      if (t.prices.length > 0) primary = "tldlist";
    }
    const scraperWanted = (s: string) => (primary === "tldlist" ? opts.sources?.includes(s) === true : wants(s));

    // Firecrawl chain (tldspy, then GoDaddy) runs alongside the plain-fetch sources.
    // Namecheap is opt-in (`sources: ["namecheap"]`) until its parser is proven against a
    // Firecrawl sample: its own page returns 403 to a plain fetch and 2 credits/run bought nothing.
    const firecrawlChain = async (): Promise<Outcome[]> => {
      const out: Outcome[] = [];
      let godaddyCovered = new Set<string>();
      if (scraperWanted("tldspy")) {
        const t = await guarded("tldspy", tldspy);
        out.push(t);
        godaddyCovered = new Set(t.prices.filter((p) => p.registrar === "GoDaddy").map((p) => p.tld));
      }
      if (scraperWanted("godaddy")) out.push(await guarded("godaddy", () => godaddyAfterTldspy(godaddyCovered)));
      if (opts.sources?.includes("namecheap")) out.push(await guarded("namecheap", namecheap));
      return out;
    };
    const [chain, ...plain] = await Promise.all([
      firecrawlChain(),
      ...(scraperWanted("porkbun") ? [guarded("porkbun", porkbun)] : []),
      ...(scraperWanted("ovh") ? [guarded("ovh", ovh)] : []),
    ]);
    settled.push(...chain, ...plain);
    const reports = settled.map((s) => s.report);
    // Later lists win: the registrar's own page beats the aggregator for the same (registrar, tld).
    const allPrices = mergePrices(...settled.map((s) => s.prices));
    const perRegistrar: Record<string, number> = {};
    for (const p of allPrices) perRegistrar[p.registrar] = (perRegistrar[p.registrar] ?? 0) + 1;

    if (opts.dryRun) {
      return new Response(
        JSON.stringify({ success: true, dryRun: true, primary, ms: Date.now() - startedAt, perRegistrar, total: allPrices.length, firecrawlBudgetLeft: budget.left, reports }),
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
      if (p.promo_code !== undefined) row.promo_code = p.promo_code;
      if (p.whois_privacy !== undefined) row.whois_privacy = p.whois_privacy;
      const { error } = await supabase.from("registrar_prices").upsert(row, { onConflict: "registrar,tld" });
      if (error) {
        upsertErrors.push(`${p.registrar}/${p.tld}: ${error.message}`);
        console.error(`Upsert error for ${p.registrar}/${p.tld}:`, error.message);
      } else {
        upserted++;
      }
    }

    // Auto-quarantine: any row not re-verified within QUARANTINE_DAYS is no longer
    // trustworthy, so we flip supported=false and it falls through to the honest
    // "Check price" state. Rows with verified_at IS NULL are the old manually
    // quarantined seed cohort and are deliberately left alone.
    let quarantined = 0;
    const staleCutoff = new Date(Date.now() - QUARANTINE_DAYS * 24 * 60 * 60 * 1000).toISOString();
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

    console.log(`Done in ${Date.now() - startedAt}ms (primary=${primary}): ${upserted} prices upserted, ${quarantined} quarantined, per registrar ${JSON.stringify(perRegistrar)}`);

    return new Response(
      JSON.stringify({
        success: true,
        primary,
        ms: Date.now() - startedAt,
        scraped: allPrices.length,
        perRegistrar,
        upserted,
        quarantined,
        firecrawlBudgetLeft: budget.left,
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
