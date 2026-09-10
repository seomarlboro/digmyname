import { describe, it, expect } from "vitest";
import { resolveDisplayPrice, TLD_LIST } from "@/lib/domainData";

describe("resolveDisplayPrice", () => {
  it("returns a trusted DB price as-is", () => {
    expect(resolveDisplayPrice(12.99)).toBe(12.99);
  });

  it("returns null for a null DB price", () => {
    expect(resolveDisplayPrice(null)).toBeNull();
  });

  it("returns null for a missing DB price", () => {
    expect(resolveDisplayPrice(undefined)).toBeNull();
  });

  it("no trusted DB price → null (Check price); there is no seed price left to fall back to", () => {
    // The static TLD list used to carry a seed regPrice that once fabricated a
    // $ figure for an unpriced (registrar, tld) pair — the .buy incident — and
    // later contradicted /pricing in the TLD picker. It is gone for good.
    const seed = TLD_LIST.find((t) => t.extension === "com") as unknown as Record<string, unknown>;
    expect(seed).toBeDefined();
    expect("regPrice" in seed).toBe(false);
    expect(resolveDisplayPrice(undefined)).toBeNull();
    expect(resolveDisplayPrice(null)).toBeNull();
  });
});
