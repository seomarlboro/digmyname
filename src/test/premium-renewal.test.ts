import { describe, it, expect } from "vitest";
import { deriveCardFacts, type CheapestRegistrar } from "@/lib/cardFacts";
import type { DomainResult } from "@/lib/domainData";

const standardRow: CheapestRegistrar = {
  registrar: "Porkbun",
  regPrice: 26.26,
  renewPrice: 26.26,
  affiliateUrl: null,
  promoCode: null,
  whoisPrivacy: true,
};

const premium = (over: Partial<DomainResult>): DomainResult =>
  ({ domain: "reputation.space", tld: { extension: "space" }, available: true, premium: true, gdPrice: 68.75, ...over }) as DomainResult;

describe("premium renewal on cards", () => {
  it("shows the registrar-quoted premium renewal and flags a renewal trap against the premium first year", () => {
    const f = deriveCardFacts(premium({ premiumRenewPrice: 273.44 }), standardRow);
    expect(f.premiumPrice).toBe(68.75);
    expect(f.renewPrice).toBe(273.44);
    expect(f.hasHighRenewal).toBe(true);
  });

  it("a premium that renews cheaper is not a trap", () => {
    const f = deriveCardFacts(premium({ domain: "reputation.art", gdPrice: 348.17, premiumRenewPrice: 76.94 }), standardRow);
    expect(f.renewPrice).toBe(76.94);
    expect(f.hasHighRenewal).toBe(false);
  });

  it("never falls back to the standard catalog renewal for a premium name", () => {
    const f = deriveCardFacts(premium({}), standardRow);
    expect(f.renewPrice).toBeNull();
    expect(f.hasHighRenewal).toBe(false);
  });

  it("a premium without a confirmed price shows no renewal even if one was sent", () => {
    const f = deriveCardFacts(premium({ gdPrice: undefined, premiumRenewPrice: 99 }), standardRow);
    expect(f.renewPrice).toBeNull();
  });

  it("standard names keep the cheapest registrar's renewal", () => {
    const f = deriveCardFacts({ domain: "x.build", tld: { extension: "build" }, available: true } as DomainResult, standardRow);
    expect(f.renewPrice).toBe(26.26);
  });
});

describe("premium renewal does not change availability", () => {
  it("verdict, availability and uncertainty are identical with and without a renewal quote", () => {
    const without = deriveCardFacts(premium({}), standardRow);
    const withQuote = deriveCardFacts(premium({ premiumRenewPrice: 273.44 }), standardRow);
    expect(withQuote.verdict).toBe(without.verdict);
    expect(withQuote.available).toBe(without.available);
    expect(withQuote.uncertain).toBe(without.uncertain);
    expect(withQuote.premiumPrice).toBe(without.premiumPrice);
  });
});
