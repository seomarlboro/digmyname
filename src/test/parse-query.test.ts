import { describe, it, expect } from "vitest";
import { parseQuery, generateDomainList, TLD_LIST } from "@/lib/domainData";

/**
 * Honesty guard. Typing `acme.zone` searches `acme` and checks nothing for
 * `.zone`; the UI must be able to say so, so the parse has to report the
 * dropped extension instead of swallowing it. A regression here puts the
 * visitor's exact name back into a summary that never looked it up.
 */
describe("parseQuery", () => {
  it("returns the bare label untouched", () => {
    expect(parseQuery("acme")).toEqual({ base: "acme", typedTld: null, unsupportedTld: null });
  });

  it("splits a tracked extension off and keeps it", () => {
    const p = parseQuery("acme.io");
    expect(p.base).toBe("acme");
    expect(p.typedTld?.extension).toBe("io");
    expect(p.unsupportedTld).toBeNull();
  });

  it("reports an extension we do not track instead of dropping it silently", () => {
    const p = parseQuery("acme.zone");
    expect(p.base).toBe("acme");
    expect(p.typedTld).toBeNull();
    expect(p.unsupportedTld).toBe("zone");
  });

  it("reports extensions removed from the curated list (.gg, .so) as unsupported", () => {
    // Both were dropped 2026-08-15: no RDAP server, so availability is unverifiable.
    for (const ext of ["gg", "so"]) {
      expect(TLD_LIST.some((t) => t.extension === ext)).toBe(false);
      expect(parseQuery(`acme.${ext}`).unsupportedTld).toBe(ext);
    }
  });

  it("handles multi-label input and casing", () => {
    expect(parseQuery("  ACME.CO.UK ")).toMatchObject({ base: "acme", unsupportedTld: "co.uk" });
  });

  it("is empty for input with no usable label", () => {
    expect(parseQuery("   ")).toEqual({ base: "", typedTld: null, unsupportedTld: null });
    expect(parseQuery("...")).toEqual({ base: "", typedTld: null, unsupportedTld: null });
  });

  it("never produces a card for an extension we do not track", () => {
    const rows = generateDomainList("acme.zone");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tld.extension !== "zone")).toBe(true);
    expect(rows.every((r) => r.domain.startsWith("acme."))).toBe(true);
  });

  it("still pins a tracked typed extension to the front", () => {
    expect(generateDomainList("acme.io")[0].tld.extension).toBe("io");
  });
});
