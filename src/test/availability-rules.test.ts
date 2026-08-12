import { describe, it, expect } from "vitest";
import {
  interpretDomainr,
  isLikelyBlocked,
  shouldEscalateToDomainr,
} from "../../supabase/functions/_shared/availability-rules.ts";

describe("interpretDomainr", () => {
  it("dpml takes precedence over free tokens", () => {
    expect(interpretDomainr({ domain: "x.software", status: "undelegated inactive dpml" }))
      .toEqual({ kind: "taken", forSale: false });
  });

  it("marketed priced → taken + forSale", () => {
    expect(interpretDomainr({ domain: "x.com", status: "marketed priced" }))
      .toEqual({ kind: "taken", forSale: true });
  });

  it("bare undelegated → unknown (absence of evidence, never a sale)", () => {
    expect(interpretDomainr({ domain: "x.com", status: "undelegated" }))
      .toEqual({ kind: "unknown" });
  });

  it("undelegated inactive → available", () => {
    expect(interpretDomainr({ domain: "x.com", status: "undelegated inactive" }))
      .toEqual({ kind: "available", premium: false });
  });

  it("undelegated inactive premium → available + premium", () => {
    expect(interpretDomainr({ domain: "x.io", status: "undelegated inactive premium" }))
      .toEqual({ kind: "available", premium: true });
  });

  it("reserved → taken", () => {
    expect(interpretDomainr({ domain: "x.com", status: "reserved" }))
      .toEqual({ kind: "taken", forSale: false });
  });

  it("missing / empty status → unknown", () => {
    expect(interpretDomainr(undefined)).toEqual({ kind: "unknown" });
    expect(interpretDomainr({ domain: "x.com", status: "" })).toEqual({ kind: "unknown" });
  });
});

describe("shouldEscalateToDomainr", () => {
  it("rdap-available (non-premium) does NOT escalate", () => {
    expect(shouldEscalateToDomainr({ available: true, checkedVia: "rdap" })).toBe(false);
  });
  it("dns-available (non-premium) does NOT escalate", () => {
    expect(shouldEscalateToDomainr({ available: true, checkedVia: "dns" })).toBe(false);
  });
  it("likelyPremium available escalates", () => {
    expect(shouldEscalateToDomainr({ available: true, checkedVia: "domainr", likelyPremium: true })).toBe(true);
  });
  it("uncertain escalates", () => {
    expect(shouldEscalateToDomainr({ available: false, uncertain: true, checkedVia: "rdap" })).toBe(true);
  });
  it("domainr-confirmed available does not escalate", () => {
    expect(shouldEscalateToDomainr({ available: true, checkedVia: "domainr" })).toBe(false);
  });
  it("taken non-uncertain does not escalate", () => {
    expect(shouldEscalateToDomainr({ available: false, checkedVia: "rdap" })).toBe(false);
  });
});

describe("isLikelyBlocked", () => {
  it("flags reserved / DPML brand SLDs", () => {
    expect(isLikelyBlocked("google.digital")).toBe(true);
    expect(isLikelyBlocked("microsoft.software")).toBe(true);
    expect(isLikelyBlocked("nic.dev")).toBe(true);
    expect(isLikelyBlocked("microsoft.software")).toBe(true);
  });
  it("flags ICANN Spec-5 reserved second-level labels", () => {
    // Regression guard: these RDAP-404 + NXDOMAIN exactly like a free name and
    // are not premium suspects, so nothing else stops them being sold.
    for (const sld of ["afrinic", "apnic", "arin", "lacnic", "ripe", "nro", "iab",
                       "iesg", "ietf", "irtf", "istf", "rssac", "ssac", "alac",
                       "aso", "ccnso", "gac", "gnso", "rfc-editor", "example"]) {
      expect(isLikelyBlocked(`${sld}.xyz`), sld).toBe(true);
    }
  });
  it("does not flag coined names", () => {
    expect(isLikelyBlocked("kvarturbo2748.digital")).toBe(false);
  });
  it("does not flag ordinary or substring-similar names", () => {
    expect(isLikelyBlocked("kvarturbo2748.digital")).toBe(false);
    expect(isLikelyBlocked("acmecoffee.shop")).toBe(false);
    expect(isLikelyBlocked("googleplex.com")).toBe(false);
  });
});
