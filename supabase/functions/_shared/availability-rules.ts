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
//   • FREE:    inactive | unregistered                 → available for registration
//     A bare `undelegated` token is NOT free: Fastly returns a best-effort bare
//     `undelegated` when a registry backend times out, which is the same
//     absence-of-evidence as RDAP-404 + NXDOMAIN and must never confirm a sale.
//     A normal registrable answer is `undelegated inactive` → available via `inactive`.
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
const DOMAINR_FREE = new Set(["inactive", "unregistered"]);
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
const BLOCKED_SLDS = new Set<string>([
  // --- Tech / internet -----------------------------------------------------
  "adobe", "airbnb", "alexa", "alibaba", "aliexpress", "amazon", "amd",
  "android", "anthropic", "apple", "arm", "atlassian", "aws", "azure",
  "baidu", "bing", "broadcom", "chatgpt", "chrome", "cisco", "cloudflare",
  "coinbase", "dell", "discord", "dropbox", "ebay", "epicgames", "ericsson",
  "facebook", "figma", "firefox", "github", "gitlab", "gmail", "google",
  "hp", "huawei", "ibm", "icloud", "instagram", "intel", "ipad", "iphone",
  "itunes", "kindle", "linkedin", "linux", "messenger", "meta", "microsoft",
  "mozilla", "netflix", "nintendo", "nokia", "notion", "nvidia", "office",
  "openai", "oracle", "palantir", "paypal", "pinterest", "playstation",
  "qualcomm", "reddit", "salesforce", "samsung", "sap", "shopify", "siemens",
  "skype", "slack", "snapchat", "sony", "spacex", "spotify", "stripe",
  "telegram", "tencent", "tesla", "tiktok", "twitch", "twitter", "uber",
  "vmware", "whatsapp", "windows", "xbox", "xiaomi", "yahoo", "youtube",
  "zoom",
  // --- Finance -------------------------------------------------------------
  "amex", "barclays", "bbva", "blackrock", "citibank", "citigroup",
  "goldmansachs", "hsbc", "jpmorgan", "mastercard", "morganstanley",
  "nasdaq", "santander", "visa", "wellsfargo",
  // --- Retail / consumer ---------------------------------------------------
  "adidas", "burgerking", "coca-cola", "cocacola", "colgate", "costco",
  "danone", "gillette", "heineken", "ikea", "kelloggs", "kfc", "lego",
  "lidl", "loreal", "mcdonalds", "nescafe", "nestle", "nike", "pepsi",
  "pepsico", "puma", "reebok", "starbucks", "subway", "target", "unilever",
  "walmart",
  // --- Luxury --------------------------------------------------------------
  "balenciaga", "bulgari", "burberry", "cartier", "chanel", "dior",
  "fendi", "gucci", "hermes", "louisvuitton", "omega", "prada", "rolex",
  "tiffany", "versace",
  // --- Automotive ----------------------------------------------------------
  "audi", "bentley", "bmw", "bugatti", "chevrolet", "ferrari", "ford",
  "honda", "hyundai", "jaguar", "kia", "lamborghini", "landrover", "lexus",
  "maserati", "mazda", "mercedes", "mercedesbenz", "nissan", "peugeot",
  "porsche", "renault", "subaru", "toyota", "volkswagen", "volvo",
  // --- Media / entertainment ----------------------------------------------
  "cnn", "disney", "espn", "hbo", "hulu", "marvel", "nbc",
  "netflixoriginals", "pixar", "spotifypremium", "warnerbros",
  // --- Pharma / health -----------------------------------------------------
  "astrazeneca", "bayer", "gsk", "johnsonandjohnson", "merck", "moderna",
  "novartis", "pfizer", "roche", "sanofi",
  // --- Logistics / travel --------------------------------------------------
  "aramex", "dhl", "emirates", "fedex", "lufthansa", "maersk", "ups", "usps",
  // --- Energy / industrial -------------------------------------------------
  "boeing", "bosch", "chevron", "exxonmobil", "ge", "shell", "siemensenergy",
  "totalenergies",
  // --- Registry / ICANN reserved labels ------------------------------------
  // Registry-operations labels (ICANN base RA Specification 5, "Reservations
  // for Registry Operations").
  "iana", "icann", "internic", "nic", "rdds", "whois", "www",
  // The "ICANN and IANA Related Names" group (afrinic, apnic, arin, ripe, nro,
  // iab, ietf, ...) was added here on 2026-08-12 on the premise that registries
  // never release those labels. That premise is FALSE and was retired on
  // 2026-08-15: queried against the .xyz registry's own RDAP, 14 of the 24
  // labels answer 200 — apnic, arin, aso, gac, gnso, gtld-servers, iab, iesg,
  // irtf, istf, nro, ripe, root-servers and ssac are registered by ordinary
  // registrants, and Porkbun prices the rest. Blocking them hid TAKEN names
  // behind "Unverified" and refused sales on registerable ones, while the two
  // request paths disagreed on which it was. They now go through the normal
  // three-signal pipeline like any other name.
  //
  // What stays above is the group registries genuinely never hand out:
  // registry-operations labels (Specification 5 §"Reservations for Registry
  // Operations") plus the DPML brand set.
]);

export function isLikelyBlocked(domain: string): boolean {
  const sld = domain.split(".")[0]?.toLowerCase() ?? "";
  return BLOCKED_SLDS.has(sld);
}

/** Whether a result needs the (paid, metered) third signal before we trust it.
 *  Escalate ONLY where it is load-bearing:
 *    • uncertain — no authoritative verdict yet: .co/.me (no reliable public RDAP)
 *      and RDAP-vs-DNS conflicts. These cannot be confirmed any other way.
 *    • available & likely-premium — a short / premium-suspect SLD whose "free"
 *      RDAP-404 could actually be a registry-reserved or premium tier.
 *  A normal-length available name confirmed by RDAP-404 + DNS-NXDOMAIN is
 *  authoritatively registerable on gTLDs, so it no longer burns a third-signal
 *  call. (Brand-blocked available names are escalated separately by the caller
 *  via isLikelyBlocked, so the trademark safeguard is unaffected.)
 *  Pass likelyPremium precomputed. */
export function shouldEscalateToDomainr(r: {
  available: boolean; uncertain?: boolean; checkedVia: string; likelyPremium?: boolean;
}): boolean {
  return r.uncertain === true || (r.available && r.likelyPremium === true);
}
