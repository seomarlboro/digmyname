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

const PopoverContent = ({ id }: { id: string }) => {
  if (id === "extensions") {
    return (
      <div className="w-[580px]">
        <h3 className="text-sm font-bold text-foreground">Domain Extensions</h3>
        <p className="mb-3 text-xs text-muted-foreground">Select one or more TLDs</p>
        <div className="grid grid-cols-5 gap-2">
          {TLD_LIST.map((tld) => (
            <div key={tld.extension} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary cursor-pointer">
              <span className="text-sm font-medium text-primary">.{tld.extension}</span>
              <span className="text-xs text-muted-foreground">${tld.regPrice}/yr</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (id === "price") {
    return (
      <div className="w-[250px]">
        <h3 className="text-sm font-bold text-foreground">Price Range</h3>
        <p className="mb-4 text-xs text-muted-foreground">Annual registration cost</p>
        <Slider defaultValue={[0, 200]} max={200} step={1} className="mb-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">$0</span>
          <span className="text-xs text-muted-foreground">to</span>
          <span className="text-sm font-semibold text-primary">$200</span>
        </div>
      </div>
    );
  }
  if (id === "length") {
    return (
      <div className="w-[250px]">
        <h3 className="text-sm font-bold text-foreground">Domain Length</h3>
        <p className="mb-4 text-xs text-muted-foreground">Number of characters</p>
        <Slider defaultValue={[1, 63]} max={63} min={1} step={1} className="mb-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">1 char</span>
          <span className="text-xs text-muted-foreground">to</span>
          <span className="text-sm font-semibold text-primary">63 chars</span>
        </div>
      </div>
    );
  }
  if (id === "features") {
    return (
      <div className="w-[220px]">
        <h3 className="text-sm font-bold text-foreground">Features</h3>
        <p className="mb-3 text-xs text-muted-foreground">Additional requirements</p>
        <div className="space-y-1">
          {featureOptions.map((f) => (
            <label key={f} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary cursor-pointer">
              <Checkbox />
              <span className="text-sm text-foreground">{f}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (id === "status") {
    return (
      <div className="w-[220px]">
        <h3 className="text-sm font-bold text-foreground">Status</h3>
        <p className="mb-3 text-xs text-muted-foreground">Filter by availability</p>
        <div className="space-y-1">
          {statusOptions.map((s) => (
            <label key={s} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary cursor-pointer">
              <Checkbox />
              <span className="text-sm text-foreground">{s}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const FilterBar = () => {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLDivElement>>({});

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
      {/* Gradient glow behind */}
      <div className="absolute inset-0 -z-10 rounded-3xl blur-xl opacity-60" style={{ background: "linear-gradient(90deg, hsl(152 60% 45% / 0.3), hsl(262 83% 58% / 0.35), hsl(280 90% 55% / 0.3), hsl(30 90% 50% / 0.25), hsl(262 83% 58% / 0.2))" }} />
      <div className="absolute inset-0 -z-10 rounded-3xl blur-2xl opacity-40 scale-105" style={{ background: "linear-gradient(90deg, hsl(152 60% 45% / 0.2), hsl(262 83% 58% / 0.25), hsl(280 90% 55% / 0.2))" }} />

      {/* Floating bar */}
      <div className="relative flex items-stretch gap-2.5 rounded-3xl border border-border/60 bg-card p-3 backdrop-blur-lg">
        {/* All popovers rendered at bar level */}
        {openFilter && openFilter !== "extensions" && (
          <div
            className="absolute z-50 -translate-x-1/2"
            style={{
              bottom: "calc(100% + 16px)",
              left: `${(buttonRefs.current[openFilter]?.offsetLeft ?? 0) + (buttonRefs.current[openFilter]?.offsetWidth ?? 0) / 2}px`,
            }}
          >
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xl">
              <PopoverContent id={openFilter} />
            </div>
          </div>
        )}
        {openFilter === "extensions" && (
          <div className="absolute left-0 right-0 z-50" style={{ bottom: "calc(100% + 16px)" }}>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xl">
              <PopoverContent id="extensions" />
            </div>
          </div>
        )}

        {filterConfigs.map((f) => (
          <div
            key={f.id}
            ref={(el) => { if (el) buttonRefs.current[f.id] = el; }}
          >
            <button
              onClick={() => toggle(f.id)}
              className={`flex min-w-[140px] h-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left whitespace-nowrap transition-all ${f.color} ${openFilter === f.id ? "ring-2 ring-primary/30 scale-[1.02]" : "hover:scale-[1.01]"}`}
            >
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{f.label}</p>
                <p className="text-base font-semibold">{f.value}</p>
              </div>
              {openFilter === f.id ? (
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              ) : (
                <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilterBar;
