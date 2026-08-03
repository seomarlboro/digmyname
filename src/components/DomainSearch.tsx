import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, X, Loader2, Sparkles, CheckCircle2, LayoutGrid, List, AlertCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import DomainCard from "@/components/DomainCard";
import HeroBackground from "@/components/HeroBackground";
import { generateDomainList, checkDomainsAvailability, type DomainResult } from "@/lib/domainData";

interface DomainSearchProps {
  selectedTlds: Set<string>;
}

const DomainSearch = ({ selectedTlds }: DomainSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const stickySearchRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();

  // Activate the shared header/search backdrop only when the search bar is pinned.
  useEffect(() => {
    const onScroll = () => {
      const stickySearch = stickySearchRef.current;
      const isPinned = window.scrollY > 10 && Boolean(stickySearch && stickySearch.getBoundingClientRect().top <= 64);
      setScrolled(isPinned);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("search-sticky-change", { detail: scrolled }));
    return () => {
      window.dispatchEvent(new CustomEvent("search-sticky-change", { detail: false }));
    };
  }, [scrolled]);

  // Debounce
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Generate domain list + check availability
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      // Step 1: Show domains immediately with "checking" state
      const domains = generateDomainList(debouncedQuery, aiSuggestions, selectedTlds);
      if (cancelled) return;
      setResults(domains);
      setLoading(false);

      // Step 2: Check real availability.
      // Strategy: send the most popular TLDs (first 20) as a small priority batch,
      // then fan out the rest in parallel batches of 20. Each batch updates the UI
      // as soon as it returns, so the popular TLDs feel near-instant.
      const domainNames = domains.map((d) => d.domain);
      const PRIORITY_SIZE = 20;
      const BATCH_SIZE = 20;

      const applyBatch = (availMap: Map<string, { available: boolean; price?: number; premium?: boolean; likelyPremium?: boolean; uncertain?: boolean; forSale?: boolean; forSaleVia?: string; listingUrl?: string }>) => {
        if (cancelled) return;
        setResults((prev) =>
          prev.map((r) => {
            const info = availMap.get(r.domain);
            if (info) {
              return {
                ...r,
                available: info.available,
                checking: false,
                gdPrice: info.price,
                premium: info.premium,
                likelyPremium: info.likelyPremium,
                uncertain: info.uncertain,
                forSale: info.forSale,
                forSaleVia: info.forSaleVia,
                listingUrl: info.listingUrl,
              };
            }
            return r;
          })
        );
      };

      const runBatch = async (slice: string[]) => {
        const availMap = await checkDomainsAvailability(slice);
        applyBatch(availMap);
      };

      // Priority batch (popular TLDs) fires first and is awaited so we surface
      // results to the user ASAP; remaining batches run in parallel.
      const priority = domainNames.slice(0, PRIORITY_SIZE);
      const rest = domainNames.slice(PRIORITY_SIZE);
      const restBatches: string[][] = [];
      for (let i = 0; i < rest.length; i += BATCH_SIZE) {
        restBatches.push(rest.slice(i, i + BATCH_SIZE));
      }

      await Promise.all([
        priority.length > 0 ? runBatch(priority) : Promise.resolve(),
        ...restBatches.map(runBatch),
      ]);
    };

    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, aiSuggestions, selectedTlds]);

  const checkingResults = useMemo(() => results.filter((r) => r.checking), [results]);
  const checkedResults = useMemo(() => results.filter((r) => !r.checking), [results]);
  const availableCount = useMemo(() => checkedResults.filter((r) => r.available && !r.uncertain).length, [checkedResults]);
  const uncertainCount = useMemo(() => checkedResults.filter((r) => r.uncertain).length, [checkedResults]);
  const takenCount = useMemo(() => checkedResults.filter((r) => !r.available && !r.uncertain).length, [checkedResults]);
  const stillChecking = checkingResults.length > 0;

  const retryDomain = useCallback(async (domain: string) => {
    setResults((prev) => prev.map((r) => (r.domain === domain ? { ...r, checking: true } : r)));
    const availMap = await checkDomainsAvailability([domain]);
    setResults((prev) =>
      prev.map((r) => {
        if (r.domain !== domain) return r;
        const info = availMap.get(domain);
        if (!info) return { ...r, checking: false, uncertain: true };
        return {
          ...r,
          checking: false,
          available: info.available,
          gdPrice: info.price,
          premium: info.premium,
          likelyPremium: info.likelyPremium,
          uncertain: info.uncertain,
          forSale: info.forSale,
          forSaleVia: info.forSaleVia,
          listingUrl: info.listingUrl,
        };
      })
    );
  }, []);

  const hasQuery = query.trim().length > 0;

  const searchBar = (
    <div className="flex flex-1 items-center gap-3 rounded-[100px] border border-white/10 bg-white/10 p-4 [backdrop-filter:blur(64px)]">
      <div className="hidden md:flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
        <Search className="h-7 w-7 text-primary" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter domain name..."
        autoFocus
        aria-label="Search domain name"
        className="min-w-0 flex-1 bg-transparent px-2 text-2xl font-semibold text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none"
      />
      {query && (
        <button onClick={() => setQuery("")} aria-label="Clear search" className="p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setAiSuggestions((value) => !value)}
        aria-label={aiSuggestions ? "Disable AI suggestions" : "Enable AI suggestions"}
        aria-pressed={aiSuggestions}
        title={aiSuggestions ? "AI suggestions on" : "AI suggestions off"}
        className={`relative flex h-9 w-[68px] shrink-0 items-center rounded-full p-1 transition-all duration-300 ${
          aiSuggestions
            ? "bg-[linear-gradient(90deg,hsl(160_70%_80%),hsl(205_90%_78%),hsl(255_85%_78%))] shadow-[0_2px_12px_hsl(var(--primary)/0.35)]"
            : "bg-white/10 hover:bg-white/[0.16]"
        }`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ${
            aiSuggestions ? "translate-x-[32px]" : "translate-x-0"
          }`}
        >
          <Sparkles
            className={`h-4 w-4 transition-colors ${aiSuggestions ? "text-primary" : "text-muted-foreground"}`}
            strokeWidth={2.5}
          />
        </span>
      </button>

    </div>
  );

  return (
    <div className="w-full">
      {!hasQuery && <HeroBackground />}

      {/* Spacer + title to push search bar to vertical center */}
      {!hasQuery ? (
        <div className="relative z-10 flex items-center justify-center px-4" style={{ height: 'calc(50vh - 32px - 40px)' }}>
          <div className="text-center">
            <h1 className="text-gradient text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
              Search domains
              <br />
              in seconds
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
              Check 50+ TLDs, see availability instantly, and compare registrar prices before you buy.
            </p>
          </div>

        </div>
      ) : (
        <h1 className="sr-only">Domain search results for {query}</h1>
      )}

      {/* Always-rendered sticky search bar */}
      <div ref={stickySearchRef} className="sticky top-16 z-40 py-4">
        {scrolled && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 -top-16 bg-background/80 backdrop-blur-xl" aria-hidden="true" />
        )}
        <div className="container relative mx-auto flex max-w-3xl items-center px-4">
          {searchBar}
        </div>
      </div>

      {/* Results */}
      <section className="mx-auto max-w-[968px] px-4 pb-20">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Searching domains...</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            {/* Stats */}
            <div className="mb-6 mt-8 flex items-center justify-center gap-8 text-base">
              <span className="text-muted-foreground"><span className="text-2xl font-extrabold text-foreground">{results.length}</span> found</span>
              <span className="text-muted-foreground"><span className="text-2xl font-extrabold text-available">{availableCount}</span> available</span>
              <span className="text-muted-foreground"><span className="text-2xl font-extrabold text-muted-foreground/60">{takenCount}</span> taken</span>
              {uncertainCount > 0 && (
                <span className="text-muted-foreground"><span className="text-2xl font-extrabold text-amber-500">{uncertainCount}</span> unverified</span>
              )}
              {stillChecking && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Checking…
                </span>
              )}
            </div>

            {/* Available */}
            {availableCount > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-available" />
                <h2 className="text-lg font-bold text-foreground flex-1">Available Domains</h2>
                <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                  <button
                    onClick={() => setViewMode("cards")}
                    aria-label="Card view"
                    aria-pressed={viewMode === "cards"}
                    className={`rounded-md p-1.5 transition-colors ${viewMode === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("compact")}
                    aria-label="Compact list view"
                    aria-pressed={viewMode === "compact"}
                    className={`rounded-md p-1.5 transition-colors ${viewMode === "compact" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <div className={viewMode === "compact" ? "rounded-xl border border-border bg-card overflow-hidden" : "space-y-3"}>
              {results
                .filter((r) => !r.checking && r.available && !r.uncertain)
                .map((r) => (
                  <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} onRetry={retryDomain} />
                ))}
            </div>

            {/* Checking */}
            {stillChecking && (
              <>
                <div className="mb-4 mt-8 flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Checking…</h2>
                </div>
                <div className={viewMode === "compact" ? "rounded-xl border border-border bg-card overflow-hidden" : "space-y-3"}>
                  {checkingResults
                    .slice(0, 20)
                    .map((r) => (
                      <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} onRetry={retryDomain} />
                    ))}
                </div>
              </>
            )}

            {/* Uncertain — couldn't verify */}
            {uncertainCount > 0 && (
              <>
                <div className="mb-4 mt-8 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-bold text-foreground">Couldn't verify</h2>
                </div>
                <div className={viewMode === "compact" ? "rounded-xl border border-border bg-card overflow-hidden" : "space-y-3"}>
                  {results
                    .filter((r) => !r.checking && r.uncertain)
                    .slice(0, 10)
                    .map((r) => (
                      <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} onRetry={retryDomain} />
                    ))}
                </div>
              </>
            )}

            {/* Taken */}
            {takenCount > 0 && (
              <>
                <div className="mb-4 mt-8 flex items-center gap-2">
                  <X className="h-5 w-5 text-taken" />
                  <h2 className="text-lg font-bold text-foreground">Taken Domains</h2>
                </div>
                <div className={viewMode === "compact" ? "rounded-xl border border-border bg-card overflow-hidden" : "space-y-3"}>
                  {results
                    .filter((r) => !r.checking && !r.available && !r.uncertain)
                    .slice(0, 10)
                    .map((r) => (
                      <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} onRetry={retryDomain} />
                    ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default DomainSearch;
