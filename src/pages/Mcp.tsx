import { MCP_VERSION } from "@/generated/mcp-version";
import RouteHead from "@/seo/RouteHead";
import { Link } from "react-router-dom";
import {
  Github,
  Puzzle,
  Sparkles,
  Bot,
  ArrowUpRight,
  Terminal,
} from "lucide-react";
import { useEffect } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trackMcpEvent } from "@/lib/trackMcpEvent";
import WaitlistSection from "@/components/WaitlistSection";
import { CodeBlock } from "@/components/CodeBlock";
import { NetworkIcon, StoreIcon, StopwatchIcon, LicenseIcon } from "@/components/StatIcons";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid, FeatureCard, Section, CalloutBlock } from "@/components/PageKit";



const GITHUB_URL = "https://github.com/seomarlboro/domain-check-skills";
const NPM_URL = "https://www.npmjs.com/package/domain-check-skills-mcp";

const formats = [
  {
    n: "01",
    icon: Puzzle,
    title: "MCP Server",
    for: "Claude Desktop · Cursor · Windsurf · Continue · Zed",
    href: `${GITHUB_URL}/tree/main/mcp`,
    badge: "Open standard",
  },
  {
    n: "02",
    icon: Sparkles,
    title: "Claude Skill",
    for: "Claude.ai web & desktop (Skills)",
    href: `${GITHUB_URL}/tree/main/skill`,
    badge: "Zero-config",
  },
  {
    n: "03",
    icon: Bot,
    title: "Custom GPT",
    for: "ChatGPT Plus / Team",
    href: `${GITHUB_URL}/tree/main/gpt`,
    badge: "GPT Store",
  },
];

const tools = [
  {
    name: "check_domain",
    sig: "(domain: string)",
    icon: Sparkles,
    desc: "Live availability, premium flags, cheapest registrar and buy link for one domain. Shows registration year when taken.",
  },
  {
    name: "search_domains",
    sig: "(query: string, tlds?: string[])",
    icon: Puzzle,
    desc: "Check one name across 11 popular TLDs in parallel (or the ones you pass). Returns availability + price + registration year for taken results.",
  },
  {
    name: "compare_registrars",
    sig: "(tld: string)",
    icon: StoreIcon,
    desc: "Side-by-side pricing across 6 registrars including registration, renewal and 3-year value.",
  },
  {
    name: "get_domain_age",
    sig: "(domain: string)",
    icon: StopwatchIcon,
    desc: "Registration year and expiration date for a taken domain via RDAP.",
  },
];

const configSnippet = `{
  "mcpServers": {
    "domain-check-skills": {
      "command": "npx",
      "args": ["-y", "domain-check-skills-mcp"]
    }
  }
}`;

const oneLineCommand = `claude mcp add domain-check -- npx -y domain-check-skills-mcp`;

const Mcp = () => {
  useEffect(() => {
    trackMcpEvent("page_view", "mcp");
  }, []);



  return (
    <>
      <RouteHead path="/mcp">
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "domain-check-skills-mcp",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Cross-platform",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          softwareVersion: MCP_VERSION,
          downloadUrl: NPM_URL,
          codeRepository: GITHUB_URL,
          license: "https://opensource.org/licenses/MIT",
          description: "The fastest domain availability MCP server we've measured — dispute it at digmyname.com/speed. Checks in about half a second, ~0.1 s cached, from any LLM: Claude, Cursor, Windsurf, Continue. 6 registrars, 50+ TLDs.",
        })}</script>
      </RouteHead>

      <div className="min-h-screen bg-background relative overflow-hidden">
        <Header />

        <PageMain>
          <PageHeader
            eyebrow={
              <a
                href={NPM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackMcpEvent("click", "npm_pill")}
                className="eyebrow transition-colors hover:bg-aurora/20"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aurora opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-aurora" />
                </span>
                Live on npm · v{MCP_VERSION}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            }
            title={
              <>
                Domain availability,{" "}
                <span className="text-aurora-gradient">inside every LLM.</span>
              </>
            }
            lede={
              <>
                One install. Live answers in about half a second from DNS → RDAP → registrar APIs — straight into
                Claude, Cursor, ChatGPT and any MCP-compatible client. Fastest on the internet —{" "}
                <Link to="/speed" className="text-aurora hover:underline">dispute it</Link>. The server
                now calls <code className="font-mono text-foreground/80">api.digmyname.com</code>, a
                Cloudflare edge cache: repeat domain lookups return in about 0.1 s, first-time lookups run
                the full live check (about half a second, under 0.9 s at p95 — measured from the US and the EU, September 2026).
                <span className="mt-5 flex flex-wrap items-center gap-2">
                  {/* Live figures stay as shields.io images; the three static badges are plain markup (three fewer third-party requests).
                      width/height reserve the badge's footprint before it loads — without them the row re-wrapped on
                      load and pushed the stat grid down (CLS 0.10 on mobile). */}
                  <a href={NPM_URL} target="_blank" rel="noopener noreferrer">
                    <img className="h-5 w-auto" width={105} height={20} loading="lazy" decoding="async" alt="npm version of domain-check-skills-mcp" src="https://img.shields.io/npm/v/domain-check-skills-mcp?color=6d28d9&label=npm&logo=npm" />
                  </a>
                  <a href={NPM_URL} target="_blank" rel="noopener noreferrer">
                    <img className="h-5 w-auto" width={144} height={20} loading="lazy" decoding="async" alt="monthly npm downloads" src="https://img.shields.io/npm/dm/domain-check-skills-mcp?color=10b981&label=downloads" />
                  </a>
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="static-badge">
                    <span className="static-badge-key">license</span><span className="static-badge-value bg-[#2563eb]">MIT</span>
                  </a>
                  <span className="static-badge">
                    <span className="static-badge-key">MCP</span><span className="static-badge-value bg-[#7c3aed]">compatible</span>
                  </span>
                  <span className="static-badge">
                    <span className="static-badge-key">free</span><span className="static-badge-value bg-[#15803d]">no API key</span>
                  </span>
                </span>
              </>
            }
            actions={
              <>
                <Button asChild size="lg">
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackMcpEvent("click", "github_hero")}
                  >
                    <Github className="h-5 w-5" />
                    View on GitHub
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/?q=example.com" onClick={() => trackMcpEvent("click", "try_live_search")}>
                    Try a live search
                  </Link>
                </Button>
              </>
            }
          >
            <StatGrid>
              <Stat value="50+" label="TLDs covered" accent="mint" icon={NetworkIcon} />
              <Stat value="6" label="Registrars compared" accent="violet" icon={StoreIcon} />
              <Stat value="≈0.5s" label="First-time check, median" icon={StopwatchIcon} />
              <Stat value="MIT" label="Open source" icon={LicenseIcon} />
            </StatGrid>

          </PageHeader>


          {/* Three formats */}
          <Section title="Three drop-in formats">
            <div className="grid md:grid-cols-3 gap-4">
              {formats.map((f) => (
                <FeatureCard
                  key={f.title}
                  as="a"
                  icon={f.icon}
                  index={f.n}
                  title={f.title}
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackMcpEvent("click", `format_${f.title.toLowerCase().replace(/\s+/g, "_")}`)
                  }
                  footer={
                    <>
                      <Badge variant="outline" className="text-xs">
                        {f.badge}
                      </Badge>
                      <span className="text-sm text-primary dark:text-violet inline-flex items-center gap-1 group-hover:gap-2 transition-all font-medium">
                        Install <ArrowUpRight className="w-4 h-4" />
                      </span>
                    </>
                  }
                >
                  {f.for}
                </FeatureCard>
              ))}
            </div>
          </Section>

          {/* Quick start */}
          <Section
            title="Up & running in 30 seconds"
            lede={
              <>
                Using Claude Code? One command and you're done. Otherwise, drop the JSON below into your{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  claude_desktop_config.json
                </code>{" "}
                and restart the client.
              </>
            }
          >
            {/* Install snippets */}
            <CodeBlock
              tabs={[
                { label: "Claude Code", language: "bash", code: oneLineCommand },
                { label: "claude_desktop_config.json", language: "json", code: configSnippet },
              ]}
              onCopy={() => trackMcpEvent("copy_config", "mcp_quickstart")}
            />


            <p className="text-sm text-muted-foreground mt-4 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Then ask:{" "}
              <em className="text-foreground/80">
                "Check if myidea.com and myidea.io are available."
              </em>
            </p>
          </Section>

          {/* Tools */}
          <Section title="Tools exposed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tools.map((t, i) => (
                <FeatureCard
                  key={t.name}
                  icon={t.icon}
                  index={`0${i + 1}`}
                  mono
                  title={
                    <span className="flex flex-wrap items-baseline gap-2">
                      {t.name}
                      <span className="text-sm font-normal text-muted-foreground">{t.sig}</span>
                    </span>
                  }
                >
                  {t.desc}
                </FeatureCard>
              ))}
            </div>
          </Section>

          {/* Waitlist */}
          <WaitlistSection />

          {/* Footer CTA */}
          <CalloutBlock
            variant="centered"
            eyebrow="MIT licensed · Built in Ukraine 🇺🇦"
            title="PRs welcome. Stars appreciated."
            body="Open issues, ship features, or fork it for your own registrar."
            action={
              <Button asChild size="lg">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackMcpEvent("click", "github_footer")}
                >
                  <Github className="w-5 h-5" />
                  Star on GitHub
                </a>
              </Button>
            }
          />

        </PageMain>
      </div>
    </>
  );
};

export default Mcp;
