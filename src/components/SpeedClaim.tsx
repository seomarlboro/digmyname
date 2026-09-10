import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/PageKit";

/**
 * The /speed claim: a two-column accent panel in the site's own language —
 * dark glass with the aurora glow behind it, headline + CTA on the left, the
 * measured number as the visual on the right, and the rules of the challenge
 * (what counts, how to submit, where the evidence is) in a strip below.
 * Numbers come from the cold-visitor benchmark of 10 September 2026
 * (scripts/bench/first-answer.mjs, results under docs/bench).
 */
const REPO = "https://github.com/seomarlboro/digmyname";
const ISSUE_URL =
  `${REPO}/issues/new?` +
  new URLSearchParams({
    title: "Faster lookup: <tool>",
    labels: "speed-challenge",
    body: "Tool:\nWhere measured (city, network):\nVisits:\np50 / p95:\nHow you measured (script, video or HAR):\n",
  }).toString();

const FACTS = [
  { label: "United States", value: "386", unit: "ms", hint: "p95, Dallas" },
  { label: "European Union", value: "485", unit: "ms", hint: "p95, Vienna" },
  { label: "Under one second", value: "300", unit: "/ 300", hint: "every cold visit" },
  { label: "Measured", value: "Sept 2026", unit: "", hint: "150 + 150 fresh browsers" },
] as const;

const RULES = [
  {
    title: "What counts",
    text: "A public domain-availability lookup, measured the same way: fresh browser, a name nobody has checked, the clock from the last keystroke to the first visible verdict, at least 100 visits, p95.",
  },
  {
    title: "How to take part",
    text: "Run our script against your tool or record it. Open a GitHub issue with the numbers and the method; we re-run it and publish the result either way. Beat us and you take the top of this page, with credit and a link back.",
    links: [
      { label: "Open an issue", href: ISSUE_URL },
      { label: "hello@digmyname.com", href: "mailto:hello@digmyname.com?subject=Speed%20challenge" },
    ],
  },
  {
    title: "The evidence",
    text: "Every number here has a raw file behind it: each visit, its stopwatch reading and which lane answered. The script is in the repo, and the US runs live in GitHub Actions.",
    links: [
      { label: "Raw results", href: `${REPO}/tree/main/docs/bench` },
      { label: "Benchmark script", href: `${REPO}/blob/main/scripts/bench/first-answer.mjs` },
      { label: "US runs", href: `${REPO}/actions/workflows/bench-first-answer.yml` },
    ],
  },
] as const;

export function SpeedClaim() {
  return (
    <section className="claim-panel mt-8 sm:mt-10" aria-labelledby="speed-claim-title">
      <div className="relative grid gap-10 p-7 sm:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16 lg:p-14 lg:pb-12">
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
          <div className="mt-3 flex items-baseline gap-2 font-mono font-bold tracking-tight text-foreground">
            <span className="text-6xl leading-none sm:text-7xl">&lt;0.5</span>
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

        {/* The rules: what counts, how to submit, where the evidence is. */}
        <div className="grid gap-6 border-t border-border/60 pt-8 sm:grid-cols-3 sm:gap-8 lg:col-span-2">
          {RULES.map((r) => (
            <div key={r.title} className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
              {"links" in r && (
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {r.links.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        target={l.href.startsWith("http") ? "_blank" : undefined}
                        rel={l.href.startsWith("http") ? "noreferrer" : undefined}
                        className="inline-flex items-center gap-1 text-sm font-medium text-aurora-link hover:underline"
                      >
                        {l.label}
                        {l.href.startsWith("http") && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SpeedClaim;
