import { useEffect, useRef, useState } from "react";

export interface BenchmarkRow {
  name: string;
  note: string;
  /** Display string, e.g. "~170 ms". The numeric part drives the bar. */
  ms: string;
  us: boolean;
  tag: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// "~170 ms" -> { prefix: "~", value: 170, suffix: " ms" }
export function parseMs(ms: string): { prefix: string; value: number | null; suffix: string } {
  const m = ms.match(/^(\D*)(\d+)(.*)$/);
  if (!m) return { prefix: "", value: null, suffix: ms };
  return { prefix: m[1], value: parseInt(m[2], 10), suffix: m[3] };
}

/**
 * Bar length derived from the latency itself: the fastest row is 100 % and every
 * other row is `fastest / value`, so a row that is twice as slow gets half the
 * bar. Rows without a parsable number get 0. Never hand-typed — on a page whose
 * point is measurement honesty the chart must be computed from the figures it shows.
 */
export function relativeWidths(rows: BenchmarkRow[]): number[] {
  const values = rows.map((r) => parseMs(r.ms).value);
  const fastest = Math.min(...values.filter((v): v is number => v != null && v > 0));
  if (!Number.isFinite(fastest)) return rows.map(() => 0);
  return values.map((v) => (v == null || v <= 0 ? 0 : Math.round((fastest / v) * 100)));
}

const BenchmarkRowView = ({ row, pct, animate, delay }: { row: BenchmarkRow; pct: number; animate: boolean; delay: number }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-4 border-b border-border/40 px-5 py-5 transition-colors last:border-0 hover:bg-muted/10 sm:grid-cols-[1fr_140px_320px] sm:items-center">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold sm:text-lg">{row.name}</span>
        <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {row.tag}
        </span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{row.note}</div>
    </div>
    <div className="whitespace-nowrap font-mono text-lg font-bold tabular-nums text-available">{row.ms}</div>
    <div className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10 sm:w-64 sm:flex-none">
        <div
          className={`h-full origin-left rounded-full ${animate ? "benchmark-bar-grow" : ""} ${
            row.us
              ? "bg-gradient-to-r from-aurora-mint to-aurora-violet shadow-[0_0_16px_hsl(var(--aurora-mint)/0.55)]"
              : "bg-muted-foreground/40"
          }`}
          style={{ width: `${pct}%`, animationDelay: `${delay}ms` }}
        />
      </div>
      <span className="min-w-[2.5rem] text-right font-mono text-lg font-bold tabular-nums text-available">{pct}%</span>
    </div>
  </div>
);

/**
 * Reference latency table. The final numbers and bar lengths are rendered
 * immediately (a crawler or a screenshot sees real figures, never zeros); the
 * only motion is a one-shot grow of the bars when the table scrolls into view,
 * skipped under prefers-reduced-motion.
 */
export const BenchmarkChart = ({ rows }: { rows: BenchmarkRow[] }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [animate, setAnimate] = useState(false);
  const widths = relativeWidths(rows);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setAnimate(true);
          obs.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="surface-card-lg mint-glow-sm overflow-hidden">
      <div className="hidden grid-cols-[1fr_140px_320px] gap-4 border-b border-border/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:grid">
        <div>Target</div>
        <div className="hidden sm:block">Latency</div>
        <div className="text-right">Relative</div>
      </div>
      {rows.map((row, i) => (
        <BenchmarkRowView key={row.name} row={row} pct={widths[i]} animate={animate} delay={i * 130} />
      ))}
    </div>
  );
};
