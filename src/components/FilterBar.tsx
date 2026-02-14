import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface FilterChip {
  label: string;
  value: string;
  color: string;
}

const filters: FilterChip[] = [
  { label: "EXTENSIONS", value: "All TLDs", color: "bg-available/15 text-available" },
  { label: "PRICE", value: "$0-$200", color: "bg-primary/10 text-primary" },
  { label: "LENGTH", value: "1-63 chars", color: "bg-primary/10 text-primary" },
  { label: "FEATURES", value: "Any", color: "bg-warning/15 text-warning" },
  { label: "STATUS", value: "All", color: "bg-secondary text-muted-foreground" },
];

const FilterBar = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
      <div className="container mx-auto flex items-center justify-center gap-2 px-4 py-3 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.label}
            className={`flex min-w-[120px] items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left transition-colors hover:opacity-80 ${f.color}`}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{f.label}</p>
              <p className="text-sm font-medium">{f.value}</p>
            </div>
            <ChevronUp className="h-4 w-4 opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default FilterBar;
