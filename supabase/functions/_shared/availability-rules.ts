// ============================================================================
// PURE AVAILABILITY RULES
//
// No Deno globals, no remote imports — unit-testable by the app's test runner.
// ============================================================================

export interface DomainrStatusEntry {
  domain: string;
  zone?: string;
  status: string;
  summary?: string;
}

// Domainr status tokens are a SET ordered by increasing precedence. The docs say
// the right-most token is the most important, but in practice the tokens fall into
// three buckets:
//   • FREE:    inactive | undelegated | unregistered  → available for registration
//   • PREMIUM: premium                                  → available, registry-premium price
//   • TAKEN:   active | parked | claimed | reserved | dpml | pending | disallowed |
//              invalid | suffix | tld | zone | deleting | expiring
//   • AFTERMARKET: marketed | priced | transferable    → taken, listed for resale
export type DomainrVerdict =
  | { kind: "available"; premium: boolean }
  | { kind: "taken"; forSale: boolean }
  | { kind: "unknown" };

const DOMAINR_TAKEN = new Set([
  "active", "parked", "claimed", "dpml", "deleting", "pending", "expiring",
  "reserved", "disallowed", "invalid", "suffix", "tld", "zone",
]);
const DOMAINR_FREE = new Set(["undelegated", "inactive", "unregistered"]);
const DOMAINR_PREMIUM = new Set(["premium"]);
const DOMAINR_AFTERMARKET = new Set(["marketed", "priced", "transferable"]);

export function interpretDomainr(entry: DomainrStatusEntry | undefined): DomainrVerdict {
  if (!entry?.status) return { kind: "unknown" };
  const tokens = entry.status.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "unknown" };

  const taken = tokens.some((t) => DOMAINR_TAKEN.has(t));
  const free = tokens.some((t) => DOMAINR_FREE.has(t));
  const premium = tokens.some((t) => DOMAINR_PREMIUM.has(t));
  const aftermarket = tokens.some((t) => DOMAINR_AFTERMARKET.has(t));

  // Aftermarket tokens (marketed/priced/transferable) mean the domain is already
  // registered and listed for sale — they take precedence over free/inactive.
  if (taken || aftermarket) return { kind: "taken", forSale: aftermarket };
  if (free) return { kind: "available", premium };
  return { kind: "unknown" };
}

/** Registry-reserved labels + famous DPML-protected brand SLDs. Exact lowercase
 *  SLD match only (no substring matching — "googleplex.com" must NOT match).
 *  False positives here cost us an honest "Unverified" on a name we could have
 *  sold; false negatives sell an unregisterable name. Curated, not exhaustive. */
const BLOCKED_SLDS = new Set([
  // ICANN / registry-reserved labels
  "nic", "whois", "www", "rdds", "internic", "icann", "iana",
  // DPML-tier brands
  "google", "youtube", "gmail", "android", "chrome",
  "microsoft", "windows", "xbox", "office", "skype", "bing",
  "apple", "iphone", "ipad", "icloud", "itunes",
  "amazon", "aws", "kindle", "alexa",
  "facebook", "meta", "instagram", "whatsapp", "messenger",
  "netflix", "disney", "tesla", "nike", "adidas",
  "samsung", "sony", "playstation", "nintendo",
  "oracle", "intel", "nvidia", "cisco", "ibm", "adobe",
  "paypal", "visa", "mastercard", "amex",
  "twitter", "tiktok", "spotify", "uber", "airbnb",
  "salesforce", "walmart", "cocacola", "coca-cola",
  "mcdonalds", "starbucks", "lego", "rolex", "gucci", "chanel",
  "ferrari", "bmw", "toyota", "mercedes", "porsche", "audi",
]);

export function isLikelyBlocked(domain: string): boolean {
  const sld = domain.split(".")[0]?.toLowerCase() ?? "";
  return BLOCKED_SLDS.has(sld);
}

/** A result must be confirmed by Domainr before we sell it when its
 *  "available" verdict rests only on absence of evidence (RDAP 404 + DNS
 *  NXDOMAIN) — that fingerprint is shared by registry-reserved / DPML-blocked
 *  names. Pass likelyPremium precomputed. */
export function shouldEscalateToDomainr(r: {
  available: boolean; uncertain?: boolean; checkedVia: string; likelyPremium?: boolean;
}): boolean {
  return r.uncertain === true ||
    (r.available && (r.likelyPremium === true || r.checkedVia === "rdap" || r.checkedVia === "dns"));
}
