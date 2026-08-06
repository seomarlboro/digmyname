import { supabase } from "@/integrations/supabase/client";

export interface TLD {
  extension: string;
  regPrice: number;
  renewPrice: number;
  features: string[];
}

export const TLD_LIST: TLD[] = [
  // Classic
  { extension: "com", regPrice: 10.99, renewPrice: 12.99, features: ["Free SSL", "Instant activation", "WHOIS protection"] },
  { extension: "net", regPrice: 11.49, renewPrice: 14.99, features: ["Free SSL", "WHOIS protection"] },
  { extension: "org", regPrice: 9.99, renewPrice: 14.99, features: ["Free SSL", "WHOIS protection"] },
  { extension: "info", regPrice: 3.99, renewPrice: 18.99, features: ["Free SSL", "WHOIS protection"] },
  { extension: "biz", regPrice: 4.99, renewPrice: 18.99, features: ["Free SSL"] },
  // Tech
  { extension: "io", regPrice: 32.99, renewPrice: 39.99, features: ["Free SSL", "Instant activation"] },
  { extension: "ai", regPrice: 69.99, renewPrice: 89.99, features: ["Free SSL", "Trending"] },
  { extension: "app", regPrice: 14.99, renewPrice: 18.99, features: ["Free SSL", "Instant activation"] },
  { extension: "dev", regPrice: 12.99, renewPrice: 15.99, features: ["Free SSL", "Instant activation"] },
  { extension: "tech", regPrice: 6.99, renewPrice: 45.99, features: ["Free SSL", "Trending"] },
  { extension: "digital", regPrice: 3.99, renewPrice: 35.99, features: ["Free SSL"] },
  { extension: "cloud", regPrice: 8.99, renewPrice: 24.99, features: ["Free SSL", "Trending"] },
  { extension: "software", regPrice: 24.99, renewPrice: 32.99, features: ["Free SSL"] },
  { extension: "systems", regPrice: 19.99, renewPrice: 24.99, features: ["Free SSL"] },
  // Startup / Business
  { extension: "co", regPrice: 11.99, renewPrice: 25.99, features: ["Free SSL", "Instant activation"] },
  { extension: "agency", regPrice: 6.99, renewPrice: 24.99, features: ["Free SSL"] },
  { extension: "company", regPrice: 8.99, renewPrice: 14.99, features: ["Free SSL"] },
  { extension: "ventures", regPrice: 39.99, renewPrice: 49.99, features: ["Free SSL"] },
  { extension: "capital", regPrice: 39.99, renewPrice: 49.99, features: ["Free SSL"] },
  { extension: "inc", regPrice: 2499.99, renewPrice: 2499.99, features: ["Free SSL", "Premium"] },
  // Creative
  { extension: "design", regPrice: 29.99, renewPrice: 39.99, features: ["Free SSL"] },
  { extension: "studio", regPrice: 24.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "art", regPrice: 12.99, renewPrice: 14.99, features: ["Free SSL"] },
  { extension: "media", regPrice: 14.99, renewPrice: 34.99, features: ["Free SSL"] },
  // Short / Brandable
  { extension: "xyz", regPrice: 1.99, renewPrice: 12.99, features: ["Free SSL", "Instant activation", "WHOIS protection"] },
  { extension: "me", regPrice: 5.99, renewPrice: 19.99, features: ["Free SSL", "Instant activation"] },
  { extension: "cc", regPrice: 9.99, renewPrice: 12.99, features: ["Free SSL"] },
  { extension: "tv", regPrice: 29.99, renewPrice: 34.99, features: ["Free SSL"] },
  { extension: "gg", regPrice: 49.99, renewPrice: 49.99, features: ["Free SSL", "Trending"] },
  { extension: "so", regPrice: 29.99, renewPrice: 69.99, features: ["Free SSL"] },
  // E-commerce
  { extension: "shop", regPrice: 2.99, renewPrice: 34.99, features: ["Free SSL", "Trending"] },
  { extension: "store", regPrice: 3.99, renewPrice: 49.99, features: ["Free SSL"] },
  { extension: "market", regPrice: 29.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "buy", regPrice: 29.99, renewPrice: 29.99, features: ["Free SSL"] },
  // Community / Social
  { extension: "community", regPrice: 24.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "social", regPrice: 24.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "club", regPrice: 3.99, renewPrice: 14.99, features: ["Free SSL"] },
  { extension: "group", regPrice: 14.99, renewPrice: 14.99, features: ["Free SSL"] },
  // Finance
  { extension: "finance", regPrice: 39.99, renewPrice: 49.99, features: ["Free SSL"] },
  { extension: "money", regPrice: 24.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "fund", regPrice: 39.99, renewPrice: 49.99, features: ["Free SSL"] },
  // Other popular
  { extension: "life", regPrice: 2.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "world", regPrice: 2.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "site", regPrice: 2.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "online", regPrice: 2.99, renewPrice: 34.99, features: ["Free SSL"] },
  { extension: "space", regPrice: 1.99, renewPrice: 19.99, features: ["Free SSL"] },
  { extension: "pro", regPrice: 3.99, renewPrice: 18.99, features: ["Free SSL"] },
  { extension: "one", regPrice: 8.99, renewPrice: 12.99, features: ["Free SSL", "Trending"] },
  { extension: "wtf", regPrice: 2.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "lol", regPrice: 24.99, renewPrice: 29.99, features: ["Free SSL"] },
];

export const VARIATION_PREFIXES = ["get", "my", "the", "app", "pro", "hub", "lab", "try", "go", "use"];

export interface DomainResult {
  domain: string;
  tld: TLD;
  available: boolean;
  checking?: boolean;
  /** GoDaddy real price in dollars, if available */
  gdPrice?: number;
  /** Confirmed premium / aftermarket via GoDaddy pricing */
  premium?: boolean;
  /** Heuristic: likely registered or aftermarket even if APIs say otherwise */
  likelyPremium?: boolean;
  /** APIs disagreed or failed — treat with caution */
  uncertain?: boolean;
  /** Deterministic cause of uncertainty (brand/trademark protected), not a probe failure. */
  uncertainReason?: "brand_protected";
  /** Label only: SLD matches a known trademark/registry-reserved brand. Set on
   *  every card in a brand class (available/taken/uncertain) so the UI can tag
   *  them consistently. Never affects the verdict shown. */
  sldBlocked?: boolean;
  /** Registered but parked on a marketplace (Sedo, Dan, Afternic, …). */
  forSale?: boolean;
  forSaleVia?: string;
  listingUrl?: string;
}

const tldMap = new Map(TLD_LIST.map((t) => [t.extension, t]));

/** Generate domain list with placeholder availability (all unknown/checking) */
export function generateDomainList(query: string, withVariations = false, allowedTlds?: Set<string>): DomainResult[] {
  if (!query.trim()) return [];
  const raw = query.toLowerCase().trim();

  // Detect if user typed a full domain like "jitr.com" — extract SLD + TLD.
  let baseName = raw.replace(/[^a-z0-9.-]/g, "");
  let typedTld: TLD | null = null;
  if (baseName.includes(".")) {
    const parts = baseName.split(".").filter(Boolean);
    if (parts.length >= 2) {
      const maybeTld = parts.slice(1).join(".");
      const match = tldMap.get(maybeTld);
      if (match) {
        baseName = parts[0];
        typedTld = match;
      } else {
        baseName = parts[0];
      }
    } else {
      baseName = parts[0] ?? "";
    }
  }
  const q = baseName.replace(/[^a-z0-9-]/g, "");
  if (!q) return [];

  const names = withVariations
    ? [q, ...VARIATION_PREFIXES.slice(0, 5).map((p) => p + q)]
    : [q];
  const results: DomainResult[] = [];

  const baseTlds = allowedTlds && allowedTlds.size > 0
    ? TLD_LIST.filter((t) => allowedTlds.has(t.extension))
    : TLD_LIST;

  // If user typed a specific TLD, make sure it's included and listed first.
  const tlds = typedTld
    ? [typedTld, ...baseTlds.filter((t) => t.extension !== typedTld!.extension)]
    : baseTlds;

  for (const name of names) {
    for (const tld of tlds) {
      results.push({
        domain: `${name}.${tld.extension}`,
        tld,
        available: false,
        checking: true,
      });
    }
  }

  return results;
}

/** Fast DNS-only pre-check via public API. Returns in ~30-80ms so cards can
 *  flip to a preliminary state before the authoritative RDAP/pricing check. */
export async function checkDomainsFast(
  domains: string[]
): Promise<Map<string, { available: boolean; uncertain: boolean }>> {
  const resultMap = new Map<string, { available: boolean; uncertain: boolean }>();
  if (!domains.length) return resultMap;

  try {
    const base = import.meta.env.VITE_SUPABASE_URL ?? "";
    if (!base) return resultMap;
    const url = `${base.replace(/\/$/, "")}/functions/v1/public-api/fast?domains=${encodeURIComponent(domains.join(","))}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return resultMap;
    const data = await res.json();
    for (const r of data.results ?? []) {
      resultMap.set(r.domain, { available: !!r.available, uncertain: !!r.uncertain });
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error("Fast check failed:", err);
  }

  return resultMap;
}

/** Check real availability via edge function */
export async function checkDomainsAvailability(
  domains: string[]
): Promise<Map<string, { available: boolean; price?: number; premium?: boolean; likelyPremium?: boolean; uncertain?: boolean; uncertainReason?: "brand_protected"; forSale?: boolean; forSaleVia?: string; listingUrl?: string }>> {
  const resultMap = new Map<string, { available: boolean; price?: number; premium?: boolean; likelyPremium?: boolean; uncertain?: boolean; uncertainReason?: "brand_protected"; forSale?: boolean; forSaleVia?: string; listingUrl?: string }>();

  try {
    const { data, error } = await supabase.functions.invoke("check-domains", {
      body: { domains },
    });

    if (error) {
      if (import.meta.env.DEV) console.error("Edge function error:", error);
      return resultMap;
    }

    if (data?.results) {
      for (const r of data.results) {
        resultMap.set(r.domain, {
          available: r.available,
          price: r.price,
          premium: r.premium,
          likelyPremium: r.likelyPremium,
          uncertain: r.uncertain,
          uncertainReason: r.uncertainReason,
          forSale: r.forSale,
          forSaleVia: r.forSaleVia,
          listingUrl: r.listingUrl,
        });
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error("Failed to check domains:", err);
  }

  return resultMap;
}

// Keep old function for backwards compat but deprecated
export function generateResults(query: string): DomainResult[] {
  return generateDomainList(query);
}
