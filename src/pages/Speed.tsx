import { Link } from "react-router-dom";
import { Timer, Network, Gauge, ShieldCheck, ArrowRight } from "lucide-react";
import { TrophyIcon } from "@/components/TrophyIcon";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { Button } from "@/components/ui/button";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid, FeatureCard, Section, CalloutBlock } from "@/components/PageKit";
import { StopwatchIcon, KeyboardIcon, BoltIcon } from "@/components/StatIcons";
import LiveBenchmark from "@/components/LiveBenchmark";
import { BenchmarkChart } from "@/components/BenchmarkChart";



const pipeline = [
  {
    step: "01",
    icon: Timer,
    title: "80 ms debounce",
    detail:
      "We fire 80 ms after your last keystroke and count it against ourselves in the timer you see.",
  },
  {
    step: "02",
    icon: Network,
    title: "The registry answers you directly",
    detail:
      "For the popular extensions your browser asks the registry's public RDAP server and DNS-over-HTTPS itself, over connections opened while you were still typing. No cold server in the way: median 0.2 s from the US, 0.3 s from the EU.",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Authoritative pass, per card",
    detail:
      "Our edge re-checks every card — RDAP, DNS and a third signal for the tricky ones — and overwrites the browser's answer. Nothing is cached until this pass agrees. Median 0.4–0.5 s per card.",
  },
  {
    step: "04",
    icon: Gauge,
    title: "Edge cache for the API",
    detail:
      "API and MCP lookups repeated within 60 seconds come from a Cloudflare edge cache in about 0.1 s. First-time lookups run the full live check. Uncertain results are never cached.",
  },
];

// Bar lengths are computed from `ms` by BenchmarkChart (fastest row = 100 %),
// never typed by hand.
// Measured 10 September 2026 (scripts/bench/first-answer.mjs): 150 cold
// visitors from Dallas and 150 from Vienna, each a fresh browser.
const benchmark = [
  {
    name: "DigMyName first answer · US",
    note: "Cold visitor, fresh name, 95th percentile of 150 · Dallas",
    ms: "386 ms",
    us: true,
    tag: "Ours · p95",
  },
  {
    name: "DigMyName first answer · EU",
    note: "Cold visitor, fresh name, 95th percentile of 150 · Vienna",
    ms: "485 ms",
    us: true,
    tag: "Ours · p95",
  },
  {
    name: "Raw registry RDAP",
    note: "Verisign .com from a US client, median — one TLD, no pricing, no UI. The physical floor.",
    ms: "107 ms",
    us: false,
    tag: "Theoretical floor",
  },
  {
    name: "DigMyName full check",
    note: "Availability + premium detection + registrar pricing, per card, median (US 472 ms · EU 358 ms)",
    ms: "472 ms",
    us: true,
    tag: "Ours · median",
  },
  {
    name: "API, repeat within 60 s",
    note: "Cloudflare edge cache hit — not a first-time check",
    ms: "~110 ms",
    us: true,
    tag: "Ours · cached",
  },
];

const Speed = () => {
  return (
    <div className="min-h-screen bg-background">
      <RouteHead path="/speed" />

      <Header />

      <PageMain>
        <PageHeader
          plain
          eyebrow={<Eyebrow live>Timed live on every search</Eyebrow>}
          title={
            <>
              The fastest domain search in the universe. {" "}
              <span className="text-aurora-gradient">Or the second.</span>
            </>
          }
          lede="We are not going to pretend we measured every tool on every planet. So here is the deal: every search on DigMyName runs a stopwatch. It starts on your last keystroke and stops the moment the first answer hits the screen. The number we quote is the 95th percentile of 300 cold visits from two continents, not our best run. Find something faster and we will put it at the top of this page ourselves."
        >
          <StatGrid cols={3}>
            <Stat value="<0.5" label="s · first answer, p95" accent="mint" icon={StopwatchIcon} />
            <Stat value="80" label="ms · debounce (ours)" accent="violet" icon={KeyboardIcon} />
            <Stat value="≈0.5" label="s · full check, median" icon={BoltIcon} />
          </StatGrid>

        </PageHeader>


        {/* Claim */}
        <CalloutBlock
          variant="accent"
          className="!mt-6"
          icon={() => <TrophyIcon className="h-full w-full" />}
          iconVariant="hero"
          title="Beat our number, take the crown"
          body={
            <>
              Show us a faster public lookup and we'll feature your time here with full credit and a link back.
              <span className="mt-2 block">
                As of September 2026: first answer under 0.5 s at the 95th percentile for a cold visitor — 386 ms
                from the US, 485 ms from the EU, 300 of 300 under a second. These are everyday numbers, not a lab
                result — the stopwatch on your screen is the real proof, and it keeps us honest.
              </span>
            </>
          }
          action={
            <Button asChild variant="gradient" size="lg" className="w-full shrink-0 text-lg md:w-auto">
              <Link to="/">Run the timer</Link>
            </Button>
          }
        />



        {/* What the timer includes */}
        <Section
          title="What the timer includes"
          lede="The stopwatch starts at your final keystroke and stops when the first card paints — whichever lane delivers it."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {pipeline.map((step) => (
              <FeatureCard
                key={step.title}
                icon={step.icon}
                index={step.step}
                title={step.title}
              >
                {step.detail}
              </FeatureCard>
            ))}
          </div>
        </Section>

        <LiveBenchmark />

        {/* Benchmarks */}
        <Section

          title="Reference numbers"
          lede="150 cold visitors from Dallas and 150 from Vienna, 10 September 2026 — each a fresh browser with no cache and no open connections. Lower is better. API lookups repeated within 60 seconds come from the edge cache in about 0.1 s; first-time API lookups run the full live check (about half a second, under 0.9 s at p95)."
        >
          <BenchmarkChart rows={benchmark} />

          <p className="mt-3 text-xs text-muted-foreground">
            Your own numbers will differ with distance, network and TLD — which is exactly why the timer in the
            app measures your session, not ours.
          </p>
        </Section>

        {/* Honesty */}
        <Section title="The small print on “fastest”">
          <p className="max-w-none text-muted-foreground">
            Nobody can prove a universal latency record, and anybody who states one flat-out is selling you
            something. Latency depends on where you are, which TLD you query and whether the answer was cached.
            So we make the loud claim and then hand you the stopwatch to check it. If we are second, the number
            on your screen will say so — and we will keep shaving it down until we are not.
          </p>
        </Section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/">
              Try it and watch the timer
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/how-it-works">How the checks work</Link>
          </Button>
        </div>
      </PageMain>
    </div>
  );
};

export default Speed;
