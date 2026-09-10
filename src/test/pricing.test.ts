import { describe, it, expect } from "vitest";
import {
  bestThreeYear,
  cheapestRegister,
  cheapestRenew,
  cheapestTransfer,
  formatUpdated,
  isStale,
  splitByComparison,
  summarize,
  threeYearCost,
  type RegistrarPrice,
} from "@/lib/pricing";

const price = (tld: string, registrar: string, reg: number, renew: number, transfer: number | null = null, extra: Partial<RegistrarPrice> = {}): RegistrarPrice => ({
  id: `${tld}-${registrar}`,
  tld,
  registrar,
  reg_price: reg,
  renew_price: renew,
  transfer_price: transfer,
  icann_fee: 0.18,
  promo_code: null,
  whois_privacy: true,
  updated_at: "2026-09-06T00:00:00Z",
  ...extra,
});

const com = [
  price("com", "GoDaddy", 5.19, 23.19, 13.19),
  price("com", "Spaceship", 9.08, 10.18, 9.68, { promo_code: "COM67" }),
  price("com", "OVHcloud", 9.2, 14.69, 9.2),
];

describe("winners per action", () => {
  it("each column names its own registrar", () => {
    expect(cheapestRegister(com)).toEqual({ registrar: "GoDaddy", price: 5.19, promo: null });
    expect(cheapestRenew(com)).toEqual({ registrar: "Spaceship", price: 10.18, promo: null });
    expect(cheapestTransfer(com)).toEqual({ registrar: "OVHcloud", price: 9.2, promo: null });
  });

  it("3-year value is registration plus two renewals, promo carried along", () => {
    expect(threeYearCost(com[1])).toBeCloseTo(29.44);
    expect(bestThreeYear(com)).toEqual({ registrar: "Spaceship", price: expect.closeTo(29.44, 2), promo: "COM67" });
  });

  it("transfer is null when nobody publishes one", () => {
    expect(cheapestTransfer([price("gg", "Porkbun", 51.8, 51.8, null)])).toBeNull();
  });
});

describe("summaries", () => {
  it("groups by TLD, popular first, and flags enterprise pricing", () => {
    const s = summarize([...com, price("inc", "Porkbun", 2499, 2499), price("agency", "Porkbun", 3.6, 25.23)]);
    expect(s.map((x) => x.tld)).toEqual(["com", "inc", "agency"]);
    expect(s.find((x) => x.tld === "inc")?.isEnterprise).toBe(true);
    expect(s.find((x) => x.tld === "com")?.isEnterprise).toBe(false);
  });

  it("a single registrar is not a comparison", () => {
    const s = summarize([...com, price("agency", "Porkbun", 3.6, 25.23), price("art", "Porkbun", 3.6, 21.11)]);
    const { compared, single } = splitByComparison(s);
    expect(compared.map((x) => x.tld)).toEqual(["com"]);
    expect(single.map((x) => x.tld)).toEqual(["agency", "art"]);
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");
  it("is stale after 14 days", () => {
    expect(isStale("2026-09-06T00:00:00Z", now)).toBe(false);
    expect(isStale("2026-08-20T00:00:00Z", now)).toBe(true);
    expect(isStale(undefined, now)).toBe(false);
  });
  it("formats relative age", () => {
    expect(formatUpdated("2026-09-10T11:59:40Z", now)).toBe("just now");
    expect(formatUpdated("2026-09-10T11:30:00Z", now)).toBe("30 min ago");
    expect(formatUpdated("2026-09-10T02:00:00Z", now)).toBe("10 h ago");
    expect(formatUpdated("2026-09-06T12:00:00Z", now)).toBe("4 d ago");
  });
});
