import { useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import FilterBar from "@/components/FilterBar";

const Index = () => {
  const [selectedTlds, setSelectedTlds] = useState<Set<string>>(new Set());

  return (
    <div className="min-h-screen bg-background pb-20">
      <Helmet>
        <title>DigMyName — Find Your Perfect Domain</title>
        <meta name="description" content="Smart domain search across 50+ TLDs with instant availability checks and AI-powered name suggestions." />
        <link rel="canonical" href="https://digmyname.com/" />
        <meta property="og:title" content="DigMyName — Find Your Perfect Domain" />
        <meta property="og:description" content="Smart domain search across 50+ TLDs with instant availability checks." />
        <meta property="og:url" content="https://digmyname.com/" />
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
