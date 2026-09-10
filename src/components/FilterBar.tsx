import { useState, useRef, useEffect, useMemo, Dispatch, SetStateAction } from "react";
import { ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { TLD_LIST } from "@/lib/domainData";
import {
  FEATURE_OPTIONS,
  PRICE_MAX,
  PRICE_MIN,
  STATUS_OPTIONS,
  activeFilterCount,
  isPriceActive,
  type Feature,
  type ResultFilters,
  type StatusFilter,
} from "@/lib/resultFilters";
import { useIsMobile } from "@/hooks/use-mobile";

interface FilterConfig {
  id: "extensions" | "price" | "features" | "status";
  label: string;
}

const filterConfigs: FilterConfig[] = [
  { id: "extensions", label: "EXTENSIONS" },
  { id: "price", label: "PRICE" },
  { id: "features", label: "FEATURES" },
  { id: "status", label: "STATUS" },
];

const INITIAL_TLD_COUNT = 12;

const formatPrice = (price: number | undefined) =>
  price == null ? "—" : `$${Number.isInteger(price) ? price : price.toFixed(2)}`;

interface ExtensionsPopoverProps {
  selectedTlds: Set<string>;
  onToggle: (ext: string) => void;
  /** Live cheapest first-year price per TLD; missing entries render "—", never a made-up figure. */
  priceByTld: ReadonlyMap<string, number>;
  mobile?: boolean;
}

const ExtensionsPopover = ({ selectedTlds, onToggle, priceByTld, mobile }: ExtensionsPopoverProps) => {
  const [showAll, setShowAll] = useState(false);
  const visibleTlds = useMemo(
    () => (showAll ? TLD_LIST : TLD_LIST.slice(0, mobile ? 8 : INITIAL_TLD_COUNT)),
    [showAll, mobile]
  );

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight text-foreground">Domain Extensions</h2>
      <p className="mb-4 text-sm text-muted-foreground">Select one or more TLDs · cheapest first-year price</p>
      <div className={`grid gap-2.5 ${mobile ? "grid-cols-2" : "grid-cols-4"}`}>
        {visibleTlds.map((tld) => {
          const selected = selectedTlds.has(tld.extension);
          return (
            <button
              type="button"
              key={tld.extension}
              onClick={() => onToggle(tld.extension)}
              aria-pressed={selected}
              className={`group flex flex-1 items-center justify-between gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ease-out active:scale-[0.97] ${
                selected
                  ? "border-mint/50 bg-mint/15 mint-glow-sm"
                  : "border-border/70 bg-muted/20 hover:-translate-y-px hover:border-mint/30 hover:bg-muted/40 dark:border-white/[0.16] dark:bg-white/[0.04] dark:hover:border-mint/40 dark:hover:bg-white/[0.08] hover:mint-glow-sm"
              }`}
            >
              <span className="min-w-0 truncate text-base font-bold tracking-tight text-mint">.{tld.extension}</span>
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-foreground/70 transition-colors group-hover:text-foreground">
                {formatPrice(priceByTld.get(tld.extension))}
              </span>
            </button>
          );
        })}
      </div>
      {TLD_LIST.length > (mobile ? 8 : INITIAL_TLD_COUNT) && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-violet/30 bg-violet/[0.08] px-4 py-1.5 text-sm font-semibold text-violet transition-all duration-200 hover:border-violet/60 hover:bg-violet/15"
        >
          {showAll ? "Show less" : `Show all ${TLD_LIST.length} extensions`}
        </button>
      )}
    </div>
  );
};

const PriceContent = ({ className = "w-[250px]", value, onChange }: { className?: string; value: [number, number]; onChange: (v: [number, number]) => void }) => {
  const atMax = value[1] >= PRICE_MAX;
  return (
    <div className={className}>
      <h3 className="text-lg font-bold tracking-tight text-foreground">Price Range</h3>
      <p className="mb-4 text-sm text-muted-foreground">First-year registration at the cheapest registrar</p>
      <Slider
        value={value}
        onValueChange={(v) => onChange([v[0] ?? PRICE_MIN, v[1] ?? PRICE_MAX])}
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={5}
        className="mb-3"
        aria-label="Price range"
      />
      <div className="flex items-center justify-between">
        <span className="text-base font-bold tabular-nums text-foreground">${value[0]}</span>
        <span className="text-xs text-muted-foreground">to</span>
        <span className="text-base font-bold tabular-nums text-foreground">${value[1]}{atMax ? "+" : ""}</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Names without a confirmed price (premium, check-price) are hidden while a range is set.</p>
    </div>
  );
};

const FeaturesContent = ({ className = "w-[260px]", selected, onToggle }: { className?: string; selected: Set<Feature>; onToggle: (f: Feature) => void }) => (
  <div className={className}>
    <h3 className="text-lg font-bold tracking-tight text-foreground">Features</h3>
    <p className="mb-4 text-sm text-muted-foreground">From the registrar table — not guesses</p>
    <div className="space-y-1">
      {FEATURE_OPTIONS.map((f) => (
        <label key={f.value} className="flex items-start gap-3 rounded-xl py-2.5 transition-colors hover:bg-muted/10 cursor-pointer">
          <Checkbox className="mt-0.5 h-5 w-5 rounded-[5px]" checked={selected.has(f.value)} onCheckedChange={() => onToggle(f.value)} aria-label={f.label} />
          <span>
            <span className="block text-sm text-foreground">{f.label}</span>
            <span className="block text-xs text-muted-foreground">{f.hint}</span>
          </span>
        </label>
      ))}
    </div>
  </div>
);

const StatusContent = ({ className = "w-[220px]", selected, onSelect }: { className?: string; selected: StatusFilter; onSelect: (s: StatusFilter) => void }) => (
  <div className={className}>
    <h3 className="text-lg font-bold tracking-tight text-foreground">Status</h3>
    <p className="mb-4 text-sm text-muted-foreground">Filter by verdict</p>
    <div className="space-y-1" role="radiogroup" aria-label="Status">
      {STATUS_OPTIONS.map((s) => (
        <label key={s.value} className="flex items-center gap-3 rounded-xl py-2.5 transition-colors hover:bg-muted/10 cursor-pointer">
          <Checkbox className="h-5 w-5 rounded-full" checked={selected === s.value} onCheckedChange={() => onSelect(s.value)} aria-label={s.label} />
          <span className="text-sm text-foreground">{s.label}</span>
        </label>
      ))}
    </div>
  </div>
);

interface FilterState {
  price: [number, number];
  onPrice: (v: [number, number]) => void;
  features: Set<Feature>;
  onFeature: (f: Feature) => void;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
}

const PopoverContent = ({ id, filters }: { id: FilterConfig["id"]; filters: FilterState }) => {
  if (id === "price") return <PriceContent value={filters.price} onChange={filters.onPrice} />;
  if (id === "features") return <FeaturesContent selected={filters.features} onToggle={filters.onFeature} />;
  if (id === "status") return <StatusContent selected={filters.status} onSelect={filters.onStatus} />;
  return null;
};

/* ── Mobile: all filters in a Drawer ── */
const MobileFilterContent = ({
  selectedTlds,
  onToggle,
  priceByTld,
  filters,
}: {
  selectedTlds: Set<string>;
  onToggle: (ext: string) => void;
  priceByTld: ReadonlyMap<string, number>;
  filters: FilterState;
}) => (
  <div className="space-y-6 px-1">
    <ExtensionsPopover selectedTlds={selectedTlds} onToggle={onToggle} priceByTld={priceByTld} mobile />
    <PriceContent className="w-full" value={filters.price} onChange={filters.onPrice} />
    <FeaturesContent className="w-full" selected={filters.features} onToggle={filters.onFeature} />
    <StatusContent className="w-full" selected={filters.status} onSelect={filters.onStatus} />
  </div>
);

interface FilterBarProps {
  selectedTlds: Set<string>;
  onSelectedTldsChange: Dispatch<SetStateAction<Set<string>>>;
  filters: ResultFilters;
  onFiltersChange: Dispatch<SetStateAction<ResultFilters>>;
  /** Live cheapest first-year price per TLD, for the extension picker. */
  priceByTld: ReadonlyMap<string, number>;
}

/**
 * The floating filter bar. Every control is wired: extensions narrow the
 * generated list, price/features/status narrow the rendered results (see
 * src/lib/resultFilters.ts for the exact semantics).
 */
const FilterBar = ({ selectedTlds, onSelectedTldsChange, filters, onFiltersChange, priceByTld }: FilterBarProps) => {
  const [openFilter, setOpenFilter] = useState<FilterConfig["id"] | null>(null);
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

  useEffect(() => {
    if (!openFilter) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFilter(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openFilter]);

  const toggle = (id: FilterConfig["id"]) => setOpenFilter((prev) => (prev === id ? null : id));

  const toggleTld = (ext: string) => {
    onSelectedTldsChange((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  };

  const toggleFeature = (f: Feature) =>
    onFiltersChange((prev) => {
      const next = new Set(prev.features);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return { ...prev, features: next };
    });

  const filterState: FilterState = {
    price: filters.price,
    onPrice: (price) => onFiltersChange((prev) => ({ ...prev, price })),
    features: filters.features,
    onFeature: toggleFeature,
    status: filters.status,
    onStatus: (status) => onFiltersChange((prev) => ({ ...prev, status })),
  };

  const getFilterValue = (id: FilterConfig["id"]) => {
    if (id === "extensions") return selectedTlds.size === 0 ? "All TLDs" : `${selectedTlds.size} selected`;
    if (id === "price") return `$${filters.price[0]}-$${filters.price[1]}${filters.price[1] >= PRICE_MAX ? "+" : ""}`;
    if (id === "features") return filters.features.size === 0 ? "Any" : `${filters.features.size} selected`;
    return STATUS_OPTIONS.find((s) => s.value === filters.status)?.short ?? "All";
  };

  const isControlActive = (id: FilterConfig["id"]) => {
    if (id === "extensions") return selectedTlds.size > 0;
    if (id === "price") return isPriceActive(filters);
    if (id === "features") return filters.features.size > 0;
    return filters.status !== "all";
  };

  const activeCount = activeFilterCount(filters, selectedTlds.size);

  /* ── Mobile: FAB + Drawer ── */
  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button type="button" aria-label="Open filters" className="fixed bottom-6 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-2xl btn-gradient shadow-2xl active:scale-95 transition-transform">
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
              <button type="button" aria-label="Close filters" className="rounded-full p-1.5 hover:bg-muted/10 transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </DrawerClose>
          </div>
          <div className="overflow-y-auto px-5 pb-8">
            <MobileFilterContent selectedTlds={selectedTlds} onToggle={toggleTld} priceByTld={priceByTld} filters={filterState} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  /* ── Desktop: floating bar ── */
  return (
    <div ref={barRef} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      {/* Gradient glow behind */}
      <div className="absolute inset-0 -z-10 rounded-[28px] blur-xl opacity-60" style={{ background: "linear-gradient(90deg, hsl(152 60% 45% / 0.3), hsl(225 85% 55% / 0.35), hsl(270 80% 58% / 0.3), hsl(30 90% 50% / 0.25), hsl(225 85% 55% / 0.2))" }} />
      <div className="absolute inset-0 -z-10 rounded-[28px] blur-2xl opacity-40 scale-105" style={{ background: "linear-gradient(90deg, hsl(152 60% 45% / 0.2), hsl(225 85% 55% / 0.25), hsl(270 80% 58% / 0.2))" }} />

      {/* Popovers — rendered as siblings of the bar so their backdrop-blur isn't killed by the bar's own backdrop-filter */}
      {openFilter && openFilter !== "extensions" && (
        <div
          className="absolute z-50 -translate-x-1/2"
          style={{
            bottom: "calc(100% + 16px)",
            left: `${(buttonRefs.current[openFilter]?.offsetLeft ?? 0) + (buttonRefs.current[openFilter]?.offsetWidth ?? 0) / 2}px`,
          }}
        >
          <div className="animate-popover max-h-[60vh] overflow-y-auto overflow-x-hidden no-scrollbar rounded-2xl border border-transparent bg-white p-5 shadow-2xl dark:border-white/[0.16] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_30px_80px_-24px_rgba(0,0,0,0.7)] dark:backdrop-blur-2xl">
            <PopoverContent id={openFilter} filters={filterState} />
          </div>
        </div>
      )}
      {openFilter === "extensions" && (
        <div className="absolute left-1/2 z-50 w-[720px] max-w-[92vw] -translate-x-1/2" style={{ bottom: "calc(100% + 16px)" }}>
          <div className="animate-popover max-h-[60vh] overflow-y-auto overflow-x-hidden no-scrollbar rounded-2xl border border-transparent bg-white p-5 shadow-2xl dark:border-white/[0.16] dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_30px_80px_-24px_rgba(0,0,0,0.7)] dark:backdrop-blur-2xl">
            <ExtensionsPopover selectedTlds={selectedTlds} onToggle={toggleTld} priceByTld={priceByTld} />
          </div>
        </div>
      )}

      {/* Floating bar */}
      <div className="relative flex items-stretch gap-3 rounded-[28px] border border-transparent bg-white p-3.5 shadow-2xl dark:border-white/[0.16] dark:bg-white/[0.06] dark:backdrop-blur-2xl" role="group" aria-label="Result filters">
        {filterConfigs.map((f) => (
          <div
            key={f.id}
            ref={(el) => { if (el) buttonRefs.current[f.id] = el; }}
          >
            <button
              type="button"
              onClick={() => toggle(f.id)}
              aria-expanded={openFilter === f.id}
              className={`flex min-w-[136px] h-full items-center justify-between gap-4 rounded-xl border px-5 py-3 text-left whitespace-nowrap transition-all ${
                openFilter === f.id
                  ? "border-primary/40 bg-primary/10 shadow-lg"
                  : isControlActive(f.id)
                    ? "border-mint/40 bg-mint/10 dark:border-mint/40 dark:bg-mint/10"
                    : "border-border/60 bg-muted/10 hover:bg-muted/20 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{f.label}</p>
                <p className="text-base font-bold text-foreground mt-0.5">{getFilterValue(f.id)}</p>
              </div>
              <ChevronUp className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openFilter === f.id ? "rotate-180 text-primary" : ""}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilterBar;
