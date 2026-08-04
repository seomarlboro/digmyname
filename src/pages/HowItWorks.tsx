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
import { CodeBlock } from "@/components/CodeBlock";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid } from "@/components/PageKit";


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
    domainr: false,
    namechk: false,
    lean: false,
  },
  {
    feature: "Honest \"Unverified\" state (never lies)",
    us: true,
    instant: false,
    domainr: false,
    namechk: false,
    lean: false,
  },
  {
    feature: "Real premium prices from registrars",
    us: true,
    instant: true,
    domainr: true,
    namechk: false,
    lean: false,
  },
  {
    feature: "7-registrar 3-year cost comparison",
    us: true,
    instant: false,
    domainr: false,
    namechk: false,
    lean: false,
  },
  {
    feature: "50+ curated TLDs with smart prioritisation",
    us: true,
    instant: true,
    domainr: true,
    namechk: false,
    lean: false,
  },
  {
    feature: "Save favourites (free account)",
    us: true,
    instant: false,
    domainr: false,
    namechk: true,
    lean: false,
  },
  {
    feature: "No registrar lock-in / unbiased buy links",
    us: true,
    instant: false,
    domainr: true,
    namechk: false,
    lean: false,
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
              Built for <span className="text-aurora-gradient">honesty</span>, not just speed.
            </>
          }
          lede="Most domain checkers rely on a single data source and quietly guess when it fails. DigMyName cross-checks four independent sources and tells you when it isn't sure — so you never buy a domain that turns out to be taken, or skip one that was actually free."
        >
          <StatGrid cols={3}>
            <Stat value="4" label="Verification sources" accent="mint" />
            <Stat value="50+" label="TLDs curated" accent="violet" />
            <Stat value="0" label="Guesses shown as facts" />
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
              <div
                key={s.name}
                className="surface-card p-5 card-hover"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="icon-frame">
                    <s.icon />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Step {i + 1} · {s.role}
                    </div>
                    <div className="text-lg font-semibold tracking-tight text-foreground">
                      {s.name}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Unverified state */}
        <section className="py-12">
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-8">
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
          <div className="overflow-hidden surface-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-4 py-3 font-semibold text-foreground">
                      Feature
                    </th>
                    <th className="px-3 py-3 text-center font-semibold text-primary">
                      DigMyName
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Instant
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Domainr
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Namechk
                    </th>
                    <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                      Lean
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
                      {[row.us, row.instant, row.domainr, row.namechk, row.lean].map(
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
                We curate ~50 useful extensions instead of listing every
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

        {/* Public API for agents */}
        <section className="py-12">
          <h2 className="mb-3 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            For AI agents & developers
          </h2>
          <p className="mb-6 max-w-2xl text-muted-foreground">
            Free, no-auth JSON API. ChatGPT, Claude, Perplexity and your own
            scripts can ask "is this domain available?" without scraping. 60
            requests / 60 s / IP.
          </p>

          <CodeBlock
            tabs={[
              {
                label: "cURL",
                language: "bash",
                code: `curl "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api/check?domain=acme.io"`,
              },
              {
                label: "JavaScript",
                language: "javascript",
                code: `const res = await fetch(
  "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api/check?domain=acme.io"
);
const data = await res.json();
console.log(data.available, data.price);`,
              },
              {
                label: "Python",
                language: "python",
                code: `import requests

url = "https://ifamsapmecefkyspmojb.supabase.co/functions/v1/public-api/check"
res = requests.get(url, params={"domain": "acme.io"})
print(res.json()["available"])`,
              },
              {
                label: "Response",
                language: "json",
                code: `{
  "domain": "acme.io",
  "available": true,
  "premium": false,
  "price": 34.56,
  "currency": "USD",
  "registrar": "porkbun"
}`,
              },
            ]}
          />

          <div className="mt-6 surface-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Endpoints</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">GET /check?domain=</code>
                <span className="ml-2">Single domain availability + price</span>
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">GET /search?q=&amp;tlds=</code>
                <span className="ml-2">Multi-TLD lookup in one call</span>
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">GET /registrars?tld=</code>
                <span className="ml-2">Cheapest registrars for a TLD</span>
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">GET /openapi.json</code>
                <span className="ml-2">Full OpenAPI schema</span>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <a
                href="/.well-known/ai-plugin.json"
                className="underline hover:text-foreground"
              >
                /.well-known/ai-plugin.json
              </a>
              <a href="/llms.txt" className="underline hover:text-foreground">
                /llms.txt
              </a>
            </div>
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
