import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/PageKit";

/**
 * The /speed claim: a two-column accent panel in the site's own language —
 * dark glass with the aurora glow behind it, headline + CTA on the left, the
 * measured number as the visual on the right. Numbers come from the
 * cold-visitor benchmark of 10 September 2026 (scripts/bench/first-answer.mjs).
 */
const FACTS = [
  { label: "United States", value: "386", unit: "ms", hint: "p95, Dallas" },
  { label: "European Union", value: "485", unit: "ms", hint: "p95, Vienna" },
  { label: "Under one second", value: "300", unit: "/ 300", hint: "every cold visit" },
  { label: "Measured", value: "Sept 2026", unit: "", hint: "150 + 150 fresh browsers" },
] as const;

export function SpeedClaim() {
  return (
    <section className="claim-panel mt-8 sm:mt-10" aria-labelledby="speed-claim-title">
      <div className="relative grid gap-10 p-7 sm:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16 lg:p-14">
        <div className="min-w-0">
          <Eyebrow>Open challenge</Eyebrow>
          <h2
            id="speed-claim-title"
            className="mt-5 font-display text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]"
          >
            Beat our number, <span className="text-aurora-gradient">take the crown.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Show us a faster public lookup and we'll feature your time here with full credit and a link back.
          </p>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground/90 sm:text-base">
            Everyday numbers, not a lab result — the stopwatch on your screen is the real proof, and it keeps us honest.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="gradient" size="lg" className="text-base">
              <Link to="/">Run the timer</Link>
            </Button>
            <Button asChild variant="ghost-mint" size="lg" className="text-base">
              <a href="#how-we-measure">How we measure</a>
            </Button>
          </div>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            First answer · cold visitor · p95
          </div>
          <div className="mt-3 flex items-baseline gap-2 font-mono font-bold tracking-tight">
            <span className="text-aurora-gradient text-6xl leading-none sm:text-7xl">&lt;0.5</span>
            <span className="text-2xl text-muted-foreground sm:text-3xl">s</span>
          </div>
          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border/60 pt-6">
            {FACTS.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground sm:text-xl">
                  {f.value}
                  {f.unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{f.unit}</span>}
                </dd>
                <dd className="text-xs text-muted-foreground/80">{f.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export default SpeedClaim;
