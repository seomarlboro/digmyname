import Header from "@/components/Header";
import DomainSearch from "@/components/DomainSearch";
import FilterBar from "@/components/FilterBar";

const Index = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <DomainSearch />
      <FilterBar />
    </div>
  );
};

export default Index;
