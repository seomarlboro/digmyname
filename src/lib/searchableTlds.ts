/**
 * The extensions DigMyName actually searches, in authority order.
 *
 * Node-safe and dependency-free on purpose: domainData.ts (browser only, pulls
 * in the Supabase client) builds TLD_LIST from it, and the build-time price
 * pages import it to tell "we sell a price page for this" apart from "we can
 * answer whether a name here is free". Those drifted: /tld/gg and /tld/so were
 * indexable pages describing how availability is checked for two extensions
 * the search had dropped precisely because it cannot be.
 *
 * Order is meaningful — TLD_RANK is the index, and it sorts every result list.
 */
export const SEARCHABLE_TLDS: string[] = [
  // Classic
  "com",
  "net",
  "org",
  "info",
  "biz",
  // Tech
  "io",
  "ai",
  "app",
  "dev",
  "tech",
  "digital",
  "cloud",
  "software",
  "systems",
  "build",
  "run",
  "page",
  "link",
  "tools",
  // Startup / Business
  "co",
  "agency",
  "company",
  "ventures",
  "capital",
  "inc",
  // Creative
  "design",
  "studio",
  "art",
  "media",
  // Short / Brandable
  "xyz",
  "me",
  "cc",
  "tv",
  // .gg and .so were removed 2026-08-15 — neither zone has an RDAP server (both
  // absent from the IANA bootstrap), so availability there rests on DNS plus a
  // 404 from an aggregator that cannot route the zone. That combination sold
  // registered names (`gaming.gg`, registered 2020, was shown available $51.80).
  // Re-add them only together with a paid third signal, if the demand appears.
  // E-commerce
  "shop",
  "store",
  "market",
  "buy",
  // Community / Social
  "community",
  "social",
  "club",
  "group",
  // Finance
  "finance",
  "money",
  "fund",
  // Other popular
  "life",
  "world",
  "site",
  "online",
  "space",
  "pro",
  "one",
  "wtf",
  "lol",
];

const SEARCHABLE = new Set(SEARCHABLE_TLDS);

/** True when a search on this site can actually answer "is this name free?". */
export const isSearchableTld = (tld: string): boolean => SEARCHABLE.has(tld.toLowerCase());
