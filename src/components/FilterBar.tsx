import { useState, useRef, useEffect, useMemo, Dispatch, SetStateAction } from "react";
import { ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { TLD_LIST } from "@/lib/domainData";
import { useIsMobile } from "@/hooks/use-mobile";

interface FilterConfig {
  id: string;
  label: string;
  color: string;
}

const filterConfigs: FilterConfig[] = [
  { id: "extensions", label: "EXTENSIONS", color: "bg-primary/10 border-primary/15" },
  { id: "price", label: "PRICE", color: "bg-available/10 border-available/15" },
  { id: "features", label: "FEATURES", color: "bg-warning/10 border-warning/15" },
  { id: "status", label: "STATUS", color: "bg-secondary/60 border-border" },
];

const featureOptions = ["Premium", "Free SSL", "Instant activation", "Trending"];
const statusOptions = ["All domains", "Available only", "Taken only"];

const INITIAL_TLD_COUNT = 12;

interface ExtensionsPopoverProps {
  selectedTlds: Set<string>;
  onToggle: (ext: string) => void;
  mobile?: boolean;
}

const ExtensionsPopover = ({ selectedTlds, onToggle, mobile }: ExtensionsPopoverProps) => {
  const [showAll, setShowAll] = useState(false);
  const visibleTlds = useMemo(
    () => (showAll ? TLD_LIST : TLD_LIST.slice(0, mobile ? 8 : INITIAL_TLD_COUNT)),
    [showAll, mobile]
  );

  return (
    <div>
      <h3 className="text-base font-bold text-foreground">Domain Extensions</h3>
      <p className="mb-4 text-sm text-muted-foreground">Select one or more TLDs</p>
      <div className={`grid gap-3 ${mobile ? "grid-cols-3" : "grid-cols-4"}`}>
        {visibleTlds.map((tld) => {
          const selected = selectedTlds.has(tld.extension);
          return (
            <div
              key={tld.extension}
              onClick={() => onToggle(tld.extension)}
              className={`flex flex-1 items-center justify-between gap-1 rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${
                selected
                  ? "bg-primary/15 ring-1 ring-primary/30"
                  : "bg-[hsl(211_100%_96%)] dark:bg-secondary hover:bg-secondary"
              }`}
            >
              <span className={`${mobile ? "text-base" : "text-lg"} font-bold text-primary`}>.{tld.extension}</span>
              <span className="text-xs text-muted-foreground">${tld.regPrice}</span>
            </div>
          );
        })}
      </div>
      {TLD_LIST.length > (mobile ? 8 : INITIAL_TLD_COUNT) && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline"
        >
          {showAll ? "Show less" : `Show all ${TLD_LIST.length} extensions`}
        </button>
      )}
    </div>
  );
};

const PopoverContent = ({ id }: { id: string }) => {
  if (id === "price") {
    return (
      <div className="w-[250px]">
        <h3 className="text-sm font-bold text-foreground">Price Range</h3>
        <p className="mb-4 text-xs text-muted-foreground">Annual registration cost</p>
        <Slider defaultValue={[0, 200]} max={200} step={1} className="mb-3" />
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-foreground">$0</span>
          <span className="text-xs text-muted-foreground">to</span>
          <span className="text-base font-bold text-foreground">$200</span>
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

/* ── Mobile: all filters in a Drawer ── */
const MobileFilterContent = ({ selectedTlds, onToggle }: { selectedTlds: Set<string>; onToggle: (ext: string) => void }) => (
  <div className="space-y-6 px-1">
    {/* Extensions */}
    <ExtensionsPopover selectedTlds={selectedTlds} onToggle={onToggle} mobile />

    {/* Price */}
    <div>
      <h3 className="text-base font-bold text-foreground">Price Range</h3>
      <p className="mb-4 text-sm text-muted-foreground">Annual registration cost</p>
      <Slider defaultValue={[0, 200]} max={200} step={1} className="mb-3" />
      <div className="flex items-center justify-between">
        <span className="text-base font-bold text-foreground">$0</span>
        <span className="text-xs text-muted-foreground">to</span>
        <span className="text-base font-bold text-foreground">$200</span>
      </div>
    </div>

    {/* Features */}
    <div>
      <h3 className="text-base font-bold text-foreground">Features</h3>
      <p className="mb-3 text-sm text-muted-foreground">Additional requirements</p>
      <div className="space-y-1">
        {featureOptions.map((f) => (
          <label key={f} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary cursor-pointer">
            <Checkbox />
            <span className="text-sm text-foreground">{f}</span>
          </label>
        ))}
      </div>
    </div>

    {/* Status */}
    <div>
      <h3 className="text-base font-bold text-foreground">Status</h3>
      <p className="mb-3 text-sm text-muted-foreground">Filter by availability</p>
      <div className="space-y-1">
        {statusOptions.map((s) => (
          <label key={s} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary cursor-pointer">
            <Checkbox />
            <span className="text-sm text-foreground">{s}</span>
          </label>
        ))}
      </div>
    </div>
  </div>
);

interface FilterBarProps {
  selectedTlds: Set<string>;
  onSelectedTldsChange: Dispatch<SetStateAction<Set<string>>>;
}

const FilterBar = ({ selectedTlds, onSelectedTldsChange }: FilterBarProps) => {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLDivElement>>({});
  const isMobile = useIsMobile();

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

  const toggleTld = (ext: string) => {
    onSelectedTldsChange((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  };

  const getFilterValue = (id: string) => {
    if (id === "extensions") return selectedTlds.size === 0 ? "All TLDs" : `${selectedTlds.size} selected`;
    if (id === "price") return "$0-$200";
    if (id === "features") return "Any";
    if (id === "status") return "All";
    return "";
  };

  const activeCount = selectedTlds.size; // can expand later to count other active filters

  /* ── Mobile: FAB + Drawer ── */
  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button className="fixed bottom-6 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full btn-gradient shadow-2xl active:scale-95 transition-transform">
            <SlidersHorizontal className="h-6 w-6" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[11px] font-bold text-warning-foreground">
                {activeCount}
              </span>
            )}
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-lg font-bold text-foreground">Filters</h2>
            <DrawerClose asChild>
              <button className="rounded-full p-1.5 hover:bg-secondary transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </DrawerClose>
          </div>
          <div className="overflow-y-auto px-5 pb-8">
            <MobileFilterContent selectedTlds={selectedTlds} onToggle={toggleTld} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  /* ── Desktop: floating bar ── */
  return (
    <div ref={barRef} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      {/* Gradient glow behind */}
      <div className="absolute inset-0 -z-10 rounded-3xl blur-xl opacity-60" style={{ background: "linear-gradient(90deg, hsl(152 60% 45% / 0.3), hsl(225 85% 55% / 0.35), hsl(270 80% 58% / 0.3), hsl(30 90% 50% / 0.25), hsl(225 85% 55% / 0.2))" }} />
      <div className="absolute inset-0 -z-10 rounded-3xl blur-2xl opacity-40 scale-105" style={{ background: "linear-gradient(90deg, hsl(152 60% 45% / 0.2), hsl(225 85% 55% / 0.25), hsl(270 80% 58% / 0.2))" }} />

      {/* Floating bar */}
      <div className="relative flex items-stretch gap-3 rounded-[28px] border border-border/30 bg-card/80 p-3.5 backdrop-blur-2xl shadow-2xl">
        {/* Popovers */}
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
              <ExtensionsPopover selectedTlds={selectedTlds} onToggle={toggleTld} />
            </div>
          </div>
        )}

        {filterConfigs.map((f) => {
          const labelColor = f.id === "extensions" ? "text-primary" 
            : f.id === "price" ? "text-available" 
            : f.id === "features" ? "text-warning" 
            : "text-muted-foreground";

          return (
            <div
              key={f.id}
              ref={(el) => { if (el) buttonRefs.current[f.id] = el; }}
            >
              <button
                onClick={() => toggle(f.id)}
                className={`flex min-w-[130px] h-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left whitespace-nowrap transition-all ${f.color} ${openFilter === f.id ? "ring-2 ring-primary/20 scale-[1.02] shadow-lg" : "hover:scale-[1.01] hover:shadow-md"}`}
              >
                <div>
                  <p className={`text-[11px] font-extrabold uppercase tracking-widest ${labelColor}`}>{f.label}</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{getFilterValue(f.id)}</p>
                </div>
                <ChevronUp className={`h-4 w-4 shrink-0 transition-transform ${labelColor} opacity-50 ${openFilter === f.id ? "rotate-180" : ""}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FilterBar;
