import { useEffect, useRef, type MutableRefObject } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

interface LiveStopwatchProps {
  /** performance.now() of the last keystroke, or null once the clock stopped. */
  startRef: MutableRefObject<number | null>;
  state: "running" | "done";
  /** Final reading once the first answer landed. */
  finalMs: number | null;
}

/**
 * The honest stopwatch pill. While running it paints the elapsed milliseconds
 * straight into a text node from requestAnimationFrame — no React state, no
 * re-render of the results list behind it. (The previous version stored the
 * tick in state and re-rendered every card 60× a second, which on prod pushed
 * the fast lane from +80 ms to +970 ms and the authoritative lane to +1.9 s.)
 */
export default function LiveStopwatch({ startRef, state, finalMs }: LiveStopwatchProps) {
  const digitsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (state !== "running") return;
    let raf = 0;
    const tick = () => {
      const start = startRef.current;
      if (start == null) return;
      if (digitsRef.current) digitsRef.current.textContent = String(Math.round(performance.now() - start));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, startRef]);

  return (
    <Link
      to="/speed"
      title="How we measure: clock starts on your last keystroke, stops on the first answer"
      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-live={state === "done" ? "polite" : "off"}
    >
      <Zap className="h-3.5 w-3.5 text-primary" />
      <span className="tabular-nums font-semibold text-foreground">
        <span ref={digitsRef}>{finalMs ?? 0}</span> ms
      </span>
      <span className="hidden sm:inline">first answer</span>
    </Link>
  );
}
