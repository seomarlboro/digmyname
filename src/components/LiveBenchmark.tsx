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
  const [showLog, setShowLog] = useState(false);
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
    <section className="surface-card-lg mt-10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-muted/10"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <Timer className="h-4 w-4 shrink-0 text-mint" />
          <span className="section-title">Measured from YOUR location</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Your network, your distance to our single datacenter — not our numbers, yours.
            </p>
            <Button
              onClick={run}
              disabled={running}
              variant="gradient"
              className="shrink-0 text-black [&_*]:text-black"
            >
              {running ? "Measuring…" : cold || error ? "Run again" : "Run the benchmark"}
            </Button>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Cold vs cached — side by side */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-aurora-mint/30 bg-muted/10 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Cold — first-time lookup
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-3xl font-bold tabular-nums text-mint">
                  {coldStats ? `${ms(coldStats.median)} ms` : "— ms"}
                </span>
                {coldStats && (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    ({ms(coldStats.min)}–{ms(coldStats.max)} ms)
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Full live pipeline · never-seen domain
              </p>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/5 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Cached — repeat
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-muted-foreground">
                {cachedStats ? `${ms(cachedStats.median)} ms` : "— ms"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Repeat within 60s · Cloudflare edge · not a typical first answer
              </p>
            </div>
          </div>

          {/* Live log — proof, not hero */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowLog((s) => !s)}
              className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {running && log.length === 0
                ? "warming up…"
                : `${showLog ? "hide" : "show"} ${log.length} request${log.length === 1 ? "" : "s"}`}
            </button>
            {showLog && log.length > 0 && (
              <ul className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-border/40 bg-muted/5 px-3 py-1.5">
                {log.map((entry, i) => (
                  <li
                    key={`${entry.label}-${i}`}
                    className="flex items-center justify-between gap-4 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    <span>{entry.label}</span>
                    <span className="tabular-nums text-foreground/80">{ms(entry.ms)} ms</span>
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

