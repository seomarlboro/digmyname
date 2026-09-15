import { describe, it, expect } from "vitest";

/**
 * Buy links carry no affiliate tag (src/lib/registrarColors.ts builds plain
 * registrar URLs; registrar_prices.affiliate_url is empty). Until that changes,
 * no public surface may claim a commission. When affiliate links arrive, update
 * every surface listed in docs/DIGMYNAME_ARCHITECTURE.md §6 and then this test.
 */
const surfaces = import.meta.glob(
  [
    "/src/**/*.{ts,tsx}",
    "!/src/test/public-claims.test.ts",
    "/public/*.{txt,xml}",
    "/public/.well-known/*.json",
    "/index.html",
    "/README.md",
    "/mcp/README.md",
    "/mcp/package.json",
    "/mcp/server.json",
    "/mcp/llms-install.md",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

describe("public claims", () => {
  it("scans the surfaces it is meant to guard", () => {
    const files = Object.keys(surfaces);
    for (const f of ["/src/pages/Terms.tsx", "/src/components/Footer.tsx", "/src/pages/HowItWorks.tsx", "/src/components/DomainSearch.tsx", "/src/seo/routes.ts", "/public/llms.txt", "/public/llms-full.txt", "/public/.well-known/ai-plugin.json"]) {
      expect(files).toContain(f);
    }
  });

  it("no surface claims a commission or affiliate-tracked links", () => {
    const offenders = Object.entries(surfaces)
      .filter(([, text]) => /commission|affiliate[- ]tracked|may earn|affiliate tag that/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
