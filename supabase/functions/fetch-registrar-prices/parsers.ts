// Parsers for every price source, kept pure so they can be unit-tested against
// the HTML fixtures in ./fixtures (captured from the real pages, then trimmed).
//
// Sources and what each one is good for:
//   - tld-list.com API (`extension/get`, needs a subscription keypair): every
//     tracked registrar × TLD in one JSON call, promos, terms and ICANN fees
//     included. The primary source whenever the keys are configured; the
//     scrapers below are the fallback. (tld-list's pages sit behind a bot
//     challenge and its terms forbid scraping — only the API is used.)
//   - tldspy.com per-registrar pages (via Firecrawl markdown): ~17-18 core TLDs
//     per registrar. Its per-TLD pages are members-only, so it cannot fill the
//     long tail.
//   - Porkbun public catalog (JSON, no auth): every TLD.
//   - Namecheap "full TLD list" page (server-rendered table, 50 TLDs).
//   - OVHcloud per-TLD pages: server-rendered Astro islands carrying a
//     `tldPrices` JSON blob (installation / renewal / transfer).
//   - GoDaddy per-TLD pages: server-rendered "Starting at <s>$regular</s> $promo /1st yr",
//     sometimes with "N-year purchase required".

export interface ParsedPrice {
  registrar: string;
  tld: string;
  reg_price: number;
  renew_price: number;
  transfer_price: number | null;
  /** Only some sources publish it; undefined leaves the stored value alone. */
  icann_fee?: number | null;
  /** First-year promo code the price depends on; undefined leaves the stored value alone. */
  promo_code?: string | null;
  /** Free WHOIS privacy; undefined leaves the stored value alone. */
  whois_privacy?: boolean;
}

const price = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Tags and comments out, entities decoded, whitespace collapsed. */
export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** All "$12.34" figures in a text, in order. */
export function dollarFigures(text: string): number[] {
  return [...text.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
}

/* ── tldspy.com per-registrar page (Firecrawl markdown) ────────────────── */

export function parseTldSpyMarkdown(markdown: string, registrar: string, tracked: ReadonlySet<string>): ParsedPrice[] {
  const results: ParsedPrice[] = [];
  // TLDSpy uses markdown tables: | .com | $10.46 | $10.46 | $10.46 | ...
  for (const line of markdown.split("\n")) {
    if (!line.includes("|") || !line.includes("$")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const tldMatch = cells[0].match(/\.(\w+)/);
    if (!tldMatch) continue;
    const tld = tldMatch[1].toLowerCase();
    if (!tracked.has(tld)) continue;
    const prices = cells.slice(1).map((c) => {
      const m = c.match(/\$?([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    });
    const regPrice = prices[0];
    const renewPrice = prices[1];
    const transferPrice = prices[2] ?? null;
    if (regPrice != null && renewPrice != null && regPrice > 0 && renewPrice > 0) {
      results.push({ registrar, tld, reg_price: regPrice, renew_price: renewPrice, transfer_price: transferPrice });
    }
  }
  return results;
}

/* ── Namecheap full TLD list (server-rendered HTML table) ──────────────── */

/**
 * Rows look like
 *   <td><a class="gb-tld-name …">.<!-- -->com<sup>*</sup></a></td>
 *   <td data-table-title="Register">…$11.28 Sale 25% off 1st year $14.98…</td>
 *   <td data-table-title="Renew">$18.48</td> <td data-table-title="Transfer">$11.48 …</td>
 *   <td data-table-title="ICANN Fee">$0.20</td>
 * The FIRST figure in a cell is the price you pay today (the sale price when
 * there is one; the struck regular price follows it).
 */
export function parseNamecheapTldList(html: string, tracked: ReadonlySet<string>): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const nameHtml = row.match(/class="[^"]*gb-tld-name[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1];
    if (!nameHtml) continue;
    const tld = stripTags(nameHtml).replace(/[\s*]/g, "").replace(/^\./, "").toLowerCase();
    if (!tld || !tracked.has(tld)) continue;
    const cell = (title: string) => {
      const m = row.match(new RegExp(`<td[^>]*data-table-title="${title}"[^>]*>([\\s\\S]*?)<\\/td>`, "i"));
      return m ? stripTags(m[1]) : "";
    };
    const reg = dollarFigures(cell("Register"))[0];
    const renew = dollarFigures(cell("Renew"))[0];
    const transfer = dollarFigures(cell("Transfer"))[0] ?? null;
    const icann = dollarFigures(cell("ICANN Fee"))[0];
    if (reg == null || renew == null || reg <= 0 || renew <= 0) continue;
    out.push({ registrar: "Namecheap", tld, reg_price: reg, renew_price: renew, transfer_price: transfer, icann_fee: icann ?? null });
  }
  return out;
}

/**
 * The same Namecheap table as Firecrawl renders it in markdown:
 *   | .com* | gTLD | — | The King of domains | $11.28 Sale 25% off 1st year $14.98 | $18.48 | $11.48 Sale … | $0.20 | … |
 * Column order is fixed by the page: TLD, Type, Country, Description, Register, Renew, Transfer, ICANN Fee, Features.
 */
export function parseNamecheapMarkdown(markdown: string, tracked: ReadonlySet<string>): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.replace(/\\\*/g, "*").trim());
    if (cells.length < 8) continue;
    const tld = cells[0].replace(/[\s*]/g, "").replace(/^\./, "").toLowerCase();
    if (!/^[a-z.]+$/.test(tld) || !tracked.has(tld)) continue;
    const reg = dollarFigures(cells[4])[0];
    const renew = dollarFigures(cells[5])[0];
    const transfer = dollarFigures(cells[6])[0] ?? null;
    const icann = dollarFigures(cells[7])[0];
    if (reg == null || renew == null || reg <= 0 || renew <= 0) continue;
    out.push({ registrar: "Namecheap", tld, reg_price: reg, renew_price: renew, transfer_price: transfer, icann_fee: icann ?? null });
  }
  return out;
}

/**
 * Which slice of `tlds` a rotating source scrapes this run. A source that costs
 * a paid call per TLD is spread over `parts` weekly runs; every TLD is still
 * re-verified well inside the 21-day quarantine window.
 */
export function rotationSlice<T>(items: readonly T[], runIndex: number, parts: number): T[] {
  if (parts <= 1) return [...items];
  const part = ((runIndex % parts) + parts) % parts;
  return items.filter((_, i) => i % parts === part);
}

/** ISO-week-ish counter that changes once per calendar week (UTC). */
export function weekIndex(now = new Date()): number {
  return Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
}

/* ── OVHcloud per-TLD page ─────────────────────────────────────────────── */

/**
 * The page embeds, HTML-encoded, an Astro-island prop blob:
 *   "tld":[0,"agency"],"tldPrices":[0,{"installation":[0,{"formatted":[0,"$6.92"],"raw":[0,"6.92"],…}],
 *   "renewal":[0,{…"raw":[0,"30.09"]}],"transfer":[0,{…"raw":[0,"29.49"]}],…
 * `installation` is the first-year price with the current promotion applied.
 */
export function parseOvhTldPage(html: string, tld: string): ParsedPrice | null {
  const decoded = decodeHtmlEntities(html);
  const anchor = decoded.indexOf(`"tld":[0,"${tld}"],"tldPrices":[0,{`);
  if (anchor === -1) return null;
  const seg = decoded.slice(anchor, anchor + 8000);
  const raw = (key: string) => price(seg.match(new RegExp(`"${key}":\\[0,\\{"formatted":\\[0,"[^"]*"\\],"raw":\\[0,"([\\d.]+)"\\]`))?.[1]);
  const reg = raw("installation");
  const renew = raw("renewal");
  const transfer = raw("transfer");
  if (reg == null || renew == null || reg <= 0 || renew <= 0) return null;
  return { registrar: "OVHcloud", tld, reg_price: reg, renew_price: renew, transfer_price: transfer };
}

/* ── GoDaddy per-TLD page ──────────────────────────────────────────────── */

/**
 * Server-rendered marquee:
 *   <h1 data-cy="eyebrow">.agency Domain Names</h1> …
 *   Starting at <s>$47.99</s> $3.99 /1st yr            → reg 3.99, renew 47.99
 *   Starting at <s>$39.99</s> $0.01 /1st yr 3-year purchase required. Additional year(s) $39.99
 *                                                       → the promo needs a 3-year term, so the
 *                                                         standalone first-year price is the regular one
 * The struck figure is the regular price and what renewals cost.
 */
export function parseGodaddyTldPage(html: string, tld: string): ParsedPrice | null {
  const eyebrow = html.match(/data-cy="eyebrow"[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  if (!eyebrow || stripTags(eyebrow).toLowerCase() !== `.${tld} domain names`) return null;
  const start = html.indexOf("Starting at");
  if (start === -1) return null;
  const block = html.slice(start, start + 2500);
  const struck = price(block.match(/<s>[\s\S]*?\$\s*([\d.]+)[\s\S]*?<\/s>/)?.[1]);
  const promo = price(block.match(/text-purchase[\s\S]*?\$\s*([\d.]+)/)?.[1]);
  const text = stripTags(block);
  const regular = struck ?? price(text.match(/Additional year\(s\)\s*\$\s*([\d.]+)/)?.[1]) ?? promo ?? dollarFigures(text)[0] ?? null;
  if (regular == null || regular <= 0) return null;
  const termRequired = /purchase required/i.test(text);
  const firstYear = promo != null && !termRequired ? promo : regular;
  return { registrar: "GoDaddy", tld, reg_price: firstYear, renew_price: regular, transfer_price: null };
}

/* ── Merge ─────────────────────────────────────────────────────────────── */

/** Later sources override earlier ones for the same (registrar, tld): pass the registrar's own page after the aggregator. */
export function mergePrices(...lists: ParsedPrice[][]): ParsedPrice[] {
  const byKey = new Map<string, ParsedPrice>();
  for (const list of lists) {
    for (const p of list) {
      const key = `${p.registrar}|${p.tld}`;
      const prev = byKey.get(key);
      const merged: ParsedPrice = { ...p };
      // Keep what we already know (ICANN fee, promo code, privacy) when the newer source doesn't say.
      if (prev) {
        if (merged.icann_fee === undefined && prev.icann_fee !== undefined) merged.icann_fee = prev.icann_fee;
        if (merged.promo_code === undefined && prev.promo_code !== undefined) merged.promo_code = prev.promo_code;
        if (merged.whois_privacy === undefined && prev.whois_privacy !== undefined) merged.whois_privacy = prev.whois_privacy;
      }
      byKey.set(key, merged);
    }
  }
  return [...byKey.values()];
}

/* ── tld-list.com API: POST https://api.tld-list.com/v1/extension/get ──── */

/** tld-list registrar ids (their URL slugs, e.g. /registrars/ovh) → the names our table uses. */
export const TLDLIST_REGISTRARS: Readonly<Record<string, string>> = {
  porkbun: "Porkbun",
  namecheap: "Namecheap",
  godaddy: "GoDaddy",
  cloudflare: "Cloudflare",
  ovh: "OVHcloud",
  spaceship: "Spaceship",
};

type PriceType = "register" | "renewal" | "transfer";
const PRICE_TYPES: readonly PriceType[] = ["register", "renewal", "transfer"];

/** The documented `RegistrarPricing` object (https://tld-list.com/docs-api), the parts we read. */
export interface TldListRegistrar {
  id?: string;
  name?: string;
  /** Final retail prices, promos applied, as numeric strings. */
  prices?: Partial<Record<string, string>>;
  /** Regular prices; only present when a promo is active. */
  pricesOriginal?: Partial<Record<string, string>>;
  promos?: { code?: string; pricetype?: string[]; type?: string; amount?: string }[];
  /** Special terms keyed by id; `pricetype` says which prices they apply to. */
  terms?: Partial<Record<string, { pricetype?: string[]; count?: number }>>;
  notes?: { feeIcann?: { amount?: string; addedToListPrice?: boolean; pricetype?: string[] } };
  freeFeatures?: { name?: string }[];
}
export interface TldListExtension {
  name?: string;
  punycode?: string;
  registrars?: TldListRegistrar[];
  pricingUpdated?: string;
}

const appliesTo = (pricetype: string[] | undefined, type: PriceType) => !pricetype || pricetype.includes(type);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One row per (registrar we track, extension we track). Rules that keep the
 * stored numbers comparable with the registrars' own pages:
 *   - `prices.*` already have the promo applied; a promo that needs a
 *     multi-year term is not a first-year price, so `pricesOriginal.register`
 *     is stored instead (same rule as the GoDaddy page parser).
 *   - When tld-list added an ICANN fee to the final price, it is taken back out
 *     and stored in `icann_fee` (our table keeps the fee separate, like
 *     Namecheap's own list does). No fee note → `icann_fee` 0.
 *   - `promo_code` is the code of the promo that applies to registration, when
 *     the promo price is what we store.
 */
export function parseTldListExtensions(
  data: unknown,
  tracked: ReadonlySet<string>,
  registrars: Readonly<Record<string, string>> = TLDLIST_REGISTRARS,
): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  if (!Array.isArray(data)) return out;
  for (const ext of data as TldListExtension[]) {
    const tld = String(ext?.punycode ?? ext?.name ?? "").toLowerCase();
    if (!tld || !tracked.has(tld) || !Array.isArray(ext.registrars)) continue;
    for (const r of ext.registrars) {
      const registrar = r?.id ? registrars[r.id] : undefined;
      if (!registrar || !r.prices) continue;
      const fee = r.notes?.feeIcann;
      const feeAmount = fee ? price(fee.amount) : null;
      const final: Partial<Record<PriceType, number | null>> = {};
      for (const t of PRICE_TYPES) {
        let v = price(r.prices[t]);
        if (v != null && feeAmount != null && fee?.addedToListPrice && appliesTo(fee.pricetype, t)) v = round2(v - feeAmount);
        final[t] = v;
      }
      const multiYear = r.terms?.multiYearPurchaseRequired;
      const promoNeedsTerm = multiYear != null && appliesTo(multiYear.pricetype, "register");
      let reg = final.register ?? null;
      let promoCode: string | null = null;
      if (promoNeedsTerm) {
        let regular = price(r.pricesOriginal?.register);
        if (regular != null && feeAmount != null && fee?.addedToListPrice && appliesTo(fee.pricetype, "register")) regular = round2(regular - feeAmount);
        reg = regular ?? final.renewal ?? reg;
      } else if (r.pricesOriginal?.register != null) {
        promoCode = r.promos?.find((p) => p.code && appliesTo(p.pricetype, "register"))?.code ?? null;
      }
      const renew = final.renewal ?? null;
      if (reg == null || renew == null || reg <= 0 || renew <= 0) continue;
      out.push({
        registrar,
        tld,
        reg_price: reg,
        renew_price: renew,
        transfer_price: final.transfer ?? null,
        icann_fee: feeAmount ?? 0,
        promo_code: promoCode,
        whois_privacy: Array.isArray(r.freeFeatures) ? r.freeFeatures.some((f) => f?.name === "whois-privacy") : undefined,
      });
    }
  }
  return out;
}
