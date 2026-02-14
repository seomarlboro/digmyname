import { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { TLD_LIST } from "@/lib/domainData";

interface FilterConfig {
  id: string;
  label: string;
  value: string;
  color: string;
}

const filterConfigs: FilterConfig[] = [
  { id: "extensions", label: "EXTENSIONS", value: "All TLDs", color: "bg-available/15 text-available" },
  { id: "price", label: "PRICE", value: "$0-$200", color: "bg-primary/10 text-primary" },
  { id: "length", label: "LENGTH", value: "1-63 chars", color: "bg-primary/10 text-primary" },
  { id: "features", label: "FEATURES", value: "Any", color: "bg-warning/15 text-warning" },
  { id: "status", label: "STATUS", value: "All", color: "bg-secondary text-muted-foreground" },
];

const featureOptions = ["Premium", "Free SSL", "Instant activation", "Trending"];
const statusOptions = ["Available", "Taken"];

const FilterBar = () => {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (id: string) => setOpenFilter((prev) => (prev === id ? null : id));

  return (
    <div ref={barRef} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      {/* Popover panels */}
      {openFilter && (
        <div className="absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xl min-w-[280px]">
            {openFilter === "extensions" && (
              <div>
                <h3 className="text-sm font-bold text-foreground">Domain Extensions</h3>
                <p className="mb-3 text-xs text-muted-foreground">Select one or more TLDs</p>
                <div className="grid grid-cols-2 gap-2">
                  {TLD_LIST.map((tld) => (
                    <div
                      key={tld.extension}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary cursor-pointer"
                    >
                      <span className="text-sm font-medium text-primary">.{tld.extension}</span>
                      <span className="text-xs text-muted-foreground">${tld.regPrice}/yr</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {openFilter === "price" && (
              <div>
                <h3 className="text-sm font-bold text-foreground">Price Range</h3>
                <p className="mb-4 text-xs text-muted-foreground">Annual registration cost</p>
                <Slider defaultValue={[0, 200]} max={200} step={1} className="mb-3" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">$0</span>
                  <span className="text-xs text-muted-foreground">to</span>
                  <span className="text-sm font-semibold text-primary">$200</span>
                </div>
              </div>
            )}

            {openFilter === "length" && (
              <div>
                <h3 className="text-sm font-bold text-foreground">Domain Length</h3>
                <p className="mb-4 text-xs text-muted-foreground">Number of characters</p>
                <Slider defaultValue={[1, 63]} max={63} min={1} step={1} className="mb-3" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">1 char</span>
                  <span className="text-xs text-muted-foreground">to</span>
                  <span className="text-sm font-semibold text-primary">63 chars</span>
                </div>
              </div>
            )}

            {openFilter === "features" && (
              <div>
                <h3 className="text-sm font-bold text-foreground">Features</h3>
                <p className="mb-3 text-xs text-muted-foreground">Additional requirements</p>
                <div className="space-y-1">
                  {featureOptions.map((f) => (
                    <label
                      key={f}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary cursor-pointer"
                    >
                      <Checkbox />
                      <span className="text-sm text-foreground">{f}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {openFilter === "status" && (
              <div>
                <h3 className="text-sm font-bold text-foreground">Status</h3>
                <p className="mb-3 text-xs text-muted-foreground">Filter by availability</p>
                <div className="space-y-1">
                  {statusOptions.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary cursor-pointer"
                    >
                      <Checkbox />
                      <span className="text-sm text-foreground">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur-lg">
        {filterConfigs.map((f) => (
          <button
            key={f.id}
            onClick={() => toggle(f.id)}
            className={`flex min-w-[110px] items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left transition-all ${f.color} ${openFilter === f.id ? "ring-2 ring-primary/30" : ""}`}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{f.label}</p>
              <p className="text-sm font-medium">{f.value}</p>
            </div>
            {openFilter === f.id ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-60" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FilterBar;
