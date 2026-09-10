import { lazy, Suspense, useMemo, useState } from "react";
import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import HeroBackground from "@/components/HeroBackground";
import RouteHead from "@/seo/RouteHead";
import { useCheapestRegistrars } from "@/hooks/useCheapestRegistrars";
import { DEFAULT_FILTERS, type ResultFilters } from "@/lib/resultFilters";

// The filter bar carries the Drawer/Slider/Checkbox primitives; nobody needs
// them before the page has painted, so it loads after the search does.
const FilterBar = lazy(() => import("@/components/FilterBar"));

const Index = () => {
  const [selectedTlds, setSelectedTlds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ResultFilters>(DEFAULT_FILTERS);
  const cheapestByTld = useCheapestRegistrars();

  // Live first-year price per TLD for the extension picker — the same table
  // the result cards and /pricing read, so the three can never disagree.
  const priceByTld = useMemo(() => {
    const map = new Map<string, number>();
    for (const [tld, cheapest] of cheapestByTld) map.set(tld, cheapest.regPrice);
    return map;
  }, [cheapestByTld]);

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <HeroBackground />
      <RouteHead path="/">
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "DigMyName",
          url: "https://digmyname.com/",
          applicationCategory: ["UtilitiesApplication", "DeveloperApplication"],
          operatingSystem: "Any (web-based)",
          browserRequirements: "Requires JavaScript and a modern browser",
          description:
            "Domain availability search verified against three independent signals, with registrar price comparison and a free no-auth JSON API. First answer in ~170 ms.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
          },
          featureList: [
            "Real-time domain availability checks with ~170 ms first answer",
            "Three-signal verification with an honest Unverified state",
            "Registrar price comparison including renewal traps",
            "AI-powered alternative name suggestions",
            "Free no-auth JSON API for agents and developers",
          ],
          publisher: { "@type": "Organization", name: "DigMyName", url: "https://digmyname.com/" },
        })}</script>
      </RouteHead>
      <Header />
      <main>
        {/* Impact affiliate-network site verification; kept inside <main> so it sits in a landmark. */}
        <p className="sr-only">Impact-Site-Verification: 0c5c9ad9-2ca3-4d35-a5d5-71f850a02320</p>
        <DomainSearch selectedTlds={selectedTlds} filters={filters} onResetFilters={() => setFilters(DEFAULT_FILTERS)} />
        <Suspense fallback={null}>
          <FilterBar
            selectedTlds={selectedTlds}
            onSelectedTldsChange={setSelectedTlds}
            filters={filters}
            onFiltersChange={setFilters}
            priceByTld={priceByTld}
          />
        </Suspense>
      </main>
    </div>
  );
};

export default Index;
