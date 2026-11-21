import { describe, it, expect } from "vitest";
import {
  interpretDomainr,
  interpretRdap404,
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
  it("keeps registry-operations labels blocked", () => {
    for (const sld of ["iana", "icann", "internic", "nic", "rdds", "whois", "www"]) {
      expect(isLikelyBlocked(`${sld}.xyz`), sld).toBe(true);
    }
  });
  it("does not flag ICANN/IANA related names — premise refuted 2026-08-15", () => {
    // Checked against the .xyz registry's own RDAP: 14 of these 24 labels answer
    // 200, i.e. ordinary registrants hold them, so they are registerable. The
    // block list was showing TAKEN names as "Unverified" and refusing sales on
    // the free ones. Re-adding them needs evidence, not a hunch.
    for (const sld of ["apnic", "arin", "aso", "gac", "gnso", "gtld-servers", "iab",
                       "iesg", "irtf", "istf", "nro", "ripe", "root-servers", "ssac",
                       "afrinic", "lacnic", "ietf", "example"]) {
      expect(isLikelyBlocked(`${sld}.xyz`), sld).toBe(false);
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


// What a registry's RDAP 404 says about the name. Bodies are real ones, captured
// 2026-11-21 (rdap.radix.host for the first three).
describe("interpretRdap404", () => {
  const body = (description: string[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({ errorCode: 404, title: "Not Found", description, ...extra });

  it("registry reserved → reserved (garden.tech)", () => {
    expect(
      interpretRdap404(body(["Domain Name: garden.tech", "This name is not available for registration:", "Domain name is registry reserved"])),
    ).toBe("reserved");
  });

  it("a plain unregistered name in the same TLD → not_registered", () => {
    expect(
      interpretRdap404(body(["Domain qqzzxxjjkkvv.tech is available for registration", "Please visit https://rdap.radix.host/registrars/ for a list of accredited registrars"])),
    ).toBe("not_registered");
  });

  it("'not available for registration' for another reason → not_registerable, never free", () => {
    expect(
      interpretRdap404(body(["Domain Name: coffee.xyz", "This name is not available for registration:", "Tld not supported by this registry interface"])),
    ).toBe("not_registerable");
  });

  it("the other registries' ordinary 404s stay not_registered", () => {
    expect(interpretRdap404("")).toBe("not_registered"); // Verisign: empty body
    expect(interpretRdap404(undefined)).toBe("not_registered");
    expect(interpretRdap404(body(["Object not found"]))).toBe("not_registered"); // Identity Digital, PIR
    expect(interpretRdap404(body(["qqzzxxjjkkvv.dev not found"]))).toBe("not_registered"); // Google Registry
  });

  it("reads only the error's own description — not terms-of-service notices, not HTML", () => {
    const notices = [{ title: "Terms of Service", description: ["The registry reserves the right to restrict access. All rights reserved."] }];
    expect(interpretRdap404(body(["Object not found"], { notices }))).toBe("not_registered");
    expect(interpretRdap404("<html><body>404 — all rights reserved, name reserved</body></html>")).toBe("not_registered");
    expect(interpretRdap404(body(["Copyright 2026. All rights reserved."]))).toBe("not_registered");
  });
});
