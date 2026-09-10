import { supabase } from "@/integrations/supabase/client";

/** A curated extension. Deliberately nothing else: prices come from the live
 *  registrar table (`registrar_prices`) and card attributes from real verdicts,
 *  never from a static seed — a seed price here once contradicted /pricing on
 *  the very first click of the TLD picker. */
export interface TLD {
  extension: string;
}

export const TLD_LIST: TLD[] = [
  // Classic
  { extension: "com" },
  { extension: "net" },
  { extension: "org" },
  { extension: "info" },
  { extension: "biz" },
  // Tech
  { extension: "io" },
  { extension: "ai" },
  { extension: "app" },
  { extension: "dev" },
  { extension: "tech" },
  { extension: "digital" },
  { extension: "cloud" },
  { extension: "software" },
  { extension: "systems" },
  { extension: "build" },
  { extension: "run" },
  { extension: "page" },
  { extension: "link" },
  { extension: "tools" },
  // Startup / Business
  { extension: "co" },
  { extension: "agency" },
  { extension: "company" },
  { extension: "ventures" },
  { extension: "capital" },
  { extension: "inc" },
  // Creative
  { extension: "design" },
  { extension: "studio" },
  { extension: "art" },
  { extension: "media" },
  // Short / Brandable
  { extension: "xyz" },
  { extension: "me" },
  { extension: "cc" },
  { extension: "tv" },
  // .gg and .so were removed 2026-08-15 — neither zone has an RDAP server (both
  // absent from the IANA bootstrap), so availability there rests on DNS plus a
  // 404 from an aggregator that cannot route the zone. That combination sold
  // registered names (`gaming.gg`, registered 2020, was shown available $51.80).
  // Re-add them only together with a paid third signal, if the demand appears.
  // E-commerce
  { extension: "shop" },
  { extension: "store" },
  { extension: "market" },
  { extension: "buy" },
  // Community / Social
  { extension: "community" },
  { extension: "social" },
  { extension: "club" },
  { extension: "group" },
  // Finance
  { extension: "finance" },
  { extension: "money" },
  { extension: "fund" },
  // Other popular
  { extension: "life" },
  { extension: "world" },
  { extension: "site" },
  { extension: "online" },
  { extension: "space" },
  { extension: "pro" },
  { extension: "one" },
  { extension: "wtf" },
  { extension: "lol" },
];

/** Authority rank per TLD = its index in the curated TLD_LIST (lower = more
 *  authoritative). Immutable for a given extension, so sorting on it never
 *  reorders rows as availability/pricing data arrives. */
export const TLD_RANK: Record<string, number> = Object.fromEntries(TLD_LIST.map((t, i) => [t.extension, i]));

export const VARIATION_PREFIXES = ["get", "my", "the", "app", "pro", "hub", "lab", "try", "go", "use"];

export interface DomainResult {
  domain: string;
  tld: TLD;
  available: boolean;
  checking?: boolean;
  /** True while only the fast DNS pre-check has answered; an authoritative verdict is still pending. Distinct from `uncertain` (which means "we tried hard and failed"). Client-side only — never returned by the backend. */
  provisional?: boolean;
  /** GoDaddy real price in dollars, if available */
  gdPrice?: number;
  /** Confirmed premium / aftermarket via GoDaddy pricing */
  premium?: boolean;
  /** Heuristic: likely registered or aftermarket even if APIs say otherwise */
  likelyPremium?: boolean;
  /** Backend split-state: registerable (RDAP-404 + NXDOMAIN agree) but premium-tier
   *  price was not confirmed this request. available:true with NO price; UI shows
   *  "premium — Check price", never a $ figure. */
  premiumUnverified?: boolean;
  /** APIs disagreed or failed — treat with caution */
  uncertain?: boolean;
  /** Deterministic cause of uncertainty: `brand_protected` (trademark/registry-reserved)
   *  or `budget_timeout` (our own request budget expired — NOT a registry failure). */
  uncertainReason?: "brand_protected" | "budget_timeout";
  /** Client-only: the batch that owned this row never reached the backend (503 /
   *  network error). Distinct from `uncertain` (backend reached, verdict
   *  inconclusive). Renders "couldn't reach — Retry"; cleared on retry. Never
   *  persisted or returned by the backend. */
  reachFailed?: boolean;
  /** Label only: SLD matches a known trademark/registry-reserved brand. Set on
   *  every card in a brand class (available/taken/uncertain) so the UI can tag
   *  them consistently. Never affects the verdict shown. */
  sldBlocked?: boolean;
  /** Registered but parked on a marketplace (Sedo, Dan, Afternic, …). */
  forSale?: boolean;
  forSaleVia?: string;
  listingUrl?: string;
}

const tldMap = new Map(TLD_LIST.map((t) => [t.extension, t]));

/** Generate domain list with placeholder availability (all unknown/checking) */
export function generateDomainList(query: string, withVariations = false, allowedTlds?: Set<string>): DomainResult[] {
  if (!query.trim()) return [];
  const raw = query.toLowerCase().trim();

  // Detect if user typed a full domain like "jitr.com" — extract SLD + TLD.
  let baseName = raw.replace(/[^a-z0-9.-]/g, "");
  let typedTld: TLD | null = null;
  if (baseName.includes(".")) {
    const parts = baseName.split(".").filter(Boolean);
    if (parts.length >= 2) {
      const maybeTld = parts.slice(1).join(".");
      const match = tldMap.get(maybeTld);
      if (match) {
        baseName = parts[0];
        typedTld = match;
      } else {
        baseName = parts[0];
      }
    } else {
      baseName = parts[0] ?? "";
    }
  }
  const q = baseName.replace(/[^a-z0-9-]/g, "");
  if (!q) return [];

  const names = withVariations
    ? [q, ...VARIATION_PREFIXES.slice(0, 5).map((p) => p + q)]
    : [q];
  const results: DomainResult[] = [];

  const baseTlds = allowedTlds && allowedTlds.size > 0
    ? TLD_LIST.filter((t) => allowedTlds.has(t.extension))
    : TLD_LIST;

  // If user typed a specific TLD, make sure it's included and listed first.
  const tlds = typedTld
    ? [typedTld, ...baseTlds.filter((t) => t.extension !== typedTld!.extension)]
    : baseTlds;

  for (const name of names) {
    for (const tld of tlds) {
      results.push({
        domain: `${name}.${tld.extension}`,
        tld,
        available: false,
        checking: true,
      });
    }
  }

  return results;
}

/** Fast DNS-only pre-check via public API. Returns in ~30-80ms so cards can
 *  flip to a preliminary state before the authoritative RDAP/pricing check. */
export async function checkDomainsFast(
  domains: string[],
  signal?: AbortSignal
): Promise<Map<string, FastInfo>> {
  const resultMap = new Map<string, FastInfo>();
  if (!domains.length) return resultMap;

  try {
    const base = import.meta.env.VITE_SUPABASE_URL ?? "";
    if (!base) return resultMap;
    const url = `${base.replace(/\/$/, "")}/functions/v1/public-api/fast?domains=${encodeURIComponent(domains.join(","))}`;
    const res = await fetch(url, { headers: { accept: "application/json" }, signal });
    if (!res.ok) return resultMap;
    const data = await res.json();
    for (const r of data.results ?? []) {
      resultMap.set(r.domain, { available: !!r.available, uncertain: !!r.uncertain });
    }
  } catch (err) {
    // A superseded search aborting its own probes is expected, not a failure.
    if (import.meta.env.DEV && !signal?.aborted) console.error("Fast check failed:", err);
  }

  return resultMap;
}

/** Fast-probe verdict shape as returned by `/public-api/fast`. */
export interface FastInfo {
  available: boolean;
  uncertain: boolean;
}

/** Merge a fast DNS-only answer into a result row.
 *
 *  The fast probe is a PRE-check: it may only fill in a row that is still
 *  waiting for its authoritative verdict. Two rules keep it honest:
 *   1. A row that has already left Checking (authoritative batch, or the
 *      session cache) is never touched. The /fast chunk and the authoritative
 *      batch race each other, and on a cold isolate the fast chunk can land
 *      LAST (measured live 2026-09-08: authoritative 0.9-1.9 s, slowest fast
 *      chunk 2.3 s). Letting it write `uncertain:true` over a confirmed
 *      available:true turned ten confirmed cards into "Couldn't verify -
 *      sources disagreed" with nothing left in flight to correct them.
 *   2. An uncertain fast answer (NXDOMAIN -> available:true + uncertain:true)
 *      is not a verdict the user may see: the row stays in Checking untouched
 *      until the authoritative batch confirms it.
 *  Returns the SAME object when nothing changes, so a caller can detect a
 *  confident flip by identity. */
export function applyFastVerdict(row: DomainResult, info: FastInfo): DomainResult {
  if (!row.checking) return row;
  if (info.uncertain) return row;
  return { ...row, available: info.available, uncertain: false, checking: false, provisional: true };
}

export interface AvailabilityInfo {
  available: boolean;
  price?: number;
  premium?: boolean;
  likelyPremium?: boolean;
  premiumUnverified?: boolean;
  uncertain?: boolean;
  uncertainReason?: "brand_protected" | "budget_timeout";
  sldBlocked?: boolean;
  forSale?: boolean;
  forSaleVia?: string;
  listingUrl?: string;
}

/** Discriminated availability response. `ok:false` means the batch never reached
 *  the backend (edge error / 503 / thrown) — distinct from a reached response that
 *  simply lacks a given domain. The frontend uses `ok` to decide between "retry"
 *  (unreachable) and leaving a row's state untouched. */
export interface AvailabilityResponse {
  ok: boolean;
  results: Map<string, AvailabilityInfo>;
}

/** Check real availability via edge function. Returns { ok, results }: ok=false
 *  when the batch failed to reach the backend, so callers can show Retry instead
 *  of an eternal spinner. */
export async function checkDomainsAvailability(
  domains: string[],
  signal?: AbortSignal
): Promise<AvailabilityResponse> {
  const results = new Map<string, AvailabilityInfo>();

  try {
    const { data, error } = await supabase.functions.invoke("check-domains", {
      body: { domains },
      signal,
    });

    if (error) {
      // A superseded search aborting its own batch is expected, not a failure.
      if (import.meta.env.DEV && !signal?.aborted) console.error("Edge function error:", error);
      return { ok: false, results };
    }

    if (data?.results) {
      for (const r of data.results) {
        results.set(r.domain, {
          available: r.available,
          price: r.price,
          premium: r.premium,
          likelyPremium: r.likelyPremium,
          premiumUnverified: r.premiumUnverified,
          uncertain: r.uncertain,
          uncertainReason: r.uncertainReason,
          sldBlocked: r.sldBlocked,
          forSale: r.forSale,
          forSaleVia: r.forSaleVia,
          listingUrl: r.listingUrl,
        });
      }
    }

    return { ok: true, results };
  } catch (err) {
    if (import.meta.env.DEV && !signal?.aborted) console.error("Failed to check domains:", err);
    return { ok: false, results };
  }
}

// Keep old function for backwards compat but deprecated
export function generateResults(query: string): DomainResult[] {
  return generateDomainList(query);
}

/** Trusted display price, or null when no trusted DB price exists.
 *  A missing DB price must NOT fall back to the static seed price — that
 *  fabricates a $ for an (registrar,tld) pair we can't confirm. */
export function resolveDisplayPrice(
  dbRegPrice: number | null | undefined
): number | null {
  return dbRegPrice ?? null;
}
