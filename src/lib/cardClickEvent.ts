/**
 * Analytics properties for a click on a result card (see siteEvents.ts).
 * Derived from the same card facts the card renders, so the event describes
 * what the visitor saw. Takes the row, never emits its name.
 */
import { deriveCardFacts, type CheapestRegistrar } from "./cardFacts";
import type { DomainResult } from "./domainData";
import type { BuyOffer, SiteEventName, SiteEventProps } from "./siteEvents";

export type CardActionKind = "buy" | "aftermarket" | "whois" | "visit";

export const CARD_ACTION_EVENT: Record<CardActionKind, SiteEventName> = {
  buy: "buy_click",
  aftermarket: "aftermarket_click",
  whois: "whois_click",
  visit: "visit_click",
};

type CheapestFor = (r: DomainResult) => CheapestRegistrar | undefined;

/** The first-year price the card shows as a number, or null ("Premium", "Likely premium", "Check price"). */
function shownPrice(r: DomainResult, cheapestFor: CheapestFor): number | null {
  const f = deriveCardFacts(r, cheapestFor(r));
  if (f.isPremium) return f.premiumPrice;
  if (f.isLikelyPremium || f.showCheckPrice) return null;
  return f.trustedPrice;
}

/** Where a card's Buy button goes: the named registrar, or Spaceship's search when no price is known. */
export function buyRegistrar(r: DomainResult, cheapest: CheapestRegistrar | undefined): string {
  return deriveCardFacts(r, cheapest).registrarName ?? "Spaceship";
}

/** The impression side of CTR: every card of the Available section with its Buy destination. No names. */
export function shownOffers(section: DomainResult[], cheapestFor: CheapestFor): SiteEventProps {
  return {
    shownTlds: section.map((r) => r.tld.extension),
    shownRegistrars: section.map((r) => buyRegistrar(r, cheapestFor(r))),
  };
}

export function buyOffer(r: DomainResult, cheapest: CheapestRegistrar | undefined): BuyOffer {
  const f = deriveCardFacts(r, cheapest);
  if (f.isPremium || f.isLikelyPremium) return "premium";
  return f.showCheckPrice ? "check_price" : "available";
}

/**
 * @param section the rendered section the card sits in (available list for Buy,
 *   taken list for Whois / visit / marketplace), in on-screen order.
 */
export function cardClickProps(
  kind: CardActionKind,
  row: DomainResult,
  section: DomainResult[],
  cheapestFor: CheapestFor,
  layout: "cards" | "compact",
): SiteEventProps {
  const index = section.findIndex((r) => r.domain === row.domain);
  const props: SiteEventProps = {
    tld: row.tld.extension,
    position: index >= 0 ? index + 1 : undefined,
    layout,
  };
  if (kind === "buy") {
    const cheapest = cheapestFor(row);
    props.registrar = buyRegistrar(row, cheapest);
    props.offer = buyOffer(row, cheapest);
    const price = shownPrice(row, cheapestFor);
    if (price != null) {
      const prices = section.map((r) => shownPrice(r, cheapestFor)).filter((p): p is number => p != null);
      props.cheapest = price <= Math.min(...prices);
    }
  }
  if (kind === "aftermarket") props.marketplace = row.forSaleVia ?? "other";
  return props;
}
