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
}

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash % 100) / 100;
}

export function generateResults(query: string): DomainResult[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!q) return [];

  const names = [q, ...VARIATION_PREFIXES.map((p) => p + q)];
  const results: DomainResult[] = [];

  for (const name of names) {
    for (const tld of TLD_LIST) {
      const domain = `${name}.${tld.extension}`;
      const available = seededRandom(domain) > 0.3;
      results.push({ domain, tld, available });
    }
  }

  // Sort: available first, then by reg price
  return results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.tld.regPrice - b.tld.regPrice;
  });
}
