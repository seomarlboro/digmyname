import { useEffect, useRef, useState } from "react";

export interface BenchmarkRow {
  name: string;
  note: string;
  ms: string;
  bar: number;
  us: boolean;
  tag: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// "~170 ms" -> { prefix: "~", value: 170, suffix: " ms" }
function parseMs(ms: string): { prefix: string; value: number | null; suffix: string } {
  const m = ms.match(/^(\D*)(\d+)(.*)$/);
  if (!m) return { prefix: "", value: null, suffix: ms };
  return { prefix: m[1], value: parseInt(m[2], 10), suffix: m[3] };
}

function useCountUp(target: number | null, run: boolean, duration = 750): number {
  const reduce = prefersReducedMotion();
  const [val, setVal] = useState<number>(target != null && reduce ? target : 0);
  useEffect(() => {
    if (target == null) return;
    if (reduce) { setVal(target); return; }
    if (!run) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration, reduce]);
  return val;
}

const BenchmarkRowView = ({ row, run, delay }: { row: BenchmarkRow; run: boolean; delay: number }) => {
  const { prefix, value, suffix } = parseMs(row.ms);
  const reduce = prefersReducedMotion();
  const [started, setStarted] = useState(reduce);
  useEffect(() => {
    if (!run) return;
    if (reduce) { setStarted(true); return; }
    const id = window.setTimeout(() => setStarted(true), delay);
    return () => window.clearTimeout(id);
  }, [run, delay, reduce]);

  const count = useCountUp(value, started);
  const pct = useCountUp(row.bar, started);
  const width = started ? row.bar : 0;

  return (
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
      <div className="whitespace-nowrap font-mono text-lg font-bold tabular-nums text-available">
        {value == null ? row.ms : `${prefix}${count}${suffix}`}
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10 sm:w-64 sm:flex-none">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${
              row.us
                ? "bg-gradient-to-r from-aurora-mint to-aurora-violet shadow-[0_0_16px_hsl(var(--aurora-mint)/0.55)]"
                : "bg-muted-foreground/40"
            }`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className="min-w-[2.5rem] text-right font-mono text-lg font-bold tabular-nums text-available">
          {pct}%
        </span>
      </div>
    </div>
  );
};

export const BenchmarkChart = ({ rows }: { rows: BenchmarkRow[] }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setInView(true); obs.disconnect(); }
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
        <BenchmarkRowView key={row.name} row={row} run={inView} delay={i * 130} />
      ))}
    </div>
  );
};
