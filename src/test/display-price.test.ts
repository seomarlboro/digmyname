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

  it("no trusted DB price → null (Check price), never a fabricated seed price", () => {
    const seed = TLD_LIST.find((t) => t.extension === "com");
    expect(seed?.regPrice).toBeTypeOf("number");
    // The helper must never substitute the static seed price for a missing
    // trusted price — that is exactly the .buy fabricated-price incident.
    expect(resolveDisplayPrice(undefined)).not.toBe(seed?.regPrice);
    expect(resolveDisplayPrice(null)).toBeNull();
  });
});
