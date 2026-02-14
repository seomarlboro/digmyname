import { useState } from "react";
import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import FilterBar from "@/components/FilterBar";

const Index = () => {
  const [selectedTlds, setSelectedTlds] = useState<Set<string>>(new Set());

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <DomainSearch selectedTlds={selectedTlds} />
      <FilterBar selectedTlds={selectedTlds} onSelectedTldsChange={setSelectedTlds} />
    </div>
  );
};

export default Index;
