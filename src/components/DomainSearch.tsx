import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, X, Loader2, CheckCircle2, LayoutGrid, List, AlertCircle, Zap } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCheapestRegistrars } from "@/hooks/useCheapestRegistrars";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import AuthDialog from "@/components/LazyAuthDialog";
import LiveStopwatch from "@/components/LiveStopwatch";
import { deriveCardFacts } from "@/lib/cardFacts";
import { matchesFilters, type ResultFilters } from "@/lib/resultFilters";
import { earlyHeadline, isPremiumSuspectSld, sldOf } from "@/lib/searchLanes";
import { applyBrowserVerdict, browserLaneEligible, checkInBrowser, warmRegistries, type BrowserVerdict } from "@/lib/browserLane";

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

import { generateDomainList, checkDomainsAvailability, checkDomainsFast, applyFastVerdict, TLD_RANK, type DomainResult, type AvailabilityResponse, type FastInfo } from "@/lib/domainData";

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
  /** Price / features / status from the filter bar; applied to settled rows (see src/lib/resultFilters.ts). */
  filters: ResultFilters;
  onResetFilters?: () => void;
  onHasResultsChange?: (hasResults: boolean) => void;
}
/** Per-entry lifetime of the session result cache. */
const RESULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Debounce for the DNS pre-check lane, measured from the last keystroke:
 *  short so taken names flip while the user is still looking at the field. */
const FAST_DEBOUNCE_MS = 80;
/** Debounce for the authoritative lane, measured from the same keystroke.
 *  Human typing sits at ~150-300 ms between keys, so at 80 ms every keystroke
 *  of a normal typist fired a full 53-TLD authoritative wave — 16 requests,
 *  plus paid Fastly calls for .co/.me on every wave and for every short prefix
 *  (a 1-5 char SLD is a premium suspect on every TLD). 250 ms lets the fast
 *  lane keep the instant feel while the authoritative wave fires once per
 *  pause. The honest stopwatch counts this delay against us. */
const AUTH_DEBOUNCE_MS = 250;
/** After the authoritative wave lands, the card the visitor typed gets one more
 *  question — is it registry-premium? — provided the visitor is still on it. One
 *  paid third-signal call per settled search, never per keystroke. */
const PREMIUM_VERIFY_DELAY_MS = 800;

const DomainSearch = ({ selectedTlds, filters, onResetFilters, onHasResultsChange }: DomainSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cheapestByTld = useCheapestRegistrars();
  const stickySearchRef = useRef<HTMLDivElement>(null);
  // Session-scoped cache of authoritative results, keyed by domain. Lets a user
  // who returns to an already-checked name (deletes a letter, retypes, re-searches)
  // see the confirmed verdict instantly instead of re-running the check — which is
  // what made .co names flap back to "Check price" when a re-check lost the Fastly
  // race. Only trustworthy results are cached (never uncertain/provisional), each
  // with a 5-minute TTL so prices can't go stale. In-memory only (no storage).
  const resultCacheRef = useRef<Map<string, { result: DomainResult; expiresAt: number }>>(new Map());
  /** The search currently in flight; cancelled on the very next keystroke (see the search effect). */
  const activeJobRef = useRef<{ cancelled: boolean; ctl: AbortController } | null>(null);
  /** Latest rows, readable from async lanes without closing over stale state. */
  const resultsRef = useRef<DomainResult[]>([]);
  const cacheResult = useCallback((r: DomainResult) => {
    // Honesty guardrail: only remember confident, authoritative verdicts.
    if (r.checking || r.uncertain || r.provisional || r.reachFailed) return;
    resultCacheRef.current.set(r.domain, {
      result: { ...r, checking: false, provisional: false },
      expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
    });
  }, []);
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    const fromUrl = new URLSearchParams(window.location.search).get("q")?.trim();
    if (fromUrl) return fromUrl;
    // Whatever was typed into the static shell's input before React mounted
    // (index.html renders the hero and a real input so the page is usable at once).
    const shell = document.getElementById("prehydrate-q") as HTMLInputElement | null;
    return shell?.value.trim() ?? "";
  });
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  resultsRef.current = results;
  const [aiSuggestions, setAiSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();

  // Auth, favourites and the price table are read ONCE here and handed to the
  // cards as props: 53 cards each subscribing to react-query themselves meant
  // 150+ observers re-rendering on every store notification.
  const { user } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();
  const favoritedSet = useMemo(() => new Set(favorites), [favorites]);
  const [authOpen, setAuthOpen] = useState(false);
  const toggleFavoriteRef = useRef(toggleFavorite);
  toggleFavoriteRef.current = toggleFavorite;
  const handleToggleFavorite = useCallback(
    (domain: string) => {
      if (!user) {
        setAuthOpen(true);
        return;
      }
      toggleFavoriteRef.current(domain);
    },
    [user],
  );

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
  // The clock starts on the LAST keystroke (so both debounces are counted
  // against us) and stops when the first availability answer lands on screen.
  const typingStopRef = useRef<number | null>(null);
  // "running" while the clock ticks, "done" once the first answer landed. The
  // ticking digits are painted by <LiveStopwatch/> straight into the DOM from
  // requestAnimationFrame. They used to be React state updated every frame,
  // which re-rendered the whole 53-card list 60× a second and (measured on
  // prod) delayed the fast lane by ~0.9 s and the authoritative lane by ~1.7 s.
  const [stopwatch, setStopwatch] = useState<"idle" | "running" | "done">("idle");
  const [firstAnswerMs, setFirstAnswerMs] = useState<number | null>(null);

  const markFirstAnswer = useCallback(() => {
    if (typingStopRef.current == null) return;
    setFirstAnswerMs(Math.round(performance.now() - typingStopRef.current));
    typingStopRef.current = null;
    setStopwatch("done");
  }, []);

  // Debounce, lane one: the DNS pre-check fires FAST_DEBOUNCE_MS after the last
  // keystroke. The authoritative lane waits out AUTH_DEBOUNCE_MS inside the
  // search effect below, so a superseded prefix never reaches the backend.
  useEffect(() => {
    // The previous search is stale the moment the query changes; abort it now
    // so none of its answers can touch the new stopwatch or the new rows.
    if (activeJobRef.current) {
      activeJobRef.current.cancelled = true;
      activeJobRef.current.ctl.abort();
      activeJobRef.current = null;
    }
    if (!query.trim()) {
      setDebouncedQuery("");
      setResults([]);
      typingStopRef.current = null;
      setStopwatch("idle");
      setFirstAnswerMs(null);
      return;
    }
    setLoading(true);
    typingStopRef.current = performance.now();
    setFirstAnswerMs(null);
    setStopwatch("running");
    warmRegistries();
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, FAST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);


  // Generate domain list + check availability
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    // One job per search: when the query moves on, every request still in
    // flight for the superseded query is aborted instead of finishing into the
    // void (its result is already dropped via `job.cancelled`). The job is also
    // reachable from the keystroke effect, which cancels it IMMEDIATELY — not
    // 80 ms later when this effect re-runs — because a late answer for the
    // previous prefix landing in that window used to stop the new query's
    // stopwatch ("55 ms first answer" for a name nobody had checked yet).
    const job = { cancelled: false, ctl: new AbortController() };
    activeJobRef.current = job;

    const run = async () => {
      // Step 1: Show domains immediately with "checking" state
      const domains = generateDomainList(debouncedQuery, aiSuggestions, selectedTlds);
      const now = Date.now();
      const hydrated = domains.map((d) => {
        const cached = resultCacheRef.current.get(d.domain);
        if (cached && cached.expiresAt > now) {
          // Keep the freshly-generated tld/domain identity, overlay the cached verdict.
          return { ...d, ...cached.result, domain: d.domain, tld: d.tld, checking: false, provisional: false };
        }
        return d;
      });
      if (job.cancelled) return;
      setResults(hydrated);
      setLoading(false);

      const domainNames = domains.map((d) => d.domain);

      // Step 2: Fast DNS pre-check — fired in the BACKGROUND (never awaited) so a
      // slow/large DNS batch can't delay the authoritative lookups below.
      // Split into small chunks so the first chunk lands in ~50-100ms.
      // It is a pre-check only: applyFastVerdict never touches a row that has
      // already left Checking (a fast chunk can land AFTER the authoritative
      // batch) and never surfaces an uncertain DNS answer as a verdict.
      const FAST_CHUNK = 10;
      // Only stop the stopwatch if a card actually left "Checking" with a real
      // verdict the user can see. Whether a row flipped is only known inside the
      // state updater, which React runs eagerly only when nothing else is
      // pending — so the flag is read there and the stop is queued as a
      // microtask (markFirstAnswer is idempotent: a double-run updater is harmless).
      const applyFast = (fastMap: Map<string, FastInfo>) => {
        if (job.cancelled || !fastMap.size) return;
        setResults((prev) => {
          let anyConfident = false;
          const next = prev.map((r) => {
            const info = fastMap.get(r.domain);
            if (!info) return r;
            const updated = applyFastVerdict(r, info);
            if (updated !== r) anyConfident = true;
            return updated;
          });
          if (anyConfident && !job.cancelled) queueMicrotask(markFirstAnswer);
          return next;
        });
      };

      // Rows hydrated from the session cache already show their verdict — a
      // DNS pre-check for them has nothing to flip, so don't spend the probes.
      const fastTargets = hydrated.filter((d) => d.checking).map((d) => d.domain);
      for (let i = 0; i < fastTargets.length; i += FAST_CHUNK) {
        const chunk = fastTargets.slice(i, i + FAST_CHUNK);
        void checkDomainsFast(chunk, job.ctl.signal).then(applyFast).catch(() => {});
      }

      // Step 2b: Browser lane — the registry answers the visitor directly.
      // Registry RDAP + DoH from the browser's own (pre-opened) connections,
      // the same two base signals the edge checks first, under the same rules
      // (src/lib/browserLane.ts). Like the fast lane it only fills rows still
      // Checking, and the authoritative wave overwrites it when it lands.
      const checkingNow = new Set(hydrated.filter((d) => d.checking).map((d) => d.domain));
      const applyBrowser = (v: BrowserVerdict) => {
        if (job.cancelled || v.state === "unknown") return;
        setResults((prev) => {
          let flipped = false;
          const next = prev.map((r) => {
            if (r.domain !== v.domain) return r;
            const updated = applyBrowserVerdict(r, v);
            if (updated !== r) flipped = true;
            return updated;
          });
          // A registry answer the user can see is a real first answer (same
          // updater-side flag as the fast lane above).
          if (flipped && !job.cancelled) queueMicrotask(markFirstAnswer);
          return next;
        });
      };
      const browserLane = (targets: string[]) => {
        for (const d of targets) {
          if (!checkingNow.has(d) || !browserLaneEligible(d)) continue;
          void checkInBrowser(d, job.ctl.signal).then(applyBrowser).catch(() => {});
        }
      };

      // Step 3: Authoritative availability + pricing.
      // Strategy: the ~10 most popular TLDs are each sent as their OWN request so
      // every card resolves at its own speed (no waiting for the slowest sibling
      // in a batch). Everything else fans out in parallel batches of 8.
      const BATCH_SIZE = 8;
      const TOP_TLDS = ["com", "io", "net", "org", "ai", "co", "app", "dev", "xyz", "me"];

      const isTop = (d: string) => {
        const tld = d.slice(d.indexOf(".") + 1);
        return TOP_TLDS.includes(tld);
      };

      // Keep only the first occurrence per TLD (base name first when AI variations are on).
      // The first generated domain is the headline card — the typed TLD when the
      // user typed one — and always goes solo, even outside TOP_TLDS: a typed
      // ".tech" used to sit in a batch of eight while the .com card answered
      // first (benchmark 2026-09-10: its verdict landed 480–640 ms later).
      const seenTop = new Set<string>();
      const solo: string[] = [];
      const rest: string[] = [];
      for (const d of domainNames) {
        const tld = d.slice(d.indexOf(".") + 1);
        if ((d === domainNames[0] || isTop(d)) && !seenTop.has(tld)) {
          seenTop.add(tld);
          solo.push(d);
        } else {
          rest.push(d);
        }
      }

      const applyBatch = (slice: string[], resp: AvailabilityResponse) => {
        if (job.cancelled) return;
        // The honest stopwatch stops on the first ANSWER. A batch that never
        // reached the backend (503 / network error) only turns rows into
        // "couldn't reach — Retry"; that is not an answer and must not stop it.
        if (resp.results.size > 0) markFirstAnswer();
        const sliceSet = new Set(slice);
        setResults((prev) =>
          prev.map((r) => {
            const info = resp.results.get(r.domain);
            if (info) {
              const updated = {
                ...r,
                available: info.available,
                checking: false,
                provisional: false,
                gdPrice: info.price,
                premium: info.premium,
                likelyPremium: info.likelyPremium,
                premiumUnverified: info.premiumUnverified,
                uncertain: info.uncertain,
                uncertainReason: info.uncertainReason,
                sldBlocked: info.sldBlocked,
                forSale: info.forSale,
                forSaleVia: info.forSaleVia,
                listingUrl: info.listingUrl,
                reachFailed: false,
              };
              cacheResult(updated);
              return updated;
            }
            // Whole batch failed to reach the backend → stop the spinner and offer
            // Retry instead of leaving the row checking forever (503 case).
            if (!resp.ok && sliceSet.has(r.domain)) {
              return { ...r, checking: false, provisional: false, uncertain: true, reachFailed: true };
            }
            return r;
          })
        );
      };

      const runBatch = async (slice: string[]) => {
        const resp = await checkDomainsAvailability(slice, job.ctl.signal);
        applyBatch(slice, resp);
      };

      // Step 3a: the headline card (typed TLD, else .com) leaves NOW, with the
      // fast lane, unless its label is a premium suspect (see searchLanes.ts).
      // It is the card the stopwatch usually stops on, so it must not sit
      // behind the authoritative debounce; a superseded prefix is aborted by
      // `ctl` like every other in-flight request.
      const headline = earlyHeadline(solo);
      const headlineDone = headline ? runBatch([headline]) : Promise.resolve();
      const laterSolo = headline ? solo.filter((d) => d !== headline) : solo;
      // The browser lane asks the registry for the headline card NOW — also for
      // a short (premium-suspect) label, which the server lane holds back: the
      // browser can still show "taken" at once, and never "available" for it.
      if (solo[0]) browserLane([solo[0]]);

      // Debounce, lane two: wait out the rest of AUTH_DEBOUNCE_MS before the
      // full authoritative wave. If the query moves on meanwhile, this search is
      // cancelled and the wave for the superseded prefix is never sent.
      await new Promise<void>((resolve) => setTimeout(resolve, AUTH_DEBOUNCE_MS - FAST_DEBOUNCE_MS));
      if (job.cancelled) return;

      // The other popular TLDs get their browser answer with the wave, one
      // registry query each, so the whole top row flips at registry speed.
      browserLane(solo.slice(1));

      const restBatches: string[][] = [];
      for (let i = 0; i < rest.length; i += BATCH_SIZE) {
        restBatches.push(rest.slice(i, i + BATCH_SIZE));
      }

      await Promise.all([
        headlineDone,
        // one request per top TLD → each card flips as soon as its own lookup lands
        ...laterSolo.map((d) => runBatch([d])),
        ...restBatches.map(runBatch),
      ]);

      // Step 4: the real price of the card the visitor typed. RDAP + DNS say
      // "registerable", not "at the standard price": registries mark names
      // premium and only the third signal sees it. The base pass escalates
      // short / dictionary suspects; everything else would ship with the TLD's
      // standard price. So once the wave has settled and the visitor is still
      // on this query, the headline card gets one verifying request (cache
      // bypassed for it, pass 2 forced). Skipped when the card is not
      // available, already flagged, or a suspect the wave escalated anyway.
      const headlineCard = solo[0];
      if (headlineCard && !job.cancelled) {
        await new Promise<void>((resolve) => setTimeout(resolve, PREMIUM_VERIFY_DELAY_MS));
        if (job.cancelled) return;
        const row = resultsRef.current.find((r) => r.domain === headlineCard);
        const worthAsking =
          row && !row.checking && row.available && !row.uncertain && !row.provisional &&
          !row.premium && !row.premiumUnverified && !row.likelyPremium && !isPremiumSuspectSld(sldOf(headlineCard));
        if (worthAsking) {
          const resp = await checkDomainsAvailability([headlineCard], job.ctl.signal, { verifyPremium: true });
          if (!job.cancelled && resp.ok) applyBatch([headlineCard], resp);
        }
      }
    };

    run();
    return () => {
      job.cancelled = true;
      job.ctl.abort();
      if (activeJobRef.current === job) activeJobRef.current = null;
    };
  }, [debouncedQuery, aiSuggestions, selectedTlds, markFirstAnswer, cacheResult]);


  useEffect(() => {
    onHasResultsChange?.(results.length > 0);
  }, [results.length, onHasResultsChange]);

  const checkingResults = useMemo(() => results.filter((r) => r.checking), [results]);
  const settledResults = useMemo(() => results.filter((r) => !r.checking), [results]);
  // Price / features / status apply to settled rows only: a row still checking
  // has nothing to filter on yet and would flicker in and out as answers land.
  const passesFilters = useCallback(
    (r: DomainResult) => matchesFilters(deriveCardFacts(r, cheapestByTld.get(r.tld.extension)), filters),
    [cheapestByTld, filters],
  );
  const checkedResults = useMemo(() => settledResults.filter(passesFilters), [settledResults, passesFilters]);
  const hiddenByFilters = settledResults.length - checkedResults.length;
  const availableCount = useMemo(() => checkedResults.filter((r) => r.available && !r.uncertain).length, [checkedResults]);
  const uncertainCount = useMemo(() => checkedResults.filter((r) => r.uncertain && !r.sldBlocked && !r.provisional).length, [checkedResults]);
  const takenCount = useMemo(() => checkedResults.filter((r) => !r.available && (!r.uncertain || r.sldBlocked || r.provisional)).length, [checkedResults]);
  const stillChecking = checkingResults.length > 0;

  const retryDomain = useCallback(async (domain: string) => {
    setResults((prev) => prev.map((r) => (r.domain === domain ? { ...r, checking: true, reachFailed: false } : r)));
    const { ok, results } = await checkDomainsAvailability([domain]);
    setResults((prev) =>
      prev.map((r) => {
        if (r.domain !== domain) return r;
        const info = results.get(domain);
        if (!info) return { ...r, checking: false, provisional: false, uncertain: true, reachFailed: !ok };
        const updated = {
          ...r,
          checking: false,
          provisional: false,
          available: info.available,
          gdPrice: info.price,
          premium: info.premium,
          likelyPremium: info.likelyPremium,
          premiumUnverified: info.premiumUnverified,
          uncertain: info.uncertain,
          uncertainReason: info.uncertainReason,
          sldBlocked: info.sldBlocked,
          forSale: info.forSale,
          forSaleVia: info.forSaleVia,
          listingUrl: info.listingUrl,
          reachFailed: false,
        };
        cacheResult(updated);
        return updated;
      })
    );
  }, [cacheResult]);

  const hasQuery = query.trim().length > 0;

  // The exact TLD the user typed (e.g. "xyz" from "asdsdfsdas.xyz"), if any.
  // That TLD sorts to the very top of each result group so a user searching a
  // full domain sees their exact match first, not buried under .com/.net.
  const typedTld = useMemo(() => {
    const raw = debouncedQuery.toLowerCase().trim();
    if (!raw.includes(".")) return null;
    const parts = raw.split(".").filter(Boolean);
    if (parts.length < 2) return null;
    const ext = parts.slice(1).join(".");
    return TLD_RANK[ext] != null ? ext : null;
  }, [debouncedQuery]);

  // Query-aware ordering: the exact typed TLD first (rank -1), then normal
  // TLD authority. Still stable — never sorts on available/price/uncertain.
  const orderResults = useMemo(() => {
    return (a: DomainResult, b: DomainResult) => {
      if (typedTld) {
        const aExact = a.tld.extension === typedTld ? -1 : 0;
        const bExact = b.tld.extension === typedTld ? -1 : 0;
        if (aExact !== bExact) return aExact - bExact;
      }
      return byTldAuthority(a, b);
    };
  }, [typedTld]);

  const searchBar = (
    <div className="flex w-full min-w-0 flex-1 items-center gap-0.5 rounded-[100px] border border-white/40 bg-white/25 py-[14px] pl-4 pr-4 sm:pl-5 sm:pr-6 [backdrop-filter:blur(64px)] dark:border-white/10 dark:bg-white/[0.05]">
      <div className="hidden md:flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
        <Search className="h-7 w-7 text-primary" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => warmRegistries()}
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
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-toggle ${
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
            <div className="hero-chip hero-chip-text mb-5 inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] sm:text-xs">
              <Zap className="hero-chip-pulse h-3.5 w-3.5 shrink-0 text-aurora-mint" />
              <span className="whitespace-nowrap">First answer under 0.5 s · p95<span className="hidden sm:inline"> — timed live, no asterisks</span></span>
            </div>

            <h1 className="text-gradient mx-auto w-full px-1 text-[clamp(2.25rem,10.5vw,5.7rem)] font-extrabold leading-[1.05] tracking-[-0.04em] sm:leading-[1] sm:tracking-[-0.045em]">
              <span className="block sm:hidden">World's fastest</span>
              <span className="block sm:hidden">domain search.</span>
              <span className="block sm:hidden">Fight us.</span>
              <span className="hidden sm:block whitespace-nowrap">World's fastest</span>
              <span className="hidden sm:block whitespace-nowrap">domain search. Fight us.</span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:mt-6 sm:text-lg md:text-xl">
              Probably the fastest domain search in the universe. Or the second — the timer on screen will tell you which.
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
              <span className="text-muted-foreground"><span className="inline-block min-w-[2.5ch] text-right tabular-nums text-xl font-extrabold text-foreground sm:text-2xl">{results.length}</span> found</span>
              <span className="text-muted-foreground"><span className="inline-block min-w-[2.5ch] text-right tabular-nums text-xl font-extrabold text-available sm:text-2xl">{availableCount}</span> available</span>
              <span className="text-muted-foreground"><span className="inline-block min-w-[2.5ch] text-right tabular-nums text-xl font-extrabold text-muted-foreground/60 sm:text-2xl">{takenCount}</span> taken</span>
              {uncertainCount > 0 && (
                <span className="text-muted-foreground"><span className="inline-block min-w-[2.5ch] text-right tabular-nums text-xl font-extrabold text-amber-500 sm:text-2xl">{uncertainCount}</span> unverified</span>
              )}

              {stopwatch !== "idle" && (
                <LiveStopwatch startRef={typingStopRef} state={stopwatch} finalMs={firstAnswerMs} />
              )}
            </div>

            {hiddenByFilters > 0 && (
              <p className="mb-4 text-center text-xs text-muted-foreground" role="status">
                {hiddenByFilters} {hiddenByFilters === 1 ? "domain" : "domains"} hidden by your filters
                {onResetFilters && (
                  <>
                    {" · "}
                    <button type="button" onClick={onResetFilters} className="underline underline-offset-2 hover:text-foreground">
                      reset filters
                    </button>
                  </>
                )}
              </p>
            )}

            {/* Affiliate disclosure sits where the buy buttons are, not on a page nobody reads first. */}
            <p className="mb-6 text-center text-xs text-muted-foreground">
              Buy links may earn us a commission. Prices are the registrar's own, never marked up.{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>
            </p>

            {/* Available */}
            {availableCount > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-available" />
                <h2 className="text-lg font-bold text-foreground flex-1">Available Domains</h2>
                <div className="flex items-center rounded-xl border border-border p-0.5">
                  <button
                    onClick={() => setViewMode("cards")}
                    aria-label="Card view"
                    aria-pressed={viewMode === "cards"}
                    className={`rounded-lg p-1.5 transition-colors ${viewMode === "cards" ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("compact")}
                    aria-label="Compact list view"
                    aria-pressed={viewMode === "compact"}
                    className={`rounded-lg p-1.5 transition-colors ${viewMode === "compact" ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <div className={viewMode === "compact" ? "list-surface rounded-xl border border-border overflow-hidden" : "space-y-3"}>
              {checkedResults
                .filter((r) => r.available && !r.uncertain)
                .sort(orderResults)
                .map((r) => (
                  <DomainCard
                      key={r.domain}
                      result={r}
                      compact={viewMode === "compact"}
                      onRetry={retryDomain}
                      cheapest={cheapestByTld.get(r.tld.extension)}
                      favorited={favoritedSet.has(r.domain)}
                      onToggleFavorite={handleToggleFavorite}
                    />
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
                      <DomainCard
                      key={r.domain}
                      result={r}
                      compact={viewMode === "compact"}
                      onRetry={retryDomain}
                      cheapest={cheapestByTld.get(r.tld.extension)}
                      favorited={favoritedSet.has(r.domain)}
                      onToggleFavorite={handleToggleFavorite}
                    />
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
                  {checkedResults
                    .filter((r) => r.uncertain && !r.sldBlocked && !r.provisional)
                    .sort(orderResults)
                    .slice(0, 10)
                    .map((r) => (
                      <DomainCard
                      key={r.domain}
                      result={r}
                      compact={viewMode === "compact"}
                      onRetry={retryDomain}
                      cheapest={cheapestByTld.get(r.tld.extension)}
                      favorited={favoritedSet.has(r.domain)}
                      onToggleFavorite={handleToggleFavorite}
                    />
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
                  {checkedResults
                    .filter((r) => !r.available && (!r.uncertain || r.sldBlocked || r.provisional))
                    .sort(orderResults)
                    .slice(0, 10)
                    .map((r) => (
                      <DomainCard
                      key={r.domain}
                      result={r}
                      compact={viewMode === "compact"}
                      onRetry={retryDomain}
                      cheapest={cheapestByTld.get(r.tld.extension)}
                      favorited={favoritedSet.has(r.domain)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                    ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
      {/* One sign-in dialog for the whole list (the cards used to mount one each). */}
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
};

export default DomainSearch;
