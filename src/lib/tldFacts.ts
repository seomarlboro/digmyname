/**
 * Per-extension facts and the prose built from them. Pure and Node-safe: the
 * build-time head/crawler HTML and the React page both read this.
 *
 * Rules, guarded by src/test/tld-facts.test.ts:
 *   - every fact carries the URL it came from and the date it was read, and the
 *     reader sees that link — a sentence with no source does not get rendered;
 *   - nothing is written from memory. The IANA block is machine-parsed from the
 *     root-zone delegation record (scripts/tld-facts/fetch-iana.mjs); the
 *     registry block is read off the registry's own rules pages, with the
 *     sentence it came from kept verbatim in `quote` so it can be re-checked;
 *   - no evaluation. No "popular", "best", "trusted", "perfect choice" — the
 *     registries' own marketing is full of it and none of it is a fact;
 *   - a missing fact renders as nothing. Two blocks are better than three
 *     padded ones.
 */
import factsJson from "../data/tldFacts.json";
import { RENEWAL_TRAP_RATIO } from "./resultFilters";
import type { TldPriceRow } from "./tldPages";

export interface SourcedFact {
  value: string;
  /** The sentence as the source words it, when the source is quotable. */
  quote?: string;
  sourceUrl: string;
  sourceLabel?: string;
  checkedAt: string;
}

export interface IanaFacts {
  type?: string;
  manager?: string;
  managerCountry?: string;
  registrationServicesUrl?: string;
  delegatedYear?: number;
  delegatedDate?: string;
  recordUpdated?: string;
  sourceUrl: string;
  checkedAt: string;
}

export interface TldFactRecord {
  iana?: IanaFacts;
  registry?: Record<string, SourcedFact>;
}

export interface TldFactsFile {
  ianaCollectedAt: string | null;
  tlds: Record<string, TldFactRecord>;
}

export const TLD_FACTS = factsJson as TldFactsFile;

export const factsFor = (tld: string): TldFactRecord | undefined => TLD_FACTS.tlds[tld];

/** One rendered block: sentences plus the sources behind them, shown to the reader. */
export interface FactBlock {
  title: string;
  sentences: string[];
  sources: { label: string; url: string; checkedAt: string }[];
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const factDay = (iso: string): string => DAY.format(new Date(`${iso}T00:00:00Z`));

/** "Generic top-level domain" → "generic top-level domain", for mid-sentence use. */
const lowerType = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Block 1 — who runs the extension. Straight off the IANA delegation record. */
export function operatorBlock(tld: string): FactBlock | null {
  const iana = factsFor(tld)?.iana;
  if (!iana?.manager || !iana.type) return null;
  const dot = `.${tld}`;
  const isCc = /country-code/i.test(iana.type);
  const sentences: string[] = [];

  sentences.push(
    `${dot} is a ${lowerType(iana.type)}${iana.delegatedYear ? `, delegated in ${iana.delegatedYear}` : ""}, and IANA records ${
      iana.manager
    } as its ${isCc ? "ccTLD manager" : "sponsoring organisation"}${iana.managerCountry ? `, in ${iana.managerCountry}` : ""}.`,
  );
  if (iana.registrationServicesUrl) {
    sentences.push(`The registry points registrants at ${hostOf(iana.registrationServicesUrl)} for registration services.`);
  }
  if (iana.recordUpdated) {
    sentences.push(`That delegation record was last updated on ${factDay(iana.recordUpdated)}; if the registry has changed hands since, IANA is where it shows up first.`);
  }

  return {
    title: `Who runs ${dot}`,
    sentences,
    sources: [{ label: "IANA Root Zone Database", url: iana.sourceUrl, checkedAt: iana.checkedAt }],
  };
}

/** Block 2 — who may register, and under what conditions. Registry pages only. */
export function eligibilityBlock(tld: string): FactBlock | null {
  const registry = factsFor(tld)?.registry;
  if (!registry) return null;
  // Deterministic order so the prose does not reshuffle between builds.
  const order = ["eligibility", "territory", "useRestriction", "thirdLevelRule", "hsts", "intendedUse", "agreementType"];
  const keys = [...new Set([...order.filter((k) => registry[k]), ...Object.keys(registry)])];
  const facts = keys.map((k) => registry[k]).filter(Boolean).slice(0, 4);
  if (!facts.length) return null;

  // One link per source page. Where several facts come off the same page, the
  // per-clause label ("…, clause 3.1") would under-describe the others, so the
  // shared link drops the clause; the exact clauses stay with the quotes below.
  const perUrl = new Map<string, SourcedFact[]>();
  for (const f of facts) perUrl.set(f.sourceUrl, [...(perUrl.get(f.sourceUrl) ?? []), f]);
  const seen = new Map<string, { label: string; url: string; checkedAt: string }>();
  for (const [url, group] of perUrl) {
    const raw = group[0].sourceLabel ?? hostOf(url);
    seen.set(url, { label: group.length > 1 ? raw.split(",")[0].trim() : raw, url, checkedAt: group[0].checkedAt });
  }

  return {
    title: `Who can register a .${tld}`,
    sentences: facts.map((f) => f.value),
    sources: [...seen.values()],
  };
}

/** The quoted source sentences, so a reader can match our wording to the registry's. */
export function eligibilityQuotes(tld: string): { quote: string; label: string; url: string }[] {
  const registry = factsFor(tld)?.registry ?? {};
  return Object.values(registry)
    .filter((f): f is SourcedFact & { quote: string } => typeof f.quote === "string" && f.quote.length > 0)
    .slice(0, 4)
    .map((f) => ({ quote: f.quote, label: f.sourceLabel ?? hostOf(f.sourceUrl), url: f.sourceUrl }));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ── FAQ ──────────────────────────────────────────────────
 * Three questions, each answered from the price rows on this very page. No
 * question gets asked unless its own data is there to answer it.
 */

export interface FaqItem {
  q: string;
  a: string;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function priceFaq(tld: string, rows: TldPriceRow[], verifiedLabel: string | null): FaqItem[] {
  const dot = `.${tld}`;
  if (!rows.length) return [];
  const faq: FaqItem[] = [];

  const byRenew = [...rows].sort((a, b) => a.renew - b.renew);
  const cheapestRenew = byRenew[0];
  const dearestRenew = byRenew[byRenew.length - 1];

  const one = rows.length === 1;
  const renewAnswer = [
    one
      ? `${cheapestRenew.registrar}, the one registrar we track for ${dot}, renews it at ${usd(cheapestRenew.renew)} a year.`
      : `The lowest renewal among the ${rows.length} registrars we track is ${usd(cheapestRenew.renew)} a year at ${cheapestRenew.registrar}.`,
    rows.length > 1 && dearestRenew.renew > cheapestRenew.renew
      ? `The highest is ${usd(dearestRenew.renew)} at ${dearestRenew.registrar}, so the same ${dot} name costs ${usd(dearestRenew.renew - cheapestRenew.renew)} a year more depending on where it sits.`
      : "",
    verifiedLabel ? `Prices ${verifiedLabel}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  faq.push({ q: `What does a ${dot} renewal cost?`, a: renewAnswer });

  // `trap` is set by buildTldPage from the same RENEWAL_TRAP_RATIO the search
  // results use; reading the flag rather than re-deriving it keeps the FAQ from
  // ever disagreeing with the table above it.
  const traps = rows.filter((r) => r.trap);
  const trapAnswer = traps.length
    ? `${traps.length === 1 ? "One registrar does" : `${traps.length} of the ${rows.length} do`}: ${traps
        .slice(0, 3)
        .map((r) => `${r.registrar} sells the first year at ${usd(r.reg)} and renews at ${usd(r.renew)}`)
        .join(", ")}${traps.length > 3 ? ", among others" : ""}. The 3-year column on this page is registration plus two renewals, which is where that shows up.`
    : `${
        one
          ? `Not at ${rows[0].registrar}: it renews ${dot} at ${usd(rows[0].renew)} against a first year of ${usd(rows[0].reg)}, under the ${RENEWAL_TRAP_RATIO}× mark. One registrar is not a comparison, though — the others may price it very differently.`
          : `Not at the registrars we track: none of the ${rows.length} renews ${dot} at more than ${RENEWAL_TRAP_RATIO}× its first-year price.`
      } The 3-year column is registration plus two renewals, so a change would show there.`;
  faq.push({ q: `Is there a renewal trap on ${dot}?`, a: trapAnswer });

  const names = rows.map((r) => r.registrar);
  faq.push({
    q: `How many registrars do you track for ${dot}?`,
    a: `${
      rows.length === 6
        ? "All six of the registrars in our price table"
        : `${one ? "One" : rows.length} of the six registrars in our price table`
    }: ${listOf(names)}.${
      rows.length < 6
        ? ` The others either do not sell ${dot} or have not been re-verified recently enough to show, and a price we cannot re-verify is not printed.`
        : ""
    }${verifiedLabel ? ` Each row carries its own verification date; these were ${verifiedLabel}.` : ""}`,
  });

  return faq;
}


export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
