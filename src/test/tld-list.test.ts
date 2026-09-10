import { describe, it, expect } from "vitest";
import { TLD_LIST, TLD_RANK, generateDomainList } from "@/lib/domainData";

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

  it("generateDomainList still builds one checking row per extension", () => {
    const list = generateDomainList("acme");
    expect(list).toHaveLength(TLD_LIST.length);
    expect(list[0]).toMatchObject({ domain: "acme.com", checking: true, available: false });
    expect(list[0].tld).toEqual({ extension: "com" });
  });
});
