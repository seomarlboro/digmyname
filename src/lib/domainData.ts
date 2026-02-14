import { supabase } from "@/integrations/supabase/client";

export interface TLD {
  extension: string;
  regPrice: number;
  renewPrice: number;
  features: string[];
}

export const TLD_LIST: TLD[] = [
  { extension: "com", regPrice: 10.99, renewPrice: 12.99, features: ["Free SSL", "Instant activation", "WHOIS protection"] },
  { extension: "io", regPrice: 32.99, renewPrice: 39.99, features: ["Free SSL", "Instant activation"] },
  { extension: "ai", regPrice: 69.99, renewPrice: 89.99, features: ["Free SSL", "Trending"] },
  { extension: "co", regPrice: 11.99, renewPrice: 25.99, features: ["Free SSL", "Instant activation"] },
  { extension: "net", regPrice: 11.49, renewPrice: 14.99, features: ["Free SSL", "WHOIS protection"] },
  { extension: "org", regPrice: 9.99, renewPrice: 14.99, features: ["Free SSL", "WHOIS protection"] },
  { extension: "app", regPrice: 14.99, renewPrice: 18.99, features: ["Free SSL", "Instant activation"] },
  { extension: "dev", regPrice: 12.99, renewPrice: 15.99, features: ["Free SSL", "Instant activation"] },
  { extension: "xyz", regPrice: 1.99, renewPrice: 12.99, features: ["Free SSL", "Instant activation", "WHOIS protection"] },
  { extension: "tech", regPrice: 6.99, renewPrice: 45.99, features: ["Free SSL", "Trending"] },
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
export function generateDomainList(query: string, withVariations = false): DomainResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!q) return [];

  const names = withVariations
    ? [q, ...VARIATION_PREFIXES.slice(0, 5).map((p) => p + q)]
    : [q];
  const results: DomainResult[] = [];

  for (const name of names) {
    for (const tld of TLD_LIST) {
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
      console.error("Edge function error:", error);
      return resultMap;
    }

    if (data?.results) {
      for (const r of data.results) {
        resultMap.set(r.domain, r.available);
      }
    }
  } catch (err) {
    console.error("Failed to check domains:", err);
  }

  return resultMap;
}

// Keep old function for backwards compat but deprecated
export function generateResults(query: string): DomainResult[] {
  return generateDomainList(query);
}
