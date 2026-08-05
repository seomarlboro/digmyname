import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Search,
  ShieldCheck,
  Globe,
  Network,
  Tag,
  AlertCircle,
  Check,
  X,
  Sparkles,
  Scale,
  Heart,
} from "lucide-react";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchIcon, ShieldIcon } from "@/components/StatIcons";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid, FeatureCard } from "@/components/PageKit";


const sources = [
  {
    icon: Search,
    name: "Domainr (RapidAPI)",
    role: "Primary signal",
    detail:
      "Aggregated registry status across hundreds of TLDs. Fastest and broadest first pass, with batch lookups for top extensions.",
  },
  {
    icon: ShieldCheck,
    name: "IANA RDAP bootstrap",
    role: "Authoritative re-check",
    detail:
      "Instead of relying on a single public RDAP proxy, we resolve the official IANA bootstrap file to talk directly to each TLD's authoritative registry server — far more reliable for .io, .ai, .co, .gg.",
  },
  {
    icon: Network,
    name: "DNS (Cloudflare DoH)",
    role: "Sanity check",
    detail:
      "A and NS lookups via DNS-over-HTTPS confirm whether a domain has live infrastructure. Catches parked but resolving names that RDAP alone can miss.",
  },
  {
    icon: Tag,
    name: "Porkbun verify pass",
    role: "Premium pricing",
    detail:
      "For likely-premium results we hit Porkbun's pricing API to surface the real listed price — no guessing, no fake markup.",
  },
];

const comparison = [
  {
    feature: "Verification sources disclosed",
    us: true,
    instant: false,
    aggregator: false,
    basic: false,
  },
  {
    feature: "Honest \"Unverified\" state (never lies)",
    us: true,
    instant: false,
    aggregator: false,
    basic: false,
  },
  {
    feature: "Real premium prices from registrars",
    us: true,
    instant: true,
    aggregator: true,
    basic: false,
  },
  {
    feature: "7-registrar 3-year cost comparison",
    us: true,
    instant: false,
    aggregator: false,
    basic: false,
  },
  {
    feature: "Smart TLD prioritisation",
    us: true,
    instant: true,
    aggregator: true,
    basic: false,
  },
  {
    feature: "Save favourites (free account)",
    us: true,
    instant: false,
    aggregator: false,
    basic: true,
  },
  {
    feature: "No registrar lock-in / unbiased buy links",
    us: true,
    instant: false,
    aggregator: true,
    basic: false,
  },
];

const faqs = [
  {
    q: "Why do other tools sometimes mark domains incorrectly?",
    a: "Most checkers rely on a single source — usually a public RDAP proxy or a cached zone file. When that source times out (common for .io, .ai, .co) they silently default to either \"Available\" or \"Taken\" instead of admitting uncertainty. We cross-check four independent sources and only report a definitive answer when they agree.",
  },
  {
    q: "What does the \"Unverified\" state mean?",
    a: "It means our sources disagreed or one of them failed, so we don't have high confidence. Rather than guess, we surface the uncertainty and give you a Retry button to re-check on demand. No other major domain search tool does this.",
  },
  {
    q: "Are the premium prices real?",
    a: "Yes. When a domain is flagged as premium we query a registrar pricing API (Porkbun, with GoDaddy as a backup) to return the actual listed price. If we can't verify a price, we label it \"Premium\" without inventing a number.",
  },
  {
    q: "Do you favour a particular registrar?",
    a: "No. The Pricing page compares 7 registrars across 52 TLDs and surfaces the best 3-year total cost — including renewal traps. Buy links go to whichever registrar you choose.",
  },
  {
    q: "Is DigMyName free?",
    a: "Yes — search, verification, premium pricing and registrar comparison are all free. We earn a small commission only when you choose to register through one of the buy links. That's it.",
  },
  {
    q: "Why is it sometimes a bit slow?",
    a: "We prioritise accuracy over speed. The top 20 TLDs are checked in a fast parallel batch and stream in first; less common extensions follow. If you only need .com / .io / .ai you'll typically see results in under a second.",
  },
];

const HowItWorks = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Helmet>
        <title>How DigMyName Works — Honest Domain Availability Checks</title>
        <meta
          name="description"
          content="DigMyName verifies domain availability across four independent sources — Domainr, IANA RDAP, DNS, and Porkbun — and never shows guesses as facts. Here's exactly how it works."
        />
        <link rel="canonical" href="https://digmyname.com/how-it-works" />
        <meta property="og:title" content="How DigMyName Works — Honest Domain Availability Checks" />
        <meta
          property="og:description"
          content="Four-source verification, an honest Unverified state, and real registrar prices — here's why DigMyName is more accurate than the alternatives."
        />
        <meta property="og:url" content="https://digmyname.com/how-it-works" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }),
          }}
        />
      </Helmet>

      <Header />

      <PageMain>
        <PageHeader
          eyebrow={<Eyebrow>Why DigMyName</Eyebrow>}
          title={
            <>
              Built for <span className="text-aurora-gradient">honesty,</span> not just speed.
            </>
          }
          lede="Most domain checkers rely on a single data source and quietly guess when it fails. DigMyName cross-checks four independent sources and tells you when it isn't sure — so you never buy a domain that turns out to be taken, or skip one that was actually free."
        >
          <StatGrid cols={3}>
            <Stat value="4" label="Verification sources" accent="mint" icon={SearchIcon} />
            <Stat value="100%" label="Honest uncertainty" accent="warning" icon={ShieldIcon} />
            <Stat value="0%" label="Hidden markup" accent="violet" icon={Scale} />
          </StatGrid>

        </PageHeader>


        {/* Sources */}
        <section className="py-12">
          <h2 className="mb-2 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Four sources, one truth
          </h2>
          <p className="mb-8 text-muted-foreground">
            Every search runs through this chain in parallel. We only commit to
            an answer when the signals agree.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {sources.map((s, i) => (
              <FeatureCard
                key={s.name}
                icon={s.icon}
                index={String(i + 1).padStart(2, "0")}
                eyebrow={`Step ${i + 1} · ${s.role}`}
                title={s.name}
              >
                {s.detail}
              </FeatureCard>
            ))}
          </div>
        </section>

        {/* Unverified state */}
        <section className="py-12">
          <div className="surface-card p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="icon-frame icon-frame-warning">
                <AlertCircle />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                The "Unverified" state
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground leading-relaxed">
              When our sources disagree, or a registry server times out, every
              other tool we tested defaults to either{" "}
              <span className="font-semibold text-foreground">Available</span>{" "}
              or <span className="font-semibold text-foreground">Taken</span>{" "}
              — and you have no way of knowing which one was a guess.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              DigMyName labels those results{" "}
              <span className="font-semibold text-warning">Unverified</span> and
              gives you a Retry button. It's the difference between a tool that
              sells confidence and one that earns it.
            </p>
          </div>
        </section>

        {/* Comparison */}
        <section className="py-12">
          <h2 className="mb-2 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            How we compare
          </h2>
          <p className="mb-8 text-muted-foreground">
            Honest take after using each tool ourselves.
          </p>
          <div className="surface-card-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 font-semibold text-foreground">
                      Feature
                    </th>
                    <th className="px-3 py-3 text-center font-semibold text-primary">
                      DigMyName
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Typical instant checker
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Aggregator
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Basic checker
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-foreground">
                        {row.feature}
                      </td>
                      {[row.us, row.instant, row.aggregator, row.basic].map(
                        (v, i) => (
                          <td key={i} className="px-3 py-3 text-center">
                            {v ? (
                              <Check
                                className={`mx-auto h-4 w-4 ${
                                  i === 0 ? "text-primary" : "text-available"
                                }`}
                              />
                            ) : (
                              <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                            )}
                          </td>
                        )
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Based on public testing in 2026. Features change — let us know if
            something here is out of date.
          </p>
        </section>

        {/* What we don't claim */}
        <section className="py-12">
          <h2 className="mb-6 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            What we're <span className="text-muted-foreground">not</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="surface-card p-5">
              <Globe className="mb-3 h-5 w-5 text-muted-foreground" />
              <div className="mb-1 text-lg font-semibold tracking-tight text-foreground">

                Not 800+ TLDs
              </div>
              <p className="text-sm text-muted-foreground">
                We curate a focused set of extensions instead of listing every
                obscure ccTLD. Quality over noise.
              </p>
            </div>
            <div className="surface-card p-5">
              <Scale className="mb-3 h-5 w-5 text-muted-foreground" />
              <div className="mb-1 text-lg font-semibold tracking-tight text-foreground">

                Not a registrar
              </div>
              <p className="text-sm text-muted-foreground">
                We don't sell domains. We help you find the right one and
                buy it from whichever registrar you prefer.
              </p>
            </div>
            <div className="surface-card p-5">
              <Heart className="mb-3 h-5 w-5 text-muted-foreground" />
              <div className="mb-1 text-lg font-semibold tracking-tight text-foreground">
                Not an affiliate farm
              </div>
              <p className="text-sm text-muted-foreground">
                Yes, buy links pay us a small commission. But the price
                comparison is honest — including when our partners aren't
                the cheapest.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12">
          <h2 className="mb-8 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Frequently asked
          </h2>
          <dl className="space-y-4">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="surface-card p-5"
              >
                <dt className="text-base font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Developers */}
        <section className="py-12">
          <div className="surface-card flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                For developers & AI agents
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Free, no-auth JSON API — 60 requests / 60 s per IP, 5,000 per day.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/api">Read the API docs →</Link>
            </Button>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <h2 className="mb-4 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Try an honest search.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Type any name and see four-source verification in action.
          </p>
          <Button asChild size="lg" className="btn-gradient h-12 px-8 text-base">
            <Link to="/">Start searching</Link>
          </Button>
        </section>
      </PageMain>
    </div>
  );
};

export default HowItWorks;
