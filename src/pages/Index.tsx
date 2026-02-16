import { useState } from "react";
import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import FilterBar from "@/components/FilterBar";

const Index = () => {
  const [selectedTlds, setSelectedTlds] = useState<Set<string>>(new Set());

  return (
    <div className="min-h-screen bg-background pb-20">
      <p style={{ position: 'absolute', left: '-9999px', fontSize: '1px', color: 'transparent' }}>Impact-Site-Verification: 0c5c9ad9-2ca3-4d35-a5d5-71f850a02320</p>
      <Header />
      <DomainSearch selectedTlds={selectedTlds} />
      <FilterBar selectedTlds={selectedTlds} onSelectedTldsChange={setSelectedTlds} />
    </div>
  );
};

export default Index;
