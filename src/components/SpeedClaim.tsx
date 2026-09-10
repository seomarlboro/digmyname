import { Link } from "react-router-dom";
import { ArrowUpRight, FileCheck2, Ruler, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow, FeatureCard, Section } from "@/components/PageKit";

/**
 * The /speed claim: a two-column accent panel in the site's own language —
 * glass surface, headline + CTAs on the left, the measured number as the
 * visual on the right. The rules of the challenge follow as a regular section
 * built from the same FeatureCard the pipeline uses.
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
/** The public thread where runs are posted and discussed; null until it exists. */
const THREAD_URL: string | null = null;

const FACTS = [
  { label: "United States", value: "386 ms" },
  { label: "European Union", value: "485 ms" },
  { label: "Under one second", value: "300 of 300" },
  { label: "Measured", value: "Sept 2026" },
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
            <Button asChild variant="gradient" size="lg">
              <Link to="/">Run the timer</Link>
            </Button>
            <Button asChild variant="ghost-mint" size="lg">
              <a href="#challenge">How to take part</a>
            </Button>
          </div>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">First answer · p95</div>
          <div className="mt-3 font-mono text-6xl font-bold leading-none tracking-tight text-foreground sm:text-7xl">&lt;0.5 s</div>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-border/60 pt-6">
            {FACTS.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 font-mono text-xl tabular-nums text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-aurora-link hover:underline">
    {children}
    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
  </a>
);

/** The rules — three cards in the page's own FeatureCard, one idea each. */
export function SpeedChallenge() {
  return (
    <div id="challenge" className="scroll-mt-24">
      <Section title="How the challenge works" lede="Same clock, same conditions, public numbers on both sides.">
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard icon={Ruler} index="01" title="What counts">
            A public lookup, timed our way: fresh browser, a name nobody has checked, last keystroke to first verdict,
            100+ visits, p95.
          </FeatureCard>
          <FeatureCard icon={Send} index="02" title="How to take part">
            Post your run with the tool, the numbers and how you measured. We re-run it and publish either way.
            <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {THREAD_URL && <ExternalLink href={THREAD_URL}>Join the thread on X</ExternalLink>}
              <ExternalLink href={ISSUE_URL}>Open a GitHub issue</ExternalLink>
            </span>
          </FeatureCard>
          <FeatureCard icon={FileCheck2} index="03" title="The evidence">
            Every visit, its stopwatch reading and which lane answered, in raw files. The script and the US runs are
            public too.
            <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <ExternalLink href={`${REPO}/tree/main/docs/bench`}>Raw results</ExternalLink>
              <ExternalLink href={`${REPO}/blob/main/scripts/bench/first-answer.mjs`}>Script</ExternalLink>
              <ExternalLink href={`${REPO}/actions/workflows/bench-first-answer.yml`}>US runs</ExternalLink>
            </span>
          </FeatureCard>
        </div>
      </Section>
    </div>
  );
}

export default SpeedClaim;
