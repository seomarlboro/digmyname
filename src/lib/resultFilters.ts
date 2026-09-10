/**
 * Result filters for the home page. Pure logic, no React, so it is testable and
 * so the floating filter bar and the results list agree on one definition.
 *
 * Model: Price and Features narrow the *available* list (they describe a
 * purchase); Status picks which verdicts are shown at all.
 */
import type { CardFacts } from "./cardFacts";

export const PRICE_MIN = 0;
/** The slider's top stop is open-ended: "$200+" means "no upper bound". */
export const PRICE_MAX = 200;

export type StatusFilter = "all" | "available" | "taken" | "unverified";

export const STATUS_OPTIONS: { value: StatusFilter; label: string; short: string }[] = [
  { value: "all", label: "All domains", short: "All" },
  { value: "available", label: "Available only", short: "Available" },
  { value: "taken", label: "Taken only", short: "Taken" },
  { value: "unverified", label: "Unverified only", short: "Unverified" },
];

/** Feature filters are backed by real data (the cheapest registrar's row, the availability verdict) — never by a static seed. */
export type Feature = "whois_privacy" | "promo_code" | "fair_renewal" | "standard_price";

export const FEATURE_OPTIONS: { value: Feature; label: string; hint: string }[] = [
  { value: "whois_privacy", label: "WHOIS privacy included", hint: "The cheapest registrar bundles WHOIS privacy" },
  { value: "promo_code", label: "Promo code available", hint: "A first-year promo code is on file" },
  { value: "fair_renewal", label: "No renewal trap", hint: "Renewal is at most 1.8× the first-year price" },
  { value: "standard_price", label: "Standard price only", hint: "Hide premium and price-on-request names" },
];

export interface ResultFilters {
  price: [number, number];
  features: Set<Feature>;
  status: StatusFilter;
}

export const DEFAULT_FILTERS: ResultFilters = {
  price: [PRICE_MIN, PRICE_MAX],
  features: new Set<Feature>(),
  status: "all",
};

export const isPriceActive = (f: ResultFilters) => f.price[0] > PRICE_MIN || f.price[1] < PRICE_MAX;
export const isFeaturesActive = (f: ResultFilters) => f.features.size > 0;
export const isStatusActive = (f: ResultFilters) => f.status !== "all";

/** How many controls are non-default — shown as a badge on the mobile FAB. */
export function activeFilterCount(f: ResultFilters, selectedTlds: number): number {
  return selectedTlds + f.features.size + (isStatusActive(f) ? 1 : 0) + (isPriceActive(f) ? 1 : 0);
}

/** Renewal above this multiple of the first-year price is flagged as a trap (same threshold the cards use). */
export const RENEWAL_TRAP_RATIO = 1.8;

const hasFeature = (facts: CardFacts, feature: Feature): boolean => {
  switch (feature) {
    case "whois_privacy":
      return facts.whoisPrivacy;
    case "promo_code":
      return facts.promoCode != null;
    case "fair_renewal":
      return facts.trustedPrice != null && facts.renewPrice != null && facts.renewPrice <= facts.trustedPrice * RENEWAL_TRAP_RATIO;
    case "standard_price":
      return facts.trustedPrice != null && !facts.isPremium && !facts.isLikelyPremium && !facts.showCheckPrice;
  }
};

/**
 * Does one settled card pass the current filters? Rows still checking are the
 * caller's business (they are transient and never filtered out).
 */
export function matchesFilters(facts: CardFacts, filters: ResultFilters): boolean {
  const verdict = facts.verdict;
  if (filters.status !== "all" && verdict !== filters.status) return false;

  const narrowsPurchase = isPriceActive(filters) || isFeaturesActive(filters);
  if (!narrowsPurchase) return true;
  // Price and feature filters describe something you can buy; a taken or
  // unverified name can't satisfy them, so they drop out once either is set.
  if (verdict !== "available") return false;

  if (isPriceActive(filters)) {
    if (facts.trustedPrice == null) return false;
    const [lo, hi] = filters.price;
    if (facts.trustedPrice < lo) return false;
    if (hi < PRICE_MAX && facts.trustedPrice > hi) return false;
  }
  for (const feature of filters.features) {
    if (!hasFeature(facts, feature)) return false;
  }
  return true;
}
