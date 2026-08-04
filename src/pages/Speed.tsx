import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Zap, Timer, Network, Gauge, ShieldCheck, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const pipeline = [
  {
    icon: Timer,
    title: "80 ms debounce",
    detail:
      "We wait just 80 ms after your last keystroke before firing. Long enough to avoid a request storm, short enough that you never feel it. This delay is counted against us in the timer you see on screen.",
  },
  {
    icon: Network,
    title: "Parallel DNS pre-check",
    detail:
      "A single edge call resolves NS/A records for every candidate at once. Typically 30–80 ms, and it is what flips most cards to a preliminary available / taken state.",
  },
  {
    icon: ShieldCheck,
    title: "Authoritative pass, per card",
    detail:
      "RDAP against each TLD's own registry runs in parallel — the ten most popular extensions each get their own request, so no card waits for a slower sibling. Prices arrive with the same response.",
  },
  {
    icon: Gauge,
    title: "Hot cache",
    detail:
      "Recent lookups are served from a short-lived cache at the edge, so repeated and popular queries return in single-digit milliseconds without ever going stale enough to mislead.",
  },
];

const benchmark = [
  { name: "Raw registry RDAP (Verisign, .com)", ms: "~47 ms", note: "Theoretical floor — one TLD, no pricing, no UI" },
  { name: "DigMyName /fast (warm)", ms: "~170 ms", note: "Availability signal across the full TLD set" },
  { name: "DigMyName full check (warm)", ms: "~0.4–1.6 s", note: "Availability + premium detection + registrar pricing" },
];

const Speed = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>How fast is DigMyName? Measured domain search speed</title>
        <meta
          name="description"
          content="We show a live timer on every search: the clock starts on your last keystroke and stops on the first answer. Here is exactly how DigMyName measures domain search speed."
        />
        <link rel="canonical" href="https://digmyname.com/speed" />
        <meta property="og:title" content="How fast is DigMyName? Measured domain search speed" />
        <meta
          property="og:description"
          content="A live, honest timer on every domain search — and the full methodology behind it."
        />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <Header />

      <main className="container mx-auto max-w-[968px] px-4 pb-24 pt-12">
        <Badge variant="secondary" className="mb-4 gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Measured, not marketed
        </Badge>

        <h1 className="text-gradient text-4xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-5xl md:text-6xl">
          Speed you can check yourself
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Plenty of tools claim to be the fastest. We would rather show you a number. Every search on DigMyName
          runs a live timer: it starts on your last keystroke and stops the moment the first availability answer
          appears on screen. Nothing is excluded to make the number look better.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight">What the timer includes</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            The stopwatch starts at your final keypress — so our own 80 ms debounce, your network round trip,
            the lookup itself and the React render are all inside the measurement. It is the time you actually
            waited, not the time our server spent.
          </p>
          <ul className="mt-6 space-y-2 text-muted-foreground">
            <li className="flex gap-3">
              <span className="text-primary">•</span> Debounce after the last keystroke (80 ms)
            </li>
            <li className="flex gap-3">
              <span className="text-primary">•</span> Round trip from your browser to our edge function
            </li>
            <li className="flex gap-3">
              <span className="text-primary">•</span> The DNS / RDAP lookup itself
            </li>
            <li className="flex gap-3">
              <span className="text-primary">•</span> Painting the first resolved card
            </li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">How we get there</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {pipeline.map((step) => (
              <div
                key={step.title}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl"
              >
                <step.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Reference numbers</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Measured from a single datacenter connection in August 2026. Your own numbers will differ with
            distance, network and TLD — which is exactly why the timer in the app measures your session, not ours.
          </p>
          <div className="mt-6 overflow-hidden rounded-xl border border-white/10">
            {benchmark.map((row, i) => (
              <div
                key={row.name}
                className={`flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between ${
                  i > 0 ? "border-t border-white/10" : ""
                }`}
              >
                <div>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-sm text-muted-foreground">{row.note}</div>
                </div>
                <div className="text-lg font-bold tabular-nums text-primary">{row.ms}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Why we do not say “world’s fastest”</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Because we cannot prove it, and neither can anyone else who says it. Latency depends on where you
            are, which TLD you query and whether the answer was cached. A superlative that flips with the
            network is marketing; a timer you can read on your own screen is a fact. We publish the number and
            the method, and we keep working the number down.
          </p>
        </section>

        <div className="mt-14 flex flex-wrap gap-3">
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
      </main>
    </div>
  );
};

export default Speed;
