import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, X, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DomainCard from "@/components/DomainCard";
import { generateDomainList, checkDomainsAvailability, VARIATION_PREFIXES, type DomainResult } from "@/lib/domainData";

const DomainSearch = () => {
  const [query, setQuery] = useState("name");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);

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
    }, 500);
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
      const domains = generateDomainList(debouncedQuery);
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
            if (availMap.has(r.domain)) {
              return { ...r, available: availMap.get(r.domain)!, checking: false };
            }
            return r;
          })
        );
      }
    };

    run();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const checkedResults = useMemo(() => results.filter((r) => !r.checking), [results]);
  const availableCount = useMemo(() => checkedResults.filter((r) => r.available).length, [checkedResults]);
  const takenCount = useMemo(() => checkedResults.filter((r) => !r.available).length, [checkedResults]);
  const stillChecking = useMemo(() => results.some((r) => r.checking), [results]);

  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const variations = useMemo(
    () => (cleanQuery ? VARIATION_PREFIXES.slice(0, 7).map((p) => p + cleanQuery) : []),
    [cleanQuery]
  );

  const handleVariation = useCallback((v: string) => setQuery(v), []);

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="hero-gradient pb-8 pt-16 md:pb-12 md:pt-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-gradient text-4xl font-extrabold leading-tight md:text-6xl">
            Find your perfect
            <br />
            domain in seconds
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground md:text-lg">
            Smart search across thousands of domains with instant availability checks
          </p>

          {/* Search bar */}
          <div className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-2xl border border-border bg-card p-2 search-shadow">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter domain name..."
              className="flex-1 bg-transparent px-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            <Button className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Sparkles className="h-4 w-4" />
              AI Suggestions
            </Button>
          </div>

          {/* Variations */}
          {variations.length > 0 && !loading && results.length > 0 && (
            <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">Popular variations:</span>
              {variations.map((v) => (
                <button
                  key={v}
                  onClick={() => handleVariation(v)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-[968px] px-4 pb-20">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Searching domains...</p>
          </div>
        )}

        {!loading && !query && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-8 w-8 text-primary/40" />
            </div>
            <p className="mt-4 text-muted-foreground">Start searching to find your perfect domain</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            {/* Stats */}
            <div className="mb-6 mt-8 flex gap-8 rounded-xl border border-border bg-card p-5">
              <div>
                <p className="text-xs text-muted-foreground">Domains found</p>
                <p className="text-2xl font-bold text-foreground">{results.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-2xl font-bold text-available">{availableCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taken</p>
                <p className="text-2xl font-bold text-muted-foreground">{takenCount}</p>
              </div>
              {stillChecking && (
                <div className="flex items-center gap-2 ml-auto">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Checking...</span>
                </div>
              )}
            </div>

            {/* Available */}
            {availableCount > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-available" />
                <h2 className="text-lg font-bold text-foreground">Available Domains</h2>
              </div>
            )}
            <div className="space-y-3">
              {results
                .filter((r) => !r.checking && r.available)
                .slice(0, 20)
                .map((r) => (
                  <DomainCard key={r.domain} result={r} />
                ))}
            </div>

            {/* Taken */}
            {takenCount > 0 && (
              <>
                <div className="mb-4 mt-8 flex items-center gap-2">
                  <X className="h-5 w-5 text-taken" />
                  <h2 className="text-lg font-bold text-foreground">Taken Domains</h2>
                </div>
                <div className="space-y-3">
                  {results
                    .filter((r) => !r.checking && !r.available)
                    .slice(0, 10)
                    .map((r) => (
                      <DomainCard key={r.domain} result={r} />
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
