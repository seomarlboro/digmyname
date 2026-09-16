/**
 * Per-extension price pages (/tld and /tld/<tld>). Pure and Node-safe.
 *
 * One model feeds every consumer: the prebuild snapshot
 * (scripts/generate-tld-prices.ts), the build-time head, crawler HTML and
 * sitemap (src/seo/tldRoutes.ts), and the React pages, which start from the
 * snapshot and refresh from the live table.
 *
 * Honesty rules encoded here (guarded by src/test/tld-pages.test.ts):
 *   - one registrar is a price, not a comparison: no "comparison" wording, noindex;
 *   - an extension the search cannot answer for (not in SEARCHABLE_TLDS, e.g. .gg
 *     and .so, dropped in August because no RDAP server can confirm a name there)
 *     is noindex too, and says so instead of describing a check it never runs;
 *   - no "cheapest" / "best": the lowest price is "lowest of the N registrars we track";
 *   - a row older than 60 days is not shown (the API's limit); a quarantined or
 *     too-old row names the registrar and its last verification date, never the number;
 *   - every price carries its own verification date; older than 14 days is marked stale.
 */
import { BROWSER_RDAP } from "./browserLane";
import { isOnRequestTld, isSearchableTld } from "./searchableTlds";
import { STALE_AFTER_DAYS, TLD_ORDER } from "./pricing";
import { RENEWAL_TRAP_RATIO } from "./resultFilters";

export const TLD_HUB_PATH = "/tld";
/** registrar_prices columns the snapshot and the live page refresh read. */
export const PRICE_COLUMNS =
  "tld,registrar,reg_price,renew_price,transfer_price,icann_fee,promo_code,whois_privacy,supported,verified_at,updated_at";
/** Same limit as the API's STALE_PRICE_MAX_DAYS: an older price is not shown at all. */
export const MAX_PRICE_AGE_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Snapshot ─────────────────────────────────────────── */

/** A registrar_prices row as PostgREST returns it (numeric columns may arrive as strings). */
export interface RawPriceRow {
  tld: string;
  registrar: string;
  reg_price: number | string;
  renew_price: number | string;
  transfer_price: number | string | null;
  icann_fee: number | string | null;
  promo_code: string | null;
  whois_privacy: boolean | null;
  supported: boolean;
  verified_at: string | null;
  updated_at: string;
}

export interface SnapshotPrice {
  registrar: string;
  reg: number;
  renew: number;
  transfer: number | null;
  icannFee: number | null;
  promo: string | null;
  whoisPrivacy: boolean | null;
  verifiedAt: string;
}

export interface SnapshotHidden {
  registrar: string;
  lastVerifiedAt: string;
}

/** How the edge pipeline reaches RDAP for a TLD (facts from its FAST_RDAP table and IANA's bootstrap file). */
export interface RdapFacts {
  /** Host of the registry RDAP server in the pipeline's FAST_RDAP table, if listed. */
  registryHost: string | null;
  /** Whether IANA's RDAP bootstrap file lists the TLD; null when unknown. */
  inIanaBootstrap: boolean | null;
}

export interface SnapshotTld extends RdapFacts {
  tld: string;
  prices: SnapshotPrice[];
  /** supported=false rows: shown by name and date only. */
  quarantined: SnapshotHidden[];
}

export interface TldSnapshot {
  tlds: SnapshotTld[];
}

const num = (v: number | string | null): number | null => (v == null || v === "" ? null : Number(v));

/** Popular extensions first (the /pricing order), the rest alphabetically. */
export function compareTlds(a: string, b: string): number {
  const ai = TLD_ORDER.indexOf(a);
  const bi = TLD_ORDER.indexOf(b);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
}

/** Rows → snapshot. Deterministic ordering, so unchanged prices give an identical file. TLDs without a supported row are dropped. */
export function snapshotFromRows(rows: RawPriceRow[], rdap: (tld: string) => RdapFacts): TldSnapshot {
  const byTld = new Map<string, RawPriceRow[]>();
  for (const r of rows) {
    const tld = r.tld.toLowerCase().replace(/^\./, "");
    if (!byTld.has(tld)) byTld.set(tld, []);
    byTld.get(tld)!.push(r);
  }
  const tlds: SnapshotTld[] = [];
  for (const [tld, list] of byTld) {
    const byRegistrar = (a: RawPriceRow, b: RawPriceRow) => a.registrar.localeCompare(b.registrar);
    const prices = list
      .filter((r) => r.supported)
      .sort(byRegistrar)
      .map((r) => ({
        registrar: r.registrar,
        reg: Number(r.reg_price),
        renew: Number(r.renew_price),
        transfer: num(r.transfer_price),
        icannFee: num(r.icann_fee),
        promo: r.promo_code || null,
        whoisPrivacy: r.whois_privacy,
        verifiedAt: r.verified_at ?? r.updated_at,
      }));
    if (prices.length === 0) continue;
    const quarantined = list
      .filter((r) => !r.supported)
      .sort(byRegistrar)
      .map((r) => ({ registrar: r.registrar, lastVerifiedAt: r.verified_at ?? r.updated_at }));
    tlds.push({ tld, prices, quarantined, ...rdap(tld) });
  }
  tlds.sort((a, b) => compareTlds(a.tld, b.tld));
  return { tlds };
}

/** TLD → RDAP host from the edge pipeline's `FAST_RDAP` source text (the same parse the browser-lane test uses). */
export function parseFastRdap(pipelineSource: string): Map<string, string> {
  const start = pipelineSource.indexOf("export const FAST_RDAP");
  const end = pipelineSource.indexOf("FAST_RDAP_EXCEPTIONS");
  if (start === -1 || end === -1) throw new Error("FAST_RDAP table not found in pipeline source");
  const map = new Map<string, string>();
  for (const m of pipelineSource.slice(start, end).matchAll(/^\s*([a-z0-9-]+):\s*"(https:\/\/[^"]+)"/gm)) {
    map.set(m[1], new URL(m[2]).host);
  }
  return map;
}

/** TLDs listed in IANA's RDAP bootstrap file (https://data.iana.org/rdap/dns.json). */
export function parseIanaBootstrap(json: unknown): Set<string> {
  const services = (json as { services?: [string[], string[]][] })?.services;
  if (!Array.isArray(services)) throw new Error("unexpected IANA bootstrap shape");
  return new Set(services.flatMap(([tlds]) => tlds.map((t) => t.toLowerCase())));
}

/* ── Formatting ───────────────────────────────────────── */

export const usd = (n: number) => `$${n.toFixed(2)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Sep 2026", in UTC so the build and every browser print the same day. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const tldPath = (tld: string) => `${TLD_HUB_PATH}/${tld}`;

/** Old deep links pointed at /pricing#tld-<tld>; they now belong to /tld/<tld>. */
export function legacyTldHash(hash: string): string | null {
  const m = /^#tld-([a-z0-9-]+)$/i.exec(hash);
  return m ? m[1].toLowerCase() : null;
}

/* ── Page model ───────────────────────────────────────── */

export interface TldPriceRow extends SnapshotPrice {
  /** Registration plus two renewals. */
  threeYear: number;
  renewalRatio: number;
  /** Renews at more than RENEWAL_TRAP_RATIO × the first-year price. */
  trap: boolean;
  stale: boolean;
}

export interface Named {
  registrar: string;
  price: number;
}

export interface TldPage {
  tld: string;
  path: string;
  /** Prices shown, lowest 3-year cost first. */
  rows: TldPriceRow[];
  /** Registrars whose price is not shown (quarantined, or older than 60 days). */
  hidden: SnapshotHidden[];
  registrarCount: number;
  single: boolean;
  /** Only pages that compare two or more registrars are indexed. */
  indexable: boolean;
  lowestReg: Named | null;
  lowestRenew: Named | null;
  threeYearLow: Named | null;
  threeYearHigh: Named | null;
  traps: TldPriceRow[];
  oldestVerifiedAt: string | null;
  newestVerifiedAt: string | null;
  h1: string;
  lede: string;
  title: string;
  description: string;
  verifiedLine: string;
  trapLine: string;
  hiddenLines: string[];
  checkLines: string[];
}

/**
 * A page with its sourced prose attached. The facts are deliberately NOT part of
 * buildTldPage: tldFacts.ts pulls in src/data/tldFacts.json (166 KB), and
 * /pricing imports this module for three path helpers. Keeping the two apart is
 * what stops that page from downloading every registry policy on the internet.
 * See withFacts() in tldFacts.ts.
 */
export interface TldPageWithFacts extends TldPage {
  /** Who runs the extension — from the IANA delegation record. Null when unverified. */
  operator: FactBlockLike | null;
  /** What it is actually used for — counted off one dated traffic ranking. Null when uncounted. */
  usage: FactBlockLike | null;
  /** Who may register it — from the registry's own rules pages. Null when unverified. */
  eligibility: FactBlockLike | null;
  /** The source sentences behind `eligibility`, verbatim, so a reader can check our wording. */
  eligibilityQuotes: { quote: string; label: string; url: string }[];
  /** Three questions answered from this page's own price rows. */
  faq: { q: string; a: string }[];
}

/** Structural twin of FactBlock, declared here so this module needs no import from tldFacts.ts. */
export interface FactBlockLike {
  title: string;
  sentences: string[];
  sources: { label: string; url: string; checkedAt: string }[];
}

const lowest = (rows: TldPriceRow[], value: (r: TldPriceRow) => number): Named | null =>
  rows.reduce<Named | null>((best, r) => (best == null || value(r) < best.price ? { registrar: r.registrar, price: value(r) } : best), null);

const ratio = (r: TldPriceRow) => `${r.renewalRatio.toFixed(2)}×`;

function verifiedRange(oldest: string | null, newest: string | null): string {
  if (!oldest || !newest) return "";
  const a = formatDay(oldest);
  const b = formatDay(newest);
  return a === b ? `verified ${b}` : `verified between ${a} and ${b}`;
}

/** Search-result limits: Google cuts titles around 60 characters and descriptions around 155. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/** The first candidate that fits; candidates go from fullest to shortest. */
const fit = (max: number, ...candidates: string[]) => candidates.find((c) => c.length <= max) ?? candidates[candidates.length - 1];

/** Compact money for titles: "$50", "$28.12". */
const usdShort = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/** "13 Sep 2026", "9–13 Sep 2026", "16 Aug–13 Sep 2026" or "30 Dec 2025–2 Jan 2026". */
export function shortRange(oldest: string | null, newest: string | null): string {
  if (!oldest || !newest) return "";
  const a = formatDay(oldest).split(" ");
  const b = formatDay(newest);
  const [, bMonth, bYear] = b.split(" ");
  if (a.join(" ") === b) return b;
  if (a[2] !== bYear) return `${a.join(" ")}–${b}`;
  if (a[1] !== bMonth) return `${a[0]} ${a[1]}–${b}`;
  return `${a[0]}–${b}`;
}

/** How the pipeline checks availability for this TLD — facts from FAST_RDAP, the browser lane table and IANA's bootstrap file. */
export function checkLines(t: RdapFacts & { tld: string }): string[] {
  const dot = `.${t.tld}`;
  // Not in the curated list: the search does not offer this extension, so there
  // is no check to describe. Saying "how availability of .gg is checked" on a
  // page for an extension we refuse to answer for is the lie this prevents.
  if (!isSearchableTld(t.tld)) {
    // Two different reasons, and saying the wrong one is its own small lie:
    // .gg/.so have no RDAP server at all, while .shop has one that rate-limits
    // our checks (429 after a handful of requests from one IP). Neither zone is
    // in the default search; only the second one answers when a visitor types it.
    const why = t.inIanaBootstrap === false
      ? `No RDAP server for this zone is listed in IANA's bootstrap registry, so a name here cannot be confirmed free`
      : `The registry rate-limits our availability checks, so most answers here would be inconclusive rather than a verdict`;
    const typed = isOnRequestTld(t.tld)
      ? ` Type a full ${dot} name in the search and you still get a card — an honest Unverified, never a guess.`
      : "";
    return [
      `DigMyName does not check availability for ${dot}. ${why}, and the search offers only extensions it can answer for. This page is prices only — check the name itself at a registrar.${typed}`,
    ];
  }
  const thirdSignal =
    "Premium suspects (such as very short names) and brand-protected labels also get a third signal, Fastly Domain Research, before they are shown as available.";
  if (t.registryHost) {
    const lines = [`Availability of ${dot} names is checked against the registry's own RDAP server (${t.registryHost}) and DNS-over-HTTPS.`];
    if (BROWSER_RDAP[t.tld]) {
      lines.push("On this site your browser asks that server directly for a first, provisional answer; our server's check confirms it, and only that answer is cached.");
    }
    lines.push(thirdSignal);
    return lines;
  }
  if (t.inIanaBootstrap === false) {
    return [
      `${dot} has no RDAP server in IANA's bootstrap registry, so RDAP cannot confirm that a name is free. A third signal, Fastly Domain Research, decides; when it does not answer, the result is shown as Unverified, never as available.`,
    ];
  }
  return [
    `The RDAP server for ${dot} is looked up in IANA's bootstrap registry at check time, with the public rdap.org aggregator as a fallback, and checked together with DNS-over-HTTPS.`,
    thirdSignal,
  ];
}

export function buildTldPage(t: SnapshotTld, now = Date.now()): TldPage {
  const age = (iso: string) => now - new Date(iso).getTime();
  const fresh = t.prices.filter((p) => age(p.verifiedAt) <= MAX_PRICE_AGE_DAYS * DAY_MS);
  const tooOld = t.prices.filter((p) => age(p.verifiedAt) > MAX_PRICE_AGE_DAYS * DAY_MS);

  const rows: TldPriceRow[] = fresh
    .map((p) => {
      const renewalRatio = p.reg > 0 ? p.renew / p.reg : 1;
      return {
        ...p,
        threeYear: p.reg + p.renew * 2,
        renewalRatio,
        trap: p.renew > p.reg * RENEWAL_TRAP_RATIO,
        stale: age(p.verifiedAt) > STALE_AFTER_DAYS * DAY_MS,
      };
    })
    .sort((a, b) => a.threeYear - b.threeYear || a.reg - b.reg || a.registrar.localeCompare(b.registrar));

  const hidden = [...t.quarantined, ...tooOld.map((p) => ({ registrar: p.registrar, lastVerifiedAt: p.verifiedAt }))].sort((a, b) =>
    a.registrar.localeCompare(b.registrar),
  );

  const n = rows.length;
  const single = n === 1;
  const dot = `.${t.tld}`;
  const traps = rows.filter((r) => r.trap);
  const dates = rows.map((r) => r.verifiedAt).sort();
  const oldestVerifiedAt = dates[0] ?? null;
  const newestVerifiedAt = dates[dates.length - 1] ?? null;
  const lowestReg = lowest(rows, (r) => r.reg);
  const lowestRenew = lowest(rows, (r) => r.renew);
  const threeYearLow = rows[0] ? { registrar: rows[0].registrar, price: rows[0].threeYear } : null;
  const threeYearHigh = rows[n - 1] ? { registrar: rows[n - 1].registrar, price: rows[n - 1].threeYear } : null;
  const verified = verifiedRange(oldestVerifiedAt, newestVerifiedAt);

  const range = shortRange(oldestVerifiedAt, newestVerifiedAt);

  let h1: string;
  let lede: string;
  let title: string;
  let description: string;
  let trapLine: string;

  if (n === 0) {
    h1 = `${dot} domain prices`;
    lede = `No registrar price for ${dot} has been verified within the last ${MAX_PRICE_AGE_DAYS} days, so none is shown.`;
    title = `${dot} domain prices`;
    description = lede;
    trapLine = "";
  } else if (single) {
    const r = rows[0];
    h1 = `${dot} domain price at ${r.registrar}`;
    lede = `${dot} is tracked at one registrar so far, ${r.registrar}, so this is its price, not a comparison.`;
    title = fit(
      TITLE_MAX,
      `${dot} domain price: ${usdShort(r.reg)}/yr at ${r.registrar}`,
      `${dot} price: ${usdShort(r.reg)}/yr at ${r.registrar}`,
      `${dot}: ${usdShort(r.reg)}/yr at ${r.registrar}`,
    );
    const transfer = r.transfer != null ? `, transfer ${usd(r.transfer)}` : "";
    description = fit(
      DESCRIPTION_MAX,
      `${dot} is tracked at one registrar only, ${r.registrar}: register ${usd(r.reg)}, renew ${usd(r.renew)}${transfer}. 3-year cost ${usd(r.threeYear)}, verified ${range}.`,
      `${dot} at one registrar only, ${r.registrar}: register ${usd(r.reg)}, renew ${usd(r.renew)}, 3-year cost ${usd(r.threeYear)}. Verified ${range}.`,
      `${dot} at ${r.registrar} only: register ${usd(r.reg)}, renew ${usd(r.renew)}. Verified ${range}.`,
    );
    trapLine = `${r.registrar} renews ${dot} at ${usd(r.renew)}, ${ratio(r)} the first-year price of ${usd(r.reg)}.`;
  } else {
    h1 = `${dot} domain prices at ${n} registrars`;
    lede = `Registration, renewal and transfer prices for ${dot} at the ${n} registrars we track, lowest 3-year cost first. Each price shows the date it was last verified.`;
    const reg = usdShort(lowestReg!.price);
    const renew = usdShort(lowestRenew!.price);
    title = fit(
      TITLE_MAX,
      `${dot} domain price: register ${reg}, renew ${renew} · ${n} registrars`,
      // "domain price" is the search phrase: the registrar count goes first (the description repeats it).
      `${dot} domain price: register ${reg}, renew ${renew}`,
      `${dot} price: register ${reg}, renew ${renew}`,
      `${dot}: register ${reg}, renew ${renew}`,
    );
    const cost = `3-year cost ${usd(threeYearLow!.price)}–${usd(threeYearHigh!.price)}`;
    const trapsShort =
      traps.length === 0 ? `none renews at over ${RENEWAL_TRAP_RATIO}× year one` : `${traps.length} of ${n} renew at over ${RENEWAL_TRAP_RATIO}× year one`;
    description = fit(
      DESCRIPTION_MAX,
      `Register, renew and transfer prices for ${dot} at ${n} registrars, verified ${range}. ${cost}; ${trapsShort}.`,
      `${dot} prices at ${n} registrars, verified ${range}. ${cost}; ${trapsShort}.`,
      `${dot} prices at ${n} registrars, verified ${range}. ${cost}.`,
    );
    trapLine =
      traps.length === 0
        ? `None of the ${n} registrars we track renews ${dot} at more than ${RENEWAL_TRAP_RATIO}× its first-year price.`
        : `Renews at more than ${RENEWAL_TRAP_RATIO}× the first-year price: ${traps
            .map((r) => `${r.registrar} (${usd(r.reg)} → ${usd(r.renew)}, ${ratio(r)})`)
            .join("; ")}.`;
  }

  return {
    tld: t.tld,
    path: tldPath(t.tld),
    rows,
    hidden,
    registrarCount: n,
    single,
    // Two registrars make it a comparison; a searchable extension makes the page
    // something we can stand behind. Both, or it stays out of the index.
    indexable: n >= 2 && isSearchableTld(t.tld),
    lowestReg,
    lowestRenew,
    threeYearLow,
    threeYearHigh,
    traps,
    oldestVerifiedAt,
    newestVerifiedAt,
    h1,
    lede,
    title,
    description,
    verifiedLine: verified ? `Prices ${verified}.` : "",
    trapLine,
    hiddenLines: hidden.map((h) => `${h.registrar}: price not re-verified since ${formatDay(h.lastVerifiedAt)}, so it is not shown.`),
    checkLines: checkLines(t),
  };
}

/* ── Hub model ────────────────────────────────────────── */

export interface HubEntry {
  tld: string;
  path: string;
  registrarCount: number;
  lowestReg: Named | null;
  lowestRenew: Named | null;
  newestVerifiedAt: string | null;
  indexable: boolean;
}

export interface TldHub {
  entries: HubEntry[];
  registrars: string[];
  compared: number;
  single: number;
  newestVerifiedAt: string | null;
  title: string;
  description: string;
  h1: string;
  lede: string;
}

export function buildHub(snapshot: TldSnapshot, now = Date.now()): TldHub {
  const pages = snapshot.tlds.map((t) => buildTldPage(t, now)).filter((p) => p.registrarCount > 0);
  const entries = pages.map((p) => ({
    tld: p.tld,
    path: p.path,
    registrarCount: p.registrarCount,
    lowestReg: p.lowestReg,
    lowestRenew: p.lowestRenew,
    newestVerifiedAt: p.newestVerifiedAt,
    indexable: p.indexable,
  }));
  const registrars = [...new Set(pages.flatMap((p) => p.rows.map((r) => r.registrar)))].sort();
  const single = entries.filter((e) => e.registrarCount === 1).length;
  const compared = entries.length - single;
  const newestVerifiedAt = entries.map((e) => e.newestVerifiedAt).filter((d): d is string => !!d).sort().pop() ?? null;
  const count = entries.length;
  // The head is what a searcher and a social card actually read, so it may not
  // promise more than the body delivers: "54 TLDs, 6 registrars" reads as 54 × 6,
  // while most extensions are tracked at two. Quote the real range instead.
  const counts = entries.map((e) => e.registrarCount);
  const minRegistrars = Math.min(...counts);
  const maxRegistrars = Math.max(...counts);
  const range = minRegistrars === maxRegistrars ? `${maxRegistrars}` : `${minRegistrars}\u2013${maxRegistrars}`;
  const full = entries.filter((e) => e.registrarCount === registrars.length).length;
  return {
    entries,
    registrars,
    compared,
    single,
    newestVerifiedAt,
    h1: `Domain prices by extension`,
    lede: `Registration and renewal prices for ${count} extensions, each tracked at ${range} of the ${registrars.length} registrars we follow — ${full} at all ${registrars.length}. Each one has its own page with every tracked registrar's price, renewal traps and verification dates. ${compared} are tracked at two or more registrars, ${single} at one only.`,
    title: `Domain prices by extension: ${count} TLDs, ${range} registrars each`,
    description: `Register and renew prices for ${count} domain extensions, each tracked at ${range} of ${registrars.length} registrars \u2014 ${full} at all ${registrars.length}. Each has its own page with prices and dates.`,
  };
}

/** Footer links: the extensions tracked at the most registrars, in /pricing order. */
export function footerTlds(snapshot: TldSnapshot): string[] {
  const max = Math.max(0, ...snapshot.tlds.map((t) => t.prices.length));
  return snapshot.tlds.filter((t) => t.prices.length === max).map((t) => t.tld);
}
