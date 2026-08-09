import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Timer, Network, Gauge, ShieldCheck, ArrowRight } from "lucide-react";
import { LottieAward } from "@/components/LottieAward";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid, FeatureCard, Section, CalloutBlock } from "@/components/PageKit";
import { StopwatchIcon, KeyboardIcon, BoltIcon } from "@/components/StatIcons";
import LiveBenchmark from "@/components/LiveBenchmark";



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
    title: "Parallel DNS pre-check",
    detail:
      "One edge call resolves NS/A records for every candidate at once, typically 30–80 ms.",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Authoritative pass, per card",
    detail:
      "RDAP against each TLD registry in parallel. No card waits for a slower sibling.",
  },
  {
    step: "04",
    icon: Gauge,
    title: "Cloudflare edge cache",
    detail:
      "Repeat lookups inside a 60-second window are served from a real Cloudflare edge cache in ~70 ms, bypassing the origin entirely. First-time lookups still run the full live pipeline.",
  },
];

const benchmark = [
  {
    name: "DigMyName /fast",
    note: "Availability signal across the full TLD set",
    ms: "~170 ms",
    bar: 92,
    us: true,
    tag: "Ours",
  },
  {
    name: "Raw registry RDAP",
    note: "Verisign .com — one TLD, no pricing, no UI. The physical floor.",
    ms: "~47 ms",
    bar: 100,
    us: false,
    tag: "Theoretical floor",
  },
  {
    name: "DigMyName cached (repeat)",
    note: "Repeat lookup within 60s — served from the Cloudflare edge cache, not a first-time check",
    ms: "~70 ms",
    bar: 88,
    us: true,
    tag: "Ours · cached",
  },
  {
    name: "DigMyName full check",
    note: "Availability + premium detection + registrar pricing · typically under 1s",
    ms: "~370 ms",
    bar: 78,
    us: true,
    tag: "Ours",
  },
];

const Speed = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Fastest domain search in the universe (or second) — DigMyName</title>
        <meta
          name="description"
          content="We think we run the fastest domain search in the universe. If we're second, the timer on every search will tell you. Here is the full methodology, pipeline and benchmarks."
        />
        <link rel="canonical" href="https://digmyname.com/speed" />
        <meta property="og:title" content="Fastest domain search in the universe (or second)" />
        <meta
          property="og:description"
          content="A live, honest timer on every domain search — and the full methodology behind it."
        />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

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
          lede="We are not going to pretend we measured every tool on every planet. So here is the deal: every search on DigMyName runs a stopwatch. It starts on your last keystroke and stops the moment the first answer hits the screen. Find something faster and we will put it at the top of this page ourselves."
        >
          <StatGrid cols={3}>
            <Stat value="~170" label="ms · first answer" accent="mint" icon={StopwatchIcon} />
            <Stat value="80" label="ms · debounce (ours)" accent="violet" icon={KeyboardIcon} />
            <Stat value="~370" label="ms · full pipeline (median)" icon={BoltIcon} />
          </StatGrid>

        </PageHeader>


        {/* Claim */}
        <CalloutBlock
          variant="accent"
          className="!mt-6"
          icon={() => <LottieAward className="h-full w-full" />}
          iconVariant="hero"
          title="Beat our number, take the crown"
          body={
            <>
              Show us a faster public lookup and we'll feature your time here with full credit and a link back.
              <span className="mt-2 block">
                As of August 2026: ~370 ms typical full check from our single datacenter. These are everyday
                numbers, not a lab result — the stopwatch on your screen is the real proof, and it keeps us honest.
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
          lede="The stopwatch starts at your final keystroke and stops when the first card paints."
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
          lede="Single datacenter connection, August 2026. Lower is better. Repeat lookups within a 60-second window are served from a global edge cache in ~70 ms — first-time lookups run the full live pipeline (~370 ms typical)."
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
