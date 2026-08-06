// Pure unit tests for the availability safeguards — NO network.
import { describe, it, expect } from "vitest";
import { interpretDomainr } from "./availability-rules.ts";
import { isLikelyBrandBlocked } from "./pipeline.ts";

describe("interpretDomainr", () => {
  it("dpml token wins over free tokens → taken", () => {
    expect(interpretDomainr({ domain: "x.software", status: "undelegated inactive dpml" }))
      .toEqual({ kind: "taken", forSale: false });
  });
  it("reserved → taken", () => {
    expect(interpretDomainr({ domain: "x.com", status: "reserved" }))
      .toEqual({ kind: "taken", forSale: false });
  });
  it("disallowed → taken", () => {
    expect(interpretDomainr({ domain: "x.com", status: "disallowed" }))
      .toEqual({ kind: "taken", forSale: false });
  });
  it("marketed → taken + forSale", () => {
    expect(interpretDomainr({ domain: "x.com", status: "marketed" }))
      .toEqual({ kind: "taken", forSale: true });
  });
  it("undelegated inactive → available", () => {
    expect(interpretDomainr({ domain: "x.com", status: "undelegated inactive" }))
      .toEqual({ kind: "available", premium: false });
  });
  it("undelegated inactive premium → available + premium", () => {
    expect(interpretDomainr({ domain: "x.io", status: "undelegated inactive premium" }))
      .toEqual({ kind: "available", premium: true });
  });
  it("empty / undefined → unknown", () => {
    expect(interpretDomainr(undefined)).toEqual({ kind: "unknown" });
    expect(interpretDomainr({ domain: "x.com", status: "" })).toEqual({ kind: "unknown" });
  });
});

describe("isLikelyBrandBlocked", () => {
  it("flags famous DPML brands", () => {
    expect(isLikelyBrandBlocked("microsoft.software")).toBe(true);
    expect(isLikelyBrandBlocked("google.digital")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(isLikelyBrandBlocked("MICROSOFT.software")).toBe(true);
  });
  it("does not substring-match or flag coined names", () => {
    expect(isLikelyBrandBlocked("kvarturbo2748.digital")).toBe(false);
    expect(isLikelyBrandBlocked("notmicrosoftatall.com")).toBe(false);
  });
});

describe("brand-block downgrade shape", () => {
  const downgrade = (base: { domain: string; available: boolean; checkedVia: string; uncertain?: boolean }) => {
    const brandBlockRisk = base.available && !base.uncertain && isLikelyBrandBlocked(base.domain);
    return brandBlockRisk
      ? { domain: base.domain, available: false, checkedVia: base.checkedVia, uncertain: true }
      : base;
  };

  it("brand-blocked available → available:false + uncertain:true", () => {
    expect(downgrade({ domain: "google.digital", available: true, checkedVia: "rdap" }))
      .toEqual({ domain: "google.digital", available: false, checkedVia: "rdap", uncertain: true });
  });

  it("ordinary coined name keeps its base verdict", () => {
    const base = { domain: "kvarturbo2748.digital", available: true, checkedVia: "rdap" };
    expect(downgrade(base)).toBe(base);
  });
});
