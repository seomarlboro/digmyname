import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { CheapestRegistrar } from "@/lib/cardFacts";
import type { DomainResult } from "@/lib/domainData";

const invoke = vi.fn(async (..._args: unknown[]) => ({ data: { results: {} }, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const storeRow: CheapestRegistrar = { registrar: "Namecheap", regPrice: 0.98, renewPrice: 44.48, affiliateUrl: null, promoCode: null, whoisPrivacy: false };
const row = (extra: Partial<DomainResult>): DomainResult =>
  ({ domain: "garden.tech", tld: { extension: "tech" }, available: false, checking: false, ...extra }) as DomainResult;

async function card(result: DomainResult, compact: boolean, cheapest?: CheapestRegistrar) {
  const { default: DomainCard } = await import("@/components/DomainCard");
  return render(<DomainCard result={result} compact={compact} cheapest={cheapest} favorited={false} onToggleFavorite={() => {}} />);
}

/**
 * Two states added 2026-11-21. Both layouts (full card, compact row) are checked:
 * they share the facts but not the markup.
 */
describe("DomainCard: a name the registry reserves", () => {
  afterEach(() => { cleanup(); invoke.mockClear(); });

  for (const compact of [false, true]) {
    it(`${compact ? "compact row" : "card"}: says "Reserved by the registry", not "Registered", and offers no lookup of a registration that does not exist`, async () => {
      const { container } = await card(row({ reserved: true }), compact);
      expect(container.textContent).toContain("Reserved by the registry");
      expect(container.textContent).not.toContain("Registered");
      expect(container.querySelector('a[href*="whois.com"]')).toBeNull();
      expect(container.querySelector('a[href="https://garden.tech"]')).toBeNull();
      // No registration year is asked for either.
      expect(invoke).not.toHaveBeenCalled();
    });

    it(`${compact ? "compact row" : "card"}: an ordinary taken name is unchanged`, async () => {
      const { container } = await card(row({ domain: "google.tech" }), compact);
      expect(container.textContent).toContain("Registered");
      expect(container.textContent).not.toContain("Reserved");
      expect(container.querySelector('a[href*="whois.com/whois/google.tech"]')).not.toBeNull();
    });
  }
});

describe("DomainCard: a price no registrar has confirmed for this name", () => {
  afterEach(() => { cleanup(); invoke.mockClear(); });
  const waiting = (extra: Partial<DomainResult> = {}) =>
    row({ domain: "online.store", tld: { extension: "store" }, available: true, priceUnverified: true, ...extra });

  for (const compact of [false, true]) {
    const where = compact ? "compact row" : "card";

    it(`${where}: while the quote is on its way — "Checking price…", and no $ figure`, async () => {
      const { container } = await card(waiting({ pricePending: true }), compact, storeRow);
      expect(container.textContent).toContain("Checking price…");
      expect(container.textContent).not.toContain("$");
      expect(container.textContent).not.toContain("Premium");
    });

    it(`${where}: when no quote came — "Check price", still no $ figure and no premium mark`, async () => {
      const { container } = await card(waiting(), compact, storeRow);
      expect(container.textContent).toContain("Check price");
      expect(container.textContent).not.toContain("$");
      expect(container.textContent).not.toContain("Premium");
      expect(container.textContent).not.toContain("Namecheap");
    });

    it(`${where}: quoted as standard — the extension's price is shown again`, async () => {
      const { container } = await card(waiting({ priceUnverified: false }), compact, storeRow);
      expect(container.textContent).toContain("$0.98");
      expect(container.textContent).not.toContain("Check price");
    });

    it(`${where}: quoted as premium — the registrar's figure, never the standard one`, async () => {
      const { container } = await card(waiting({ priceUnverified: false, premium: true, gdPrice: 6823.39, premiumRenewPrice: 27291.98 }), compact, storeRow);
      expect(container.textContent).toContain("$6823.39");
      expect(container.textContent).not.toContain("$0.98");
    });
  }
});

// The registrar prices names; it never decides availability. When it refuses a
// name the registry lists as free, the card must not say "Registered".
describe("DomainCard: a name the registry lists as free but a registrar will not sell", () => {
  afterEach(() => { cleanup(); invoke.mockClear(); });
  const refused = row({ domain: "coffee.xyz", tld: { extension: "xyz" }, available: false, uncertain: true, uncertainReason: "not_sold_at_registrar" });

  it("card: says what the two sources said — never 'Registered', never a price — and offers no Retry", async () => {
    const { container } = await card(refused, false, storeRow);
    expect(container.textContent).toContain("the registry lists no owner, but a registrar won't sell it");
    expect(container.textContent).not.toContain("Registered");
    expect(container.textContent).not.toContain("$");
    expect([...container.querySelectorAll("button")].some((b) => /retry/i.test(b.textContent ?? "") || /retry/i.test(b.getAttribute("aria-label") ?? ""))).toBe(false);
  });

  it("compact row: the same state in its short form", async () => {
    const { container } = await card(refused, true, storeRow);
    expect(container.textContent).toContain("Not sold at registrars");
    expect(container.textContent).not.toContain("Registered");
    expect(container.textContent).not.toContain("$");
  });
});

