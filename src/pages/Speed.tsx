import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Zap, Timer, Network, Gauge, ShieldCheck, ArrowRight } from "lucide-react";
import { LottieAward } from "@/components/LottieAward";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid, FeatureCard } from "@/components/PageKit";


const pipeline = [
  {
    step: "01",
    icon: Timer,
    title: "80 ms debounce",
    detail:
      "We fire 80 ms after your last keystroke. Long enough to avoid a request storm, short enough that you never feel it — and we count it against ourselves in the timer you see on screen.",
  },
  {
    step: "02",
    icon: Network,
    title: "Parallel DNS pre-check",
    detail:
      "One edge call resolves NS/A records for every candidate at once. Typically 30–80 ms, and it is what flips most cards to a preliminary available / taken state.",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Authoritative pass, per card",
    detail:
      "RDAP against each TLD's own registry, in parallel. The ten most popular extensions each get their own request, so no card waits for a slower sibling. Prices arrive in the same response.",
  },
  {
    step: "04",
    icon: Gauge,
    title: "Hot cache at the edge",
    detail:
      "Recent lookups are served from a short-lived edge cache, so repeated and popular queries return in single-digit milliseconds — without ever going stale enough to mislead you.",
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
    name: "DigMyName full check",
    note: "Availability + premium detection + registrar pricing",
    ms: "~0.4–1.6 s",
    bar: 55,
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
          eyebrow={<Eyebrow live>Timed live on every search</Eyebrow>}
          title={
            <>
              <span className="whitespace-nowrap">The fastest domain search in the universe.</span>
              <span className="text-aurora-gradient"> Or the second.</span>
            </>
          }
          lede="We are not going to pretend we measured every tool on every planet. So here is the deal: every search on DigMyName runs a stopwatch. It starts on your last keystroke and stops the moment the first answer hits the screen. Find something faster and we will put it at the top of this page ourselves."
        >
          <StatGrid cols={3}>
            <Stat value="~170" label="ms · first answer" accent="mint" />
            <Stat value="80" label="ms · debounce (ours)" accent="violet" />
            <Stat value="50+" label="TLDs · in parallel" />
          </StatGrid>

        </PageHeader>


        {/* Claim */}
        <section className="mt-6 flex flex-row flex-wrap items-center justify-between gap-5 rounded-xl border border-border/60 p-8">
          <div className="flex flex-1 items-center gap-5 min-w-0">
            <LottieAward className="h-20 w-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Beat our number, take the crown</h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Show us a faster public result and we'll feature your winning time here—with full credit.
              </p>
            </div>
          </div>
          <Button asChild variant="gradient" size="lg" className="shrink-0">
            <Link to="/">Run the timer</Link>
          </Button>
        </section>

        {/* Timer scope */}
        <section className="mt-16">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">What the timer includes</h2>
            <div className="hidden h-px flex-1 bg-gradient-to-r from-border to-transparent sm:block" />
          </div>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Everything. The stopwatch starts at your final keypress, so our own debounce, your network round
            trip, the lookup and the React render are all inside the number. It is the time you actually
            waited — not the time our server spent.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "Debounce after the last keystroke (80 ms)",
              "Round trip from your browser to our edge",
              "The DNS / RDAP lookup itself",
              "Painting the first resolved card",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 border-b border-border/40 px-4 py-3 text-sm last:border-0"
              >
                <Zap className="h-4 w-4 shrink-0 text-primary" />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline */}
        <section className="mt-16">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">The pipeline</h2>
            <div className="hidden h-px flex-1 bg-gradient-to-r from-border to-transparent sm:block" />
            <span className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:block">
              Parallel execution
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
        </section>

        {/* Benchmarks */}
        <section className="mt-16">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Reference numbers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Single datacenter connection, August 2026. Lower is better.
              </p>
            </div>
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Measured, not marketed
            </span>
          </div>

          <div className="mt-6 overflow-hidden surface-card">
            <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border/60 bg-muted/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:grid-cols-[1fr_140px_120px]">
              <div>Target</div>
              <div className="hidden sm:block">Latency</div>
              <div className="text-right">Relative</div>
            </div>
            {benchmark.map((row) => (
              <div
                key={row.name}
                className={`grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/40 px-5 py-5 transition-colors last:border-0 sm:grid-cols-[1fr_140px_180px] ${
                  row.us ? "bg-primary/[0.05]" : ""
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                        row.us
                          ? "border-primary/30 bg-primary/15 text-primary"
                          : "border-border/60 bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {row.tag}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.note}</div>
                </div>
                <div className="font-mono text-lg font-bold tabular-nums text-available">
                  {row.ms}
                </div>
                <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted/30">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        row.us
                          ? "bg-gradient-to-r from-primary to-aurora-violet shadow-[0_0_12px_hsl(var(--primary)/0.45)]"
                          : "bg-gradient-to-r from-muted-foreground/60 to-muted-foreground/30"
                      }`}
                      style={{ width: `${row.bar}%` }}
                    />
                  </div>
                  <span className="min-w-[2.5rem] text-right font-mono text-lg font-bold tabular-nums text-available">
                    {row.bar}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Your own numbers will differ with distance, network and TLD — which is exactly why the timer in the
            app measures your session, not ours.
          </p>
        </section>

        {/* Honesty */}
        <section className="mt-16 surface-card p-6 sm:p-8">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">The small print on “fastest”</h2>
          <p className="mt-3 max-w-none text-muted-foreground">
            Nobody can prove a universal latency record, and anybody who states one flat-out is selling you
            something. Latency depends on where you are, which TLD you query and whether the answer was cached.
            So we make the loud claim and then hand you the stopwatch to check it. If we are second, the number
            on your screen will say so — and we will keep shaving it down until we are not.
          </p>
        </section>

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
