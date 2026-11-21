/**
 * Everything a result card (and the filters) derive from a verdict plus the
 * cheapest registrar's row. One place, so the card and the filter bar can
 * never disagree about what "premium", "check price" or "renewal trap" mean.
 */
import { resolveDisplayPrice, type DomainResult } from "./domainData";
import { hasRegistryPremiumTier } from "../../supabase/functions/_shared/availability-rules";

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
  /** Available, and no registrar has confirmed that the extension's standard
   *  price applies to this very name — so no price is shown at all. */
  isPriceUnverified: boolean;
  /** …and the answer is on its way: "Checking price…" rather than "Check price". */
  pricePending: boolean;
  /** Not registered and not registerable: the registry holds the name back. */
  isReserved: boolean;
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
  // The registrar table holds the EXTENSION's price. On an extension whose
  // registry may price one name as premium it applies to this name only once a
  // registrar has said so: the edge marks the names still waiting, and a row the
  // edge has not answered at all (browser / DNS lane only) has no say on price.
  const isPriceUnverified =
    available && !isPremium &&
    (result.priceUnverified === true || (result.provisional === true && hasRegistryPremiumTier(result.domain)));
  const pricePending = isPriceUnverified && (result.pricePending === true || result.provisional === true);
  const trustedPrice = isPriceUnverified ? null : resolveDisplayPrice(cheapest?.regPrice);
  const hasTrustedPrice = trustedPrice != null;
  const showCheckPrice = available && (isPremiumUnverified || !hasTrustedPrice) && !isPremium;
  const premiumPrice = isPremium && typeof result.gdPrice === "number" && result.gdPrice > 0 ? result.gdPrice : null;
  // A premium name renews at the registrar's quoted premium renewal, never the catalog's standard one.
  const premiumRenew =
    premiumPrice != null && typeof result.premiumRenewPrice === "number" && result.premiumRenewPrice > 0 ? result.premiumRenewPrice : null;
  const renewPrice = isPremium ? premiumRenew : hasTrustedPrice ? (cheapest?.renewPrice ?? null) : null;
  const firstYear = isPremium ? premiumPrice : trustedPrice;
  const hasHighRenewal =
    (isPremium || (!isLikelyPremium && hasTrustedPrice)) && firstYear != null && renewPrice != null && renewPrice > firstYear * RENEWAL_TRAP_RATIO;
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
    isPriceUnverified,
    pricePending,
    isReserved: !available && !uncertain && result.reserved === true,
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
