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
            "Domain availability search verified against two independent signals on every name, with a third brought in whenever they are not enough, registrar price comparison and a free no-auth JSON API. First answer under 0.5 s (p95).",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
          },
          featureList: [
            "Real-time domain availability checks — first answer under 0.5 s (p95)",
            "RDAP + DNS on every name, a third signal when they disagree, honest Unverified state",
            "Registrar price comparison including renewal traps",
            "Optional get-/my-/the-/app-/pro- name variations",
            "Free no-auth JSON API for agents and developers",
          ],
          publisher: { "@type": "Organization", name: "DigMyName", url: "https://digmyname.com/" },
        })}</script>
      </RouteHead>
      <Header />
      <main>
        {/* Impact's site verification lives in the <meta> tag in index.html and
            nowhere else. It used to be duplicated here as an sr-only paragraph,
            which meant a screen reader read a 36-character token aloud as the
            first thing inside <main>, ahead of the search results. */}
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
