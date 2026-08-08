import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Terminal, Zap, KeyRound, Bot } from "lucide-react";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/CodeBlock";
import WaitlistSection from "@/components/WaitlistSection";
import { NetworkIcon, StopwatchIcon, LicenseIcon } from "@/components/StatIcons";
import { PageMain, PageHeader, Section, Eyebrow, Stat, StatGrid, FeatureCard, DataTable } from "@/components/PageKit";

const API_BASE = "https://api.digmyname.com/functions/v1/public-api";

const endpoints = [
  {
    method: "GET",
    path: "/check?domain=acmeforge.io",
    desc: "Single domain availability, premium flag and real price.",
  },
  {
    method: "GET",
    path: "/search?q=acme&tlds=com,io,ai",
    desc: "Multi-TLD lookup for one name in a single call.",
  },
  {
    method: "GET",
    path: "/registrars?tld=io",
    desc: "Cheapest registrars for a TLD, with renewal and 3-year cost.",
  },
  {
    method: "GET",
    path: "/openapi.json",
    desc: "Full OpenAPI 3 schema — import into any agent or client generator.",
  },
];

const Api = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Free Domain Availability API — DigMyName</title>
        <meta
          name="description"
          content="Free, no-auth JSON API for domain availability, multi-TLD search and registrar prices. 60 requests/60s per IP, no key. Built for AI agents and developers."
        />
        <link rel="canonical" href="https://digmyname.com/api" />
        <meta property="og:title" content="Free Domain Availability API — DigMyName" />
        <meta
          property="og:description"
          content="No-auth JSON API for domain availability and registrar pricing. 60 req/60s per IP, no key."
        />
        <meta property="og:url" content="https://digmyname.com/api" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebAPI",
          name: "DigMyName Public API",
          url: "https://digmyname.com/api",
          documentation: "https://digmyname.com/api",
          termsOfService: "https://digmyname.com/how-it-works",
          provider: { "@type": "Organization", name: "DigMyName", url: "https://digmyname.com/" },
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        })}</script>
      </Helmet>

      <Header />

      <PageMain>
        <PageHeader
          eyebrow={<Eyebrow live>Free · no auth · no key</Eyebrow>}
          title={
            <>
              A domain API built for{" "}
              <span className="text-aurora-gradient">agents and humans.</span>
            </>
          }
          lede="One HTTP GET tells you whether a domain is free, what it really costs, and which registrar is cheapest. No signup, no API key, no scraping — ChatGPT, Claude, Perplexity and your own scripts can call it directly."
          actions={
            <>
              <Button asChild size="lg" className="h-12 gap-2 px-6">
                <a href={`${API_BASE}/check?domain=acmeforge.io`} target="_blank" rel="noopener noreferrer">
                  <Terminal className="h-5 w-5" />
                  Try a live request
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 gap-2 px-6">
                <Link to="/mcp">Use it inside your LLM</Link>
              </Button>
            </>
          }
        >
          <StatGrid cols={3}>
            <Stat value="60/min" label="Requests per IP" accent="mint" icon={NetworkIcon} />
            <Stat value="~170ms" label="Typical first answer" icon={StopwatchIcon} />
            <Stat value="$0" label="No key, no auth" accent="violet" icon={LicenseIcon} />
          </StatGrid>
        </PageHeader>

        <Section
          title="Quick start"
          lede="Copy, paste, ship. Same endpoint from a terminal, a browser or an agent. Requests go through a global Cloudflare edge cache — a repeat lookup for the same domain within 60 seconds comes back in ~70 ms, while a first-time lookup runs the full live check."
        >
          <CodeBlock
            tabs={[
              {
                label: "cURL",
                language: "bash",
                code: `curl "${API_BASE}/check?domain=acmeforge.io"`,
              },
              {
                label: "JavaScript",
                language: "javascript",
                code: `const res = await fetch(
  "${API_BASE}/check?domain=acmeforge.io"
);
const { result } = await res.json();
console.log(result.available, result.price_usd, result.cheapest_registrar?.name);`,
              },
              {
                label: "Python",
                language: "python",
                code: `import requests

url = "${API_BASE}/check"
res = requests.get(url, params={"domain": "acmeforge.io"})
print(res.json()["result"]["available"])`,
              },
              {
                label: "Response",
                language: "json",
                code: `{
  "result": {
    "domain": "acmeforge.io",
    "available": true,
    "uncertain": false,
    "premium": false,
    "likely_premium": false,
    "price_usd": 28.12,
    "for_sale": false,
    "for_sale_via": null,
    "listing_url": null,
    "cheapest_registrar": {
      "name": "Porkbun",
      "reg_price_usd": 28.12,
      "affiliate_url": null,
      "register_url": "https://porkbun.com/checkout/search?q=acmeforge.io"
    },
    "buy_url": "https://porkbun.com/checkout/search?q=acmeforge.io",
    "search_url": "https://digmyname.com/?q=acmeforge&utm_source=mcp&utm_medium=api&utm_campaign=domain-check-skills"
  }
}`,
              },
            ]}
          />
        </Section>

        <Section title="Endpoints" lede="Four routes. That's the whole surface.">
          <DataTable
            columns={[
              {
                header: "Method",
                width: "90px",
                cell: (e) => (
                  <Badge variant="outline" className="w-fit font-mono text-[11px]">
                    {e.method}
                  </Badge>
                ),
              },
              {
                header: "Endpoint",
                width: "1fr",
                cell: (e) => (
                  <code className="font-mono text-sm font-semibold text-foreground">{e.path}</code>
                ),
              },
              {
                header: "Description",
                width: "1.2fr",
                numeric: true,
                cell: (e) => <span className="text-sm text-muted-foreground">{e.desc}</span>,
              },
            ]}
            rows={endpoints}
            rowKey={(e) => e.path}
            minWidth="640px"
          />
        </Section>

        <Section
          title="Agent discovery"
          lede="Machine-readable entry points, so an agent never has to scrape the site."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              as="a"
              href="/.well-known/ai-plugin.json"
              icon={() => <Bot className="text-mint" />}
              mono
              title="/.well-known/ai-plugin.json"
            >
              Plugin manifest for ChatGPT-style tool discovery.
            </FeatureCard>
            <FeatureCard
              as="a"
              href={`${API_BASE}/openapi.json`}
              icon={() => <KeyRound className="text-violet" />}
              mono
              title="/openapi.json"
            >
              Full OpenAPI 3 schema for client and agent generation.
            </FeatureCard>
            <FeatureCard
              as="a"
              href="/llms.txt"
              icon={() => <Zap className="text-warning" />}
              mono
              title="/llms.txt"
            >
              Plain-text summary of what this site knows, for LLM crawlers.
            </FeatureCard>
          </div>
        </Section>

        <Section
          title="Limits & fair use"
          lede="No key, no account — just fair limits so the free tier stays fast for everyone."
        >
          <div className="surface-card p-6">
            <ul className="list-body">
              <li>60 requests per 60 seconds per IP.</li>
              <li>No key, no account, no tracking beyond rate-limit counters.</li>
              <li>
                Repeat lookups within 60 seconds are served from a Cloudflare edge cache (~70 ms);
                first-time lookups run the full live check (~170 ms first answer, ~370 ms typical
                full pipeline).
              </li>
              <li>
                Please link back to{" "}
                <a href="https://digmyname.com/" className="text-aurora hover:underline">
                  digmyname.com
                </a>{" "}
                when you surface our data to users.
              </li>
            </ul>
          </div>
        </Section>

        <WaitlistSection />
      </PageMain>
    </div>
  );
};

export default Api;
