import { useState } from "react";
import { ChevronDown, ChevronUp, Timer, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = "https://api.digmyname.com/functions/v1/public-api/check?domain=";
const RUNS = 3;
const TIMEOUT_MS = 10_000;

type LogEntry = { label: string; ms: number };

const randomDomain = () =>
  `bench-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.com`;

async function timedCheck(domain: string): Promise<number> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(API + encodeURIComponent(domain), {
      signal: controller.signal,
    });
    await res.json();
    return performance.now() - start;
  } finally {
    window.clearTimeout(timer);
  }
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return { median, min: sorted[0], max: sorted[sorted.length - 1] };
};

const ms = (n: number) => Math.round(n).toLocaleString();

const LiveBenchmark = () => {
  const [open, setOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [cold, setCold] = useState<number[] | null>(null);
  const [cached, setCached] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setLog([]);
    setCold(null);
    setCached(null);

    const coldTimes: number[] = [];
    const cachedTimes: number[] = [];

    try {
      // Warm-up — discarded (pays the TLS handshake).
      await timedCheck(randomDomain());

      const domains = Array.from({ length: RUNS }, randomDomain);

      for (let i = 0; i < domains.length; i++) {
        const t = await timedCheck(domains[i]);
        coldTimes.push(t);
        setLog((l) => [...l, { label: `cold #${i + 1}`, ms: t }]);
      }
      setCold([...coldTimes]);

      for (let i = 0; i < domains.length; i++) {
        const t = await timedCheck(domains[i]);
        cachedTimes.push(t);
        setLog((l) => [...l, { label: `cached #${i + 1}`, ms: t }]);
      }
      setCached([...cachedTimes]);
    } catch {
      setCold(null);
      setCached(null);
      setError("Couldn't reach the edge — check your connection and try again");
    } finally {
      setRunning(false);
    }
  };

  const coldStats = cold && cold.length ? stats(cold) : null;
  const cachedStats = cached && cached.length ? stats(cached) : null;

  return (
    <section className="surface-card-lg mt-14 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/10 sm:px-6"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <Timer className="h-5 w-5 shrink-0 text-mint" />
          <span className="section-title">Measure from your location</span>
        </span>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-5 py-6 sm:px-6">
          <h3 className="text-lg font-bold sm:text-xl">Measured from YOUR location</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your network, your distance to our single datacenter — not our numbers, yours.
          </p>

          <div className="mt-5">
            <Button onClick={run} disabled={running} size="lg" variant="gradient" className="text-black [&_*]:text-black">
              {running ? "Measuring…" : cold || error ? "Run again" : "Run the benchmark"}
            </Button>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-5 sm:p-6">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Cold — first-time lookup
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-4xl font-bold tabular-nums text-mint sm:text-5xl">
                  {coldStats ? `${ms(coldStats.median)} ms` : "— ms"}
                </span>
                {coldStats && (
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    ({ms(coldStats.min)}–{ms(coldStats.max)} ms)
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Full live pipeline · a domain nobody has looked up before
              </p>
            </div>

            <div className="rounded-2xl border border-border/40 bg-muted/5 p-4 sm:p-5">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Cached — repeat within 60s
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-muted-foreground sm:text-2xl">
                {cachedStats ? `${ms(cachedStats.median)} ms` : "— ms"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Served from the Cloudflare edge cache · a repeat lookup, NOT a typical first answer.
              </p>
            </div>
          </div>

          {/* Live log */}
          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Live log
            </div>
            {log.length === 0 ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground/70">
                {running ? "warming up…" : "no requests yet"}
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {log.map((entry, i) => (
                  <li
                    key={`${entry.label}-${i}`}
                    className="flex items-center justify-between gap-4 border-b border-border/30 py-1.5 font-mono text-xs last:border-0"
                  >
                    <span className="text-muted-foreground">{entry.label}</span>
                    <span className="tabular-nums text-foreground">{ms(entry.ms)} ms</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default LiveBenchmark;
