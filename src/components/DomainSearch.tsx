import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, X, Loader2, CheckCircle2, LayoutGrid, List, AlertCircle, Zap } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const StarsIcon = ({ className, active }: { className?: string; active?: boolean }) => (
  <svg
    viewBox="0 0 512 512"
    className={className}
    fill={active ? "url(#starsGradient)" : "hsl(var(--muted-foreground))"}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="starsGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(160, 70%, 55%)" />
        <stop offset="50%" stopColor="hsl(205, 90%, 58%)" />
        <stop offset="100%" stopColor="hsl(255, 85%, 65%)" />
      </linearGradient>
    </defs>
    <path d="M298.138,136.665c-62.065-13.011-110.576-61.522-123.585-123.588C172.955,5.458,166.235,0,158.448,0 s-14.507,5.458-16.104,13.078c-13.01,62.065-61.521,110.575-123.586,123.584c-7.62,1.597-13.079,8.318-13.079,16.104 s5.458,14.507,13.079,16.104c62.064,13.011,110.573,61.521,123.583,123.586c1.597,7.62,8.317,13.079,16.104,13.079 c7.786,0,14.507-5.458,16.104-13.079c13.011-62.065,61.523-110.575,123.588-123.583c7.62-1.597,13.079-8.317,13.079-16.104 C311.215,144.983,305.757,138.262,298.138,136.665z" />
    <path d="M270.938,408.484c-29.242-6.129-52.098-28.985-58.229-58.229c-1.597-7.62-8.317-13.079-16.104-13.079 c-7.786,0-14.507,5.457-16.104,13.078c-6.131,29.243-28.988,52.099-58.23,58.229c-7.62,1.597-13.079,8.318-13.079,16.104 c0,7.786,5.458,14.507,13.079,16.104c29.241,6.13,52.098,28.987,58.228,58.23c1.597,7.62,8.317,13.079,16.104,13.079 c7.786,0,14.507-5.457,16.104-13.079c6.131-29.243,28.988-52.099,58.231-58.229c7.62-1.597,13.079-8.318,13.079-16.104 C284.017,416.802,278.559,410.082,270.938,408.484z" />
    <path d="M493.243,256.135c-39.526-8.286-70.419-39.18-78.704-78.705c-1.597-7.62-8.317-13.079-16.104-13.079 c-7.786,0-14.507,5.457-16.104,13.078c-8.286,39.526-39.179,70.419-78.705,78.704c-7.62,1.597-13.079,8.318-13.079,16.104 c0,7.786,5.458,14.506,13.079,16.104c39.525,8.286,70.418,39.179,78.703,78.705c1.597,7.62,8.317,13.079,16.104,13.079 c7.786,0,14.507-5.457,16.104-13.079c8.287-39.526,39.18-70.419,78.705-78.703c7.62-1.598,13.079-8.318,13.079-16.104 S500.863,257.732,493.243,256.135z" />
  </svg>
);
import DomainCard from "@/components/DomainCard";

import { generateDomainList, checkDomainsAvailability, checkDomainsFast, TLD_RANK, type DomainResult } from "@/lib/domainData";

/** Stable ordering key: TLD authority only. Never sort on available/uncertain/
 *  provisional/price — those mutate over a row's lifecycle and would reorder
 *  rows mid-search (layout jump). */
const byTldAuthority = (a: DomainResult, b: DomainResult) => {
  const ra = TLD_RANK[a.tld.extension] ?? Number.MAX_SAFE_INTEGER;
  const rb = TLD_RANK[b.tld.extension] ?? Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  return a.tld.extension.localeCompare(b.tld.extension);
};

interface DomainSearchProps {
  selectedTlds: Set<string>;
  onHasResultsChange?: (hasResults: boolean) => void;
}

const DomainSearch = ({ selectedTlds, onHasResultsChange }: DomainSearchProps) => {
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

  // Warm the TLS connection to the edge API once on mount so the first real
  // lookup doesn't pay for the handshake. Never throws, never blocks render.
  useEffect(() => {
    try {
      void fetch("https://api.digmyname.com/functions/v1/public-api/ping", {
        mode: "no-cors",
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }, []);

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

  // ---- Honest speed measurement -------------------------------------------
  // The clock starts on the LAST keystroke (so the 80 ms debounce is counted
  // against us) and stops when the first availability answer lands on screen.
  const typingStopRef = useRef<number | null>(null);
  const [liveMs, setLiveMs] = useState<number | null>(null);
  const [firstAnswerMs, setFirstAnswerMs] = useState<number | null>(null);

  const markFirstAnswer = useCallback(() => {
    if (typingStopRef.current == null) return;
    setFirstAnswerMs(Math.round(performance.now() - typingStopRef.current));
    typingStopRef.current = null;
    setLiveMs(null);
  }, []);

  // Debounce: very short so results feel instant, but not so short that every
  // keystroke triggers a request storm.
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      setResults([]);
      typingStopRef.current = null;
      setLiveMs(null);
      setFirstAnswerMs(null);
      return;
    }
    setLoading(true);
    typingStopRef.current = performance.now();
    setFirstAnswerMs(null);
    setLiveMs(0);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 80);
    return () => clearTimeout(timer);
  }, [query]);

  // Live ticking counter while we wait for the first answer.
  useEffect(() => {
    if (liveMs === null) return;
    let raf = 0;
    const tick = () => {
      if (typingStopRef.current != null) {
        setLiveMs(Math.round(performance.now() - typingStopRef.current));
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMs === null]);


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

      const domainNames = domains.map((d) => d.domain);

      // Step 2: Fast DNS pre-check — fired in the BACKGROUND (never awaited) so a
      // slow/large DNS batch can't delay the authoritative lookups below.
      // Split into small chunks so the first chunk lands in ~50-100ms.
      const FAST_CHUNK = 10;
      const applyFast = (fastMap: Map<string, { available: boolean; uncertain: boolean }>) => {
        if (cancelled || !fastMap.size) return;
        setResults((prev) =>
          prev.map((r) => {
            const info = fastMap.get(r.domain);
            if (!info) return r;
            const confident = !info.uncertain;
            return {
              ...r,
              available: info.available,
              uncertain: info.uncertain,
              // Only graduate out of the spinner on a confident fast verdict. An
              // uncertain fast answer (e.g. NXDOMAIN -> available:true + uncertain:true)
              // stays in Checking until the authoritative batch confirms, so we never
              // flash a priced "available" card or an amber card off a DNS-only probe.
              checking: confident ? false : r.checking,
              provisional: confident ? true : r.provisional,
            };
          })
        );
        markFirstAnswer();
      };
      for (let i = 0; i < domainNames.length; i += FAST_CHUNK) {
        const chunk = domainNames.slice(i, i + FAST_CHUNK);
        void checkDomainsFast(chunk).then(applyFast).catch(() => {});
      }


      // Step 3: Authoritative availability + pricing.
      // Strategy: the ~10 most popular TLDs are each sent as their OWN request so
      // every card resolves at its own speed (no waiting for the slowest sibling
      // in a batch). Everything else fans out in parallel batches of 20.
      const BATCH_SIZE = 20;
      const TOP_TLDS = ["com", "io", "net", "org", "ai", "co", "app", "dev", "xyz", "me"];

      const isTop = (d: string) => {
        const tld = d.slice(d.indexOf(".") + 1);
        return TOP_TLDS.includes(tld);
      };

      // Keep only the first occurrence per TLD (base name first when AI variations are on).
      const seenTop = new Set<string>();
      const solo: string[] = [];
      const rest: string[] = [];
      for (const d of domainNames) {
        const tld = d.slice(d.indexOf(".") + 1);
        if (isTop(d) && !seenTop.has(tld)) {
          seenTop.add(tld);
          solo.push(d);
        } else {
          rest.push(d);
        }
      }

      const applyBatch = (availMap: Map<string, { available: boolean; price?: number; premium?: boolean; likelyPremium?: boolean; uncertain?: boolean; uncertainReason?: "brand_protected"; sldBlocked?: boolean; forSale?: boolean; forSaleVia?: string; listingUrl?: string }>) => {
        if (cancelled) return;
        markFirstAnswer();
        setResults((prev) =>
          prev.map((r) => {
            const info = availMap.get(r.domain);
            if (info) {
              return {
                ...r,
                available: info.available,
                checking: false,
                provisional: false,
                gdPrice: info.price,
                premium: info.premium,
                likelyPremium: info.likelyPremium,
                uncertain: info.uncertain,
                uncertainReason: info.uncertainReason,
                sldBlocked: info.sldBlocked,
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

      const restBatches: string[][] = [];
      for (let i = 0; i < rest.length; i += BATCH_SIZE) {
        restBatches.push(rest.slice(i, i + BATCH_SIZE));
      }

      await Promise.all([
        // one request per top TLD → each card flips as soon as its own lookup lands
        ...solo.map((d) => runBatch([d])),
        ...restBatches.map(runBatch),
      ]);
    };

    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, aiSuggestions, selectedTlds, markFirstAnswer]);


  useEffect(() => {
    onHasResultsChange?.(results.length > 0);
  }, [results.length, onHasResultsChange]);

  const checkingResults = useMemo(() => results.filter((r) => r.checking), [results]);
  const checkedResults = useMemo(() => results.filter((r) => !r.checking), [results]);
  const availableCount = useMemo(() => checkedResults.filter((r) => r.available && !r.uncertain).length, [checkedResults]);
  const uncertainCount = useMemo(() => checkedResults.filter((r) => r.uncertain && !r.sldBlocked && !r.provisional).length, [checkedResults]);
  const takenCount = useMemo(() => checkedResults.filter((r) => !r.available && (!r.uncertain || r.sldBlocked || r.provisional)).length, [checkedResults]);
  const stillChecking = checkingResults.length > 0;

  const retryDomain = useCallback(async (domain: string) => {
    setResults((prev) => prev.map((r) => (r.domain === domain ? { ...r, checking: true } : r)));
    const availMap = await checkDomainsAvailability([domain]);
    setResults((prev) =>
      prev.map((r) => {
        if (r.domain !== domain) return r;
        const info = availMap.get(domain);
        if (!info) return { ...r, checking: false, provisional: false, uncertain: true };
        return {
          ...r,
          checking: false,
          provisional: false,
          available: info.available,
          gdPrice: info.price,
          premium: info.premium,
          likelyPremium: info.likelyPremium,
          uncertain: info.uncertain,
          uncertainReason: info.uncertainReason,
          sldBlocked: info.sldBlocked,
          forSale: info.forSale,
          forSaleVia: info.forSaleVia,
          listingUrl: info.listingUrl,
        };
      })
    );
  }, []);

  const hasQuery = query.trim().length > 0;

  const searchBar = (
    <div className="flex w-full min-w-0 flex-1 items-center gap-0.5 rounded-[100px] border border-white/40 bg-white/25 py-[14px] pl-4 pr-4 sm:pl-5 sm:pr-6 [backdrop-filter:blur(64px)] dark:border-white/10 dark:bg-white/[0.05]">
      <div className="hidden md:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
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
        className="w-full min-w-0 flex-1 bg-transparent pl-1 pr-2 text-lg sm:pr-10 sm:text-2xl font-semibold text-foreground/60 dark:text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none"
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
        className={`relative flex h-[38px] w-[58px] shrink-0 items-center rounded-full p-1 transition-all duration-300 ${
          aiSuggestions
            ? "bg-[linear-gradient(90deg,hsl(160_70%_80%),hsl(205_90%_78%),hsl(255_85%_78%))] shadow-[0_2px_16px_hsl(var(--primary)/0.4)]"
            : "bg-black/10 hover:bg-black/[0.16] dark:bg-white/10 dark:hover:bg-white/[0.16]"
        }`}
      >
        <span
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            aiSuggestions ? "translate-x-5" : "translate-x-0"
          }`}
        >
          <StarsIcon
            className="h-[18px] w-[18px]"
            active={aiSuggestions}
          />
        </span>
      </button>

    </div>
  );

  return (
    <div className="w-full">
      {/* Spacer + title to push search bar to vertical center */}
      {!hasQuery ? (
        <div className="relative z-10 flex min-h-[38vh] items-center justify-center px-4 pb-4 pt-10 sm:h-[calc(50vh-72px)] sm:min-h-0 sm:pb-0 sm:pt-0">
          <div className="mx-auto w-full max-w-5xl text-center">
            <h1 className="text-gradient mx-auto w-full px-1 text-[clamp(2.25rem,10.5vw,4.75rem)] font-extrabold leading-[1.05] tracking-[-0.04em] sm:leading-[1] sm:tracking-[-0.045em]">
              <span className="block sm:hidden">World's fastest</span>
              <span className="block sm:hidden">domain search.</span>
              <span className="block sm:hidden">Fight us.</span>
              <span className="hidden sm:block whitespace-nowrap">World's fastest</span>
              <span className="hidden sm:block whitespace-nowrap">domain search. Fight us.</span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:mt-6 sm:text-lg md:text-xl">
              Probably the fastest domain search in the universe. Or the second — the timer on screen will
              tell you which.
            </p>

            <Link
              to="/speed"
              className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
            >
              <Zap className="h-3.5 w-3.5 shrink-0 text-aurora-mint" />
              <span className="whitespace-nowrap">First answer in ~170 ms<span className="hidden sm:inline"> — timed live, no asterisks</span></span>
            </Link>

            <div className="mt-3">
              <Link to="/speed" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:text-sm">
                see the live benchmark →
              </Link>
            </div>




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
      <section className={`content-wrap pb-20 ${results.length > 0 ? "results-shell" : ""}`}>
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Searching domains...</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            {/* Stats */}
            <div className="mb-6 mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:gap-8 sm:text-base">
              <span className="text-muted-foreground"><span className="text-xl font-extrabold text-foreground sm:text-2xl">{results.length}</span> found</span>
              <span className="text-muted-foreground"><span className="text-xl font-extrabold text-available sm:text-2xl">{availableCount}</span> available</span>
              <span className="text-muted-foreground"><span className="text-xl font-extrabold text-muted-foreground/60 sm:text-2xl">{takenCount}</span> taken</span>
              {uncertainCount > 0 && (
                <span className="text-muted-foreground"><span className="text-xl font-extrabold text-amber-500 sm:text-2xl">{uncertainCount}</span> unverified</span>
              )}

              {(liveMs !== null || firstAnswerMs !== null) && (
                <Link
                  to="/speed"
                  title="How we measure: clock starts on your last keystroke, stops on the first answer"
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="tabular-nums font-semibold text-foreground">
                    {liveMs !== null ? liveMs : firstAnswerMs} ms
                  </span>
                  <span className="hidden sm:inline">first answer</span>
                </Link>
              )}
            </div>


            {/* Available */}
            {availableCount > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-available" />
                <h2 className="text-lg font-bold text-foreground flex-1">Available Domains</h2>
                <div className="flex items-center rounded-2xl border border-border p-0.5">
                  <button
                    onClick={() => setViewMode("cards")}
                    aria-label="Card view"
                    aria-pressed={viewMode === "cards"}
                    className={`rounded-2xl p-1.5 transition-colors ${viewMode === "cards" ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("compact")}
                    aria-label="Compact list view"
                    aria-pressed={viewMode === "compact"}
                    className={`rounded-2xl p-1.5 transition-colors ${viewMode === "compact" ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <div className={viewMode === "compact" ? "list-surface rounded-xl border border-border overflow-hidden" : "space-y-3"}>
              {results
                .filter((r) => !r.checking && r.available && !r.uncertain)
                .sort(byTldAuthority)
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
                <div className={viewMode === "compact" ? "list-surface rounded-xl border border-border overflow-hidden" : "space-y-3"}>
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
                <div className={viewMode === "compact" ? "list-surface rounded-xl border border-border overflow-hidden" : "space-y-3"}>
                  {results
                    .filter((r) => !r.checking && r.uncertain && !r.sldBlocked && !r.provisional)
                    .sort(byTldAuthority)
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
                <div className={viewMode === "compact" ? "list-surface rounded-xl border border-border overflow-hidden" : "space-y-3"}>
                  {results
                    .filter((r) => !r.checking && !r.available && (!r.uncertain || r.sldBlocked || r.provisional))
                    .sort(byTldAuthority)
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
