import { useCallback, useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import FilterBar from "@/components/FilterBar";
import HeroBackground from "@/components/HeroBackground";


const Index = () => {
  const [selectedTlds, setSelectedTlds] = useState<Set<string>>(new Set());
  const [hasResults, setHasResults] = useState(false);

  const handleHasResultsChange = useCallback((value: boolean) => {
    setHasResults(value);
  }, []);

  return (
    <div className="relative min-h-screen bg-transparent pb-20">
      <HeroBackground />
      <Helmet>
        <title>Fast Domain Search — Fastest We've Measured | DigMyName</title>
        <meta name="description" content="The fastest domain search we've measured. Check availability across 50+ TLDs in milliseconds — if you find a faster checker, come dispute it." />
        <link rel="canonical" href="https://digmyname.com/" />
        <meta property="og:title" content="Fast Domain Search — Fastest We've Measured | DigMyName" />
        <meta property="og:description" content="The fastest domain search we've measured. Check availability in milliseconds — if you find a faster checker, come dispute it." />
        <meta property="og:url" content="https://digmyname.com/" />
        <meta property="og:image" content="https://digmyname.com/og-image.jpg" />
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
            "Four-source verification with an honest Unverified state",
            "Registrar price comparison including renewal traps",
            "AI-powered alternative name suggestions",
            "Free no-auth JSON API for agents and developers",
          ],
          publisher: { "@type": "Organization", name: "DigMyName", url: "https://digmyname.com/" },
        })}</script>
      </Helmet>
      <p style={{ position: 'absolute', left: '-9999px', fontSize: '1px', color: 'transparent' }}>Impact-Site-Verification: 0c5c9ad9-2ca3-4d35-a5d5-71f850a02320</p>
      <Header />
      <main>
        <DomainSearch selectedTlds={selectedTlds} onHasResultsChange={handleHasResultsChange} />
        {hasResults && (
          <FilterBar selectedTlds={selectedTlds} onSelectedTldsChange={setSelectedTlds} />
        )}
      </main>
    </div>
  );
};

export default Index;
