// Parsers for every price source, kept pure so they can be unit-tested against
// the HTML fixtures in ./fixtures (captured from the real pages, then trimmed).
//
// Sources and what each one is good for:
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
      // Keep an ICANN fee we already know when the newer source doesn't publish one.
      byKey.set(key, prev && p.icann_fee === undefined ? { ...p, icann_fee: prev.icann_fee } : p);
    }
  }
  return [...byKey.values()];
}
