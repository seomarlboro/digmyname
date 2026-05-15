import { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, Loader2, Sparkles, CheckCircle2, LayoutGrid, List } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import DomainCard from "@/components/DomainCard";
import HeroBackground from "@/components/HeroBackground";
import { generateDomainList, checkDomainsAvailability, type DomainResult } from "@/lib/domainData";

interface DomainSearchProps {
  selectedTlds: Set<string>;
}

const DomainSearch = ({ selectedTlds }: DomainSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");
  const isMobile = useIsMobile();

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

      // Step 2: Check real availability in batches
      const domainNames = domains.map((d) => d.domain);
      const batchSize = 20;

      for (let i = 0; i < domainNames.length; i += batchSize) {
        if (cancelled) return;
        const batch = domainNames.slice(i, i + batchSize);
        const availMap = await checkDomainsAvailability(batch);

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
              };
            }
            return r;
          })
        );
      }
    };

    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, aiSuggestions, selectedTlds]);

  const checkingResults = useMemo(() => results.filter((r) => r.checking), [results]);
  const checkedResults = useMemo(() => results.filter((r) => !r.checking), [results]);
  const availableCount = useMemo(() => checkedResults.filter((r) => r.available).length, [checkedResults]);
  const takenCount = useMemo(() => checkedResults.filter((r) => !r.available).length, [checkedResults]);
  const stillChecking = checkingResults.length > 0;

  const hasQuery = query.trim().length > 0;

  const searchBar = (
    <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-[20px] border border-border bg-card p-3 search-shadow overflow-hidden search-border-glow" style={{ borderRadius: '20px' }}>
      <div className="hidden md:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Search className="h-6 w-6 text-primary" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter domain name..."
        autoFocus
        aria-label="Search domain name"
        className="min-w-0 flex-1 bg-transparent px-2 text-lg font-semibold text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none"
      />
      {query && (
        <button onClick={() => setQuery("")} aria-label="Clear search" className="p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
      {/* Mobile: clickable icon, Desktop: icon + label + switch */}
      <button
        type="button"
        onClick={() => setAiSuggestions((v) => !v)}
        aria-label={aiSuggestions ? "Disable AI suggestions" : "Enable AI suggestions"}
        aria-pressed={aiSuggestions}
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl cursor-pointer transition-all md:hidden
          ${aiSuggestions ? "btn-gradient shadow-lg" : "bg-primary/10 text-primary"}`}
      >
        <Sparkles className="h-6 w-6" />
      </button>
      <div className="hidden md:flex items-center gap-2 rounded-xl bg-primary/10 dark:bg-primary/20 px-3 py-2">
        <Sparkles className="h-4 w-4 text-primary dark:drop-shadow-[0_0_4px_hsl(218,96%,60%)]" />
        <span className="text-sm font-medium text-primary whitespace-nowrap">AI</span>
        <Switch checked={aiSuggestions} onCheckedChange={setAiSuggestions} aria-label="Toggle AI suggestions" className="dark:data-[state=unchecked]:bg-primary/30" />
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {!hasQuery && <HeroBackground />}

      {/* Spacer + title to push search bar to vertical center */}
      {!hasQuery ? (
        <div className="relative z-10 flex items-center justify-center px-4" style={{ height: 'calc(50vh - 32px - 40px)' }}>
          <div className="text-center">
            <h1 className="text-gradient text-4xl font-extrabold leading-tight md:text-6xl">
              Find your perfect
              <br />
              domain in seconds
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground md:text-lg">
              Smart search across thousands of domains with instant availability checks
            </p>
          </div>
        </div>
      ) : (
        <h1 className="sr-only">Domain search results for {query}</h1>
      )}

      {/* Always-rendered sticky search bar */}
      <div className={`sticky top-16 z-40 border-b transition-all duration-300 ${hasQuery ? "border-border/50 bg-background/80 py-4 backdrop-blur-xl" : "border-transparent bg-transparent py-4"}`}>
        <div className="container mx-auto px-4">
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
                .filter((r) => !r.checking && r.available)
                .map((r) => (
                  <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} />
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
                      <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} />
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
                    .filter((r) => !r.checking && !r.available)
                    .slice(0, 10)
                    .map((r) => (
                      <DomainCard key={r.domain} result={r} compact={viewMode === "compact"} />
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
