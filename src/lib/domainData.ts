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
  { extension: "code", regPrice: 29.99, renewPrice: 29.99, features: ["Free SSL"] },
  { extension: "software", regPrice: 24.99, renewPrice: 32.99, features: ["Free SSL"] },
  { extension: "systems", regPrice: 19.99, renewPrice: 24.99, features: ["Free SSL"] },
  // Startup / Business
  { extension: "co", regPrice: 11.99, renewPrice: 25.99, features: ["Free SSL", "Instant activation"] },
  { extension: "startup", regPrice: 39.99, renewPrice: 39.99, features: ["Free SSL", "Trending"] },
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
}

const tldMap = new Map(TLD_LIST.map((t) => [t.extension, t]));

/** Generate domain list with placeholder availability (all unknown/checking) */
export function generateDomainList(query: string, withVariations = false, allowedTlds?: Set<string>): DomainResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!q) return [];

  const names = withVariations
    ? [q, ...VARIATION_PREFIXES.slice(0, 5).map((p) => p + q)]
    : [q];
  const results: DomainResult[] = [];

  const tlds = allowedTlds && allowedTlds.size > 0
    ? TLD_LIST.filter((t) => allowedTlds.has(t.extension))
    : TLD_LIST;

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

/** Check real availability via edge function */
export async function checkDomainsAvailability(
  domains: string[]
): Promise<Map<string, boolean>> {
  const resultMap = new Map<string, boolean>();

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
        resultMap.set(r.domain, r.available);
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
