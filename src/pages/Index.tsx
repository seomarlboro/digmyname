import { useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import FilterBar from "@/components/FilterBar";
import HeroBackground from "@/components/HeroBackground";


const Index = () => {
  const [selectedTlds, setSelectedTlds] = useState<Set<string>>(new Set());

  return (
    <div className="relative min-h-screen bg-transparent pb-20">
      <HeroBackground />
      <Helmet>
        <title>Fast Domain Search — World's Fastest Domain Checker | DigMyName</title>
        <meta name="description" content="The world's fastest domain search. Check availability across 50+ TLDs in milliseconds. If you find a faster checker, come dispute it." />
        <link rel="canonical" href="https://digmyname.com/" />
        <meta property="og:title" content="Fast Domain Search — World's Fastest Domain Checker | DigMyName" />
        <meta property="og:description" content="The world's fastest domain search. Check availability across 50+ TLDs in milliseconds." />
        <meta property="og:url" content="https://digmyname.com/" />
        <meta property="og:image" content="https://digmyname.com/og-image.jpg" />
      </Helmet>
      <p style={{ position: 'absolute', left: '-9999px', fontSize: '1px', color: 'transparent' }}>Impact-Site-Verification: 0c5c9ad9-2ca3-4d35-a5d5-71f850a02320</p>
      <Header />
      <main>
        <DomainSearch selectedTlds={selectedTlds} />
        <FilterBar selectedTlds={selectedTlds} onSelectedTldsChange={setSelectedTlds} />
      </main>
    </div>
  );
};

export default Index;

