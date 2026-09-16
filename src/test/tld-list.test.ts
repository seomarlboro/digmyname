import { describe, it, expect } from "vitest";
import { TLD_LIST, TLD_RANK, generateDomainList } from "@/lib/domainData";
import { TLD_SNAPSHOT } from "@/seo/tldRoutes";

describe("TLD_LIST", () => {
  it("carries nothing but the extension — no seed prices, no invented features", () => {
    for (const tld of TLD_LIST) {
      expect(Object.keys(tld), tld.extension).toEqual(["extension"]);
    }
  });

  it("extensions are unique, lowercase and ranked by list order", () => {
    const exts = TLD_LIST.map((t) => t.extension);
    expect(new Set(exts).size).toBe(exts.length);
    for (const e of exts) expect(e).toMatch(/^[a-z]+$/);
    expect(TLD_RANK.com).toBe(0);
    expect(TLD_RANK[exts[exts.length - 1]]).toBe(exts.length - 1);
  });

  it("every searchable extension is sold by at least one registrar we track", () => {
    // A card we can never price is a dead end: no price, no "All .x prices" link,
    // and a Buy button pointing at a registrar that does not carry the TLD. .buy
    // was exactly that until 2026-09-16 — zero rows in registrar_prices, shown on
    // every single search. Offer only what a visitor can act on.
    const priced = new Set(TLD_SNAPSHOT.tlds.filter((t) => t.prices.length > 0).map((t) => t.tld));
    const orphans = TLD_LIST.map((t) => t.extension).filter((e) => !priced.has(e));
    expect(orphans, `searchable but unpriced at every tracked registrar: ${orphans.join(", ")}`).toEqual([]);
  });

  it("generateDomainList still builds one checking row per extension", () => {
    const list = generateDomainList("acme");
    expect(list).toHaveLength(TLD_LIST.length);
    expect(list[0]).toMatchObject({ domain: "acme.com", checking: true, available: false });
    expect(list[0].tld).toEqual({ extension: "com" });
  });
});
