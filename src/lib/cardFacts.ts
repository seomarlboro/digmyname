/**
 * Everything a result card (and the filters) derive from a verdict plus the
 * cheapest registrar's row. One place, so the card and the filter bar can
 * never disagree about what "premium", "check price" or "renewal trap" mean.
 */
import { resolveDisplayPrice, type DomainResult } from "./domainData";

export interface CheapestRegistrar {
  registrar: string;
  regPrice: number;
  renewPrice: number;
  affiliateUrl: string | null;
  promoCode: string | null;
  whoisPrivacy: boolean;
}

/** The section a settled card is listed under — the same grouping DomainSearch renders. */
export type Verdict = "available" | "taken" | "unverified";

export interface CardFacts {
  available: boolean;
  uncertain: boolean;
  checking: boolean;
  verdict: Verdict;
  isPremium: boolean;
  isPremiumUnverified: boolean;
  isLikelyPremium: boolean;
  /** Trusted first-year price from the registrar table, or null (never a seed price). */
  trustedPrice: number | null;
  /** Renewal price for the same registrar row, or null when there is no trusted price. */
  renewPrice: number | null;
  /** Renewal is more than 1.8× the first-year price. */
  hasHighRenewal: boolean;
  /** Available but no price can be shown — the CTA reads "Check price". */
  showCheckPrice: boolean;
  /** A registry-premium name whose price a registrar confirmed (server `price`), else null. */
  premiumPrice: number | null;
  registrarName: string | null;
  promoCode: string | null;
  whoisPrivacy: boolean;
}

export const RENEWAL_TRAP_RATIO = 1.8;

export function deriveCardFacts(result: DomainResult, cheapest: CheapestRegistrar | undefined): CardFacts {
  const available = result.available === true;
  const uncertain = result.uncertain === true;
  const checking = result.checking === true;
  const isPremium = result.premium === true;
  const isPremiumUnverified = result.premiumUnverified === true;
  const isLikelyPremium = !isPremium && (result.likelyPremium === true || isPremiumUnverified);
  // Never fabricate a price: without a trusted DB row the card falls through to
  // the price-less "Check price" state instead of a static seed price.
  const trustedPrice = resolveDisplayPrice(cheapest?.regPrice);
  const hasTrustedPrice = trustedPrice != null;
  const renewPrice = hasTrustedPrice ? (cheapest?.renewPrice ?? null) : null;
  const hasHighRenewal =
    !isPremium && !isLikelyPremium && hasTrustedPrice && renewPrice != null && renewPrice > trustedPrice * RENEWAL_TRAP_RATIO;
  const showCheckPrice = available && (isPremiumUnverified || !hasTrustedPrice) && !isPremium;
  const premiumPrice = isPremium && typeof result.gdPrice === "number" && result.gdPrice > 0 ? result.gdPrice : null;
  // Mirrors the three result sections: an uncertain row is "Couldn't verify"
  // unless it is a brand-protected or provisional row, which the UI files under Taken.
  const verdict: Verdict =
    uncertain && result.sldBlocked !== true && result.provisional !== true
      ? "unverified"
      : available && !uncertain
        ? "available"
        : "taken";
  return {
    available,
    uncertain,
    checking,
    verdict,
    isPremium,
    isPremiumUnverified,
    isLikelyPremium,
    trustedPrice,
    renewPrice,
    hasHighRenewal,
    showCheckPrice,
    premiumPrice,
    // A confirmed premium price is Porkbun's (the only registrar the pipeline
    // asks per name), so the card names Porkbun and links there — not the
    // cheapest standard-price registrar, whose promo and privacy do not apply.
    registrarName: premiumPrice != null ? "Porkbun" : hasTrustedPrice ? (cheapest?.registrar ?? null) : null,
    promoCode: premiumPrice != null ? null : hasTrustedPrice ? (cheapest?.promoCode ?? null) : null,
    whoisPrivacy: premiumPrice != null ? false : hasTrustedPrice ? (cheapest?.whoisPrivacy ?? false) : false,
  };
}
