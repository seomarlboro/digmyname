import { describe, it, expect } from "vitest";
import { deriveCardFacts, type CheapestRegistrar } from "@/lib/cardFacts";
import {
  DEFAULT_FILTERS,
  PRICE_MAX,
  activeFilterCount,
  isPriceActive,
  matchesFilters,
  type ResultFilters,
} from "@/lib/resultFilters";
import type { DomainResult } from "@/lib/domainData";

const row = (ext: string, extra: Partial<DomainResult> = {}): DomainResult => ({
  domain: `acme.${ext}`,
  tld: { extension: ext },
  available: true,
  checking: false,
  ...extra,
});

const cheap = (over: Partial<CheapestRegistrar> = {}): CheapestRegistrar => ({
  registrar: "Porkbun",
  regPrice: 3.6,
  renewPrice: 25.23,
  affiliateUrl: null,
  promoCode: null,
  whoisPrivacy: false,
  ...over,
});

const filters = (over: Partial<ResultFilters>): ResultFilters => ({ ...DEFAULT_FILTERS, features: new Set(), ...over });

describe("matchesFilters", () => {
  it("default filters keep every settled row", () => {
    expect(matchesFilters(deriveCardFacts(row("com"), cheap()), DEFAULT_FILTERS)).toBe(true);
    expect(matchesFilters(deriveCardFacts(row("com", { available: false }), cheap()), DEFAULT_FILTERS)).toBe(true);
    expect(matchesFilters(deriveCardFacts(row("com", { uncertain: true }), cheap()), DEFAULT_FILTERS)).toBe(true);
  });

  it("status picks one verdict", () => {
    const available = deriveCardFacts(row("com"), cheap());
    const taken = deriveCardFacts(row("com", { available: false }), cheap());
    const unverified = deriveCardFacts(row("com", { uncertain: true }), cheap());
    expect(matchesFilters(available, filters({ status: "available" }))).toBe(true);
    expect(matchesFilters(taken, filters({ status: "available" }))).toBe(false);
    expect(matchesFilters(taken, filters({ status: "taken" }))).toBe(true);
    expect(matchesFilters(unverified, filters({ status: "taken" }))).toBe(false);
    expect(matchesFilters(unverified, filters({ status: "unverified" }))).toBe(true);
  });

  it("a brand-protected uncertain row files under Taken, like the results list does", () => {
    const brand = deriveCardFacts(row("com", { available: false, uncertain: true, sldBlocked: true }), cheap());
    expect(brand.verdict).toBe("taken");
    expect(matchesFilters(brand, filters({ status: "taken" }))).toBe(true);
    expect(matchesFilters(brand, filters({ status: "unverified" }))).toBe(false);
  });

  it("price range applies to the trusted first-year price and the top stop is open-ended", () => {
    const ai = deriveCardFacts(row("ai"), cheap({ regPrice: 77.39, renewPrice: 130.79 }));
    expect(matchesFilters(ai, filters({ price: [0, 50] }))).toBe(false);
    expect(matchesFilters(ai, filters({ price: [50, PRICE_MAX] }))).toBe(true);
    const inc = deriveCardFacts(row("inc"), cheap({ regPrice: 2499, renewPrice: 2499 }));
    expect(matchesFilters(inc, filters({ price: [100, PRICE_MAX] }))).toBe(true);
    expect(matchesFilters(inc, filters({ price: [100, 195] }))).toBe(false);
  });

  it("a narrowed price hides names without a confirmed price and every non-available row", () => {
    const checkPrice = deriveCardFacts(row("link"), undefined);
    expect(checkPrice.showCheckPrice).toBe(true);
    expect(matchesFilters(checkPrice, filters({ price: [0, 50] }))).toBe(false);
    expect(matchesFilters(deriveCardFacts(row("com", { available: false }), cheap()), filters({ price: [0, 50] }))).toBe(false);
  });

  it("features come from the registrar row, never from a seed", () => {
    const whois = deriveCardFacts(row("com"), cheap({ whoisPrivacy: true }));
    const noWhois = deriveCardFacts(row("com"), cheap({ whoisPrivacy: false }));
    expect(matchesFilters(whois, filters({ features: new Set(["whois_privacy"]) }))).toBe(true);
    expect(matchesFilters(noWhois, filters({ features: new Set(["whois_privacy"]) }))).toBe(false);

    const promo = deriveCardFacts(row("com"), cheap({ promoCode: "COM67" }));
    expect(matchesFilters(promo, filters({ features: new Set(["promo_code"]) }))).toBe(true);
    expect(matchesFilters(noWhois, filters({ features: new Set(["promo_code"]) }))).toBe(false);
  });

  it("'no renewal trap' means renewal ≤ 1.8× first-year — the same threshold the card warns at", () => {
    const trap = deriveCardFacts(row("agency"), cheap({ regPrice: 3.6, renewPrice: 25.23 }));
    const fair = deriveCardFacts(row("net"), cheap({ regPrice: 11.4, renewPrice: 11.4 }));
    const f = filters({ features: new Set(["fair_renewal"]) });
    expect(trap.hasHighRenewal).toBe(true);
    expect(matchesFilters(trap, f)).toBe(false);
    expect(matchesFilters(fair, f)).toBe(true);
  });

  it("'standard price only' drops premium, likely-premium and check-price names", () => {
    const f = filters({ features: new Set(["standard_price"]) });
    expect(matchesFilters(deriveCardFacts(row("com", { premium: true }), cheap()), f)).toBe(false);
    expect(matchesFilters(deriveCardFacts(row("com", { likelyPremium: true }), cheap()), f)).toBe(false);
    expect(matchesFilters(deriveCardFacts(row("com", { premiumUnverified: true }), cheap()), f)).toBe(false);
    expect(matchesFilters(deriveCardFacts(row("com"), undefined), f)).toBe(false);
    expect(matchesFilters(deriveCardFacts(row("com"), cheap()), f)).toBe(true);
  });

  it("features combine with AND", () => {
    const both = deriveCardFacts(row("com"), cheap({ whoisPrivacy: true, promoCode: "X" }));
    const one = deriveCardFacts(row("com"), cheap({ whoisPrivacy: true }));
    const f = filters({ features: new Set(["whois_privacy", "promo_code"]) });
    expect(matchesFilters(both, f)).toBe(true);
    expect(matchesFilters(one, f)).toBe(false);
  });
});

describe("filter bookkeeping", () => {
  it("counts non-default controls for the mobile badge", () => {
    expect(activeFilterCount(DEFAULT_FILTERS, 0)).toBe(0);
    expect(activeFilterCount(filters({ status: "available", price: [10, PRICE_MAX], features: new Set(["promo_code"]) }), 2)).toBe(5);
  });

  it("the full slider range is not an active price filter", () => {
    expect(isPriceActive(DEFAULT_FILTERS)).toBe(false);
    expect(isPriceActive(filters({ price: [0, 199] }))).toBe(true);
  });
});
