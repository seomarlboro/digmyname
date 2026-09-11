import { describe, it, expect } from "vitest";
import { deriveCardFacts, type CheapestRegistrar } from "@/lib/cardFacts";
import type { DomainResult } from "@/lib/domainData";

const result = (extra: Partial<DomainResult> = {}): DomainResult => ({
  domain: "acme.com",
  tld: { extension: "com" },
  available: true,
  checking: false,
  ...extra,
});

const cheapest: CheapestRegistrar = {
  registrar: "Spaceship",
  regPrice: 9.08,
  renewPrice: 10.18,
  affiliateUrl: null,
  promoCode: "COM67",
  whoisPrivacy: true,
};

describe("deriveCardFacts", () => {
  it("shows the trusted registrar price and its real attributes", () => {
    const f = deriveCardFacts(result(), cheapest);
    expect(f.trustedPrice).toBe(9.08);
    expect(f.registrarName).toBe("Spaceship");
    expect(f.promoCode).toBe("COM67");
    expect(f.whoisPrivacy).toBe(true);
    expect(f.showCheckPrice).toBe(false);
    expect(f.hasHighRenewal).toBe(false);
    expect(f.verdict).toBe("available");
  });

  it("with no registrar row there is no price, no registrar and no attributes — only 'Check price'", () => {
    const f = deriveCardFacts(result(), undefined);
    expect(f.trustedPrice).toBeNull();
    expect(f.registrarName).toBeNull();
    expect(f.promoCode).toBeNull();
    expect(f.whoisPrivacy).toBe(false);
    expect(f.showCheckPrice).toBe(true);
  });

  it("flags a renewal above 1.8× the first-year price", () => {
    const f = deriveCardFacts(result(), { ...cheapest, regPrice: 0.9, renewPrice: 30.2 });
    expect(f.hasHighRenewal).toBe(true);
  });

  it("premium states never show a catalog price", () => {
    expect(deriveCardFacts(result({ premium: true }), cheapest).showCheckPrice).toBe(false);
    expect(deriveCardFacts(result({ premium: true }), cheapest).isPremium).toBe(true);
    const unverified = deriveCardFacts(result({ premiumUnverified: true }), cheapest);
    expect(unverified.isLikelyPremium).toBe(true);
    expect(unverified.showCheckPrice).toBe(true);
    expect(unverified.hasHighRenewal).toBe(false);
  });

  it("verdict mirrors the three result sections", () => {
    expect(deriveCardFacts(result({ available: false }), cheapest).verdict).toBe("taken");
    expect(deriveCardFacts(result({ uncertain: true }), cheapest).verdict).toBe("unverified");
    expect(deriveCardFacts(result({ available: false, uncertain: true, provisional: true }), cheapest).verdict).toBe("taken");
  });

  it("a registrar-confirmed premium price is exposed only for a premium verdict", () => {
    const base = { domain: "reputation.dev", tld: { extension: "dev" }, available: true, checking: false } as unknown as Parameters<typeof deriveCardFacts>[0];
    const premium = deriveCardFacts({ ...base, premium: true, gdPrice: 164.57 }, undefined);
    expect([premium.isPremium, premium.premiumPrice, premium.showCheckPrice]).toEqual([true, 164.57, false]);
    // The confirmed price is Porkbun's, so the card is attributed to Porkbun, not to the cheapest standard-price row.
    const withCheapest = deriveCardFacts({ ...base, premium: true, gdPrice: 164.57 }, { tld: "dev", registrar: "Spaceship", regPrice: 8.48, renewPrice: 25, promoCode: "SPSR86", whoisPrivacy: true } as unknown as Parameters<typeof deriveCardFacts>[1]);
    expect([withCheapest.registrarName, withCheapest.promoCode, withCheapest.whoisPrivacy]).toEqual(["Porkbun", null, false]);
    const unpriced = deriveCardFacts({ ...base, premium: true }, undefined);
    expect(unpriced.premiumPrice).toBeNull();
    const standard = deriveCardFacts({ ...base, gdPrice: 8.48 }, undefined);
    expect([standard.isPremium, standard.premiumPrice]).toEqual([false, null]);
  });
});
