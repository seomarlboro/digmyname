import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Github,
  Puzzle,
  Sparkles,
  Bot,
  Check,
  Copy,
  ArrowUpRight,
  Terminal,
  Zap,
  Globe,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trackMcpEvent } from "@/lib/trackMcpEvent";
import WaitlistForm from "@/components/WaitlistForm";
import { PageMain, PageHeader, Eyebrow, Stat, StatGrid, FeatureCard } from "@/components/PageKit";


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
    badge: "200M+ users",
  },
];

const tools = [
  {
    name: "check_domain",
    sig: "(domain: string)",
    desc: "Live availability, premium flags, cheapest registrar and buy link for one domain. Shows registration year when taken.",
  },
  {
    name: "search_domains",
    sig: "(query: string, tlds?: string[])",
    desc: "Check one name across 12 popular TLDs in parallel. Returns availability + price + registration year for taken results.",
  },
  {
    name: "compare_registrars",
    sig: "(tld: string)",
    desc: "Side-by-side pricing across 7 registrars including registration, renewal and 3-year value.",
  },
  {
    name: "get_domain_age",
    sig: "(domain: string)",
    desc: "Registration year and expiration date for a taken domain via RDAP.",
  },
];

const stats = [
  { icon: Globe, value: "52", label: "TLDs covered" },
  { icon: ShieldCheck, value: "7", label: "Registrars compared" },
  { icon: Zap, value: "<100ms", label: "Typical response" },
  { icon: Cpu, value: "MIT", label: "Open source" },
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
  const [copied, setCopied] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  useEffect(() => {
    trackMcpEvent("page_view", "mcp");
  }, []);

  const copyConfig = async () => {
    await navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    trackMcpEvent("copy_config", "claude_desktop");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCli = async () => {
    await navigator.clipboard.writeText(oneLineCommand);
    setCopiedCli(true);
    trackMcpEvent("copy_config", "claude_cli");
    setTimeout(() => setCopiedCli(false), 2000);
  };

  return (
    <>
      <Helmet>
        <title>MCP Server, Claude Skill & Custom GPT — DigMyName</title>
        <meta
          name="description"
          content="The world's fastest domain availability MCP server — ~100 ms checks from any LLM: Claude, Cursor, Windsurf, Continue. 7 registrars, 52 TLDs. Powered by DigMyName."
        />
        <link rel="canonical" href="https://digmyname.com/mcp" />
        <meta property="og:title" content="Domain Check Skills — MCP / Claude Skill / Custom GPT" />
        <meta property="og:description" content="The world's fastest domain availability MCP server — ~100 ms checks from any LLM. 7 registrars, 52 TLDs." />
        <meta property="og:url" content="https://digmyname.com/mcp" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "domain-check-skills-mcp",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Cross-platform",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          softwareVersion: "1.1.6",
          downloadUrl: NPM_URL,
          codeRepository: GITHUB_URL,
          license: "https://opensource.org/licenses/MIT",
          description: "The world's fastest domain availability MCP server — ~100 ms checks from any LLM: Claude, Cursor, Windsurf, Continue. 7 registrars, 52 TLDs. Powered by DigMyName.",
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-transparent relative overflow-hidden">
        {/* Ambient background */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-primary/10 blur-[140px]" />
          <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-purple-500/10 blur-[140px]" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        <Header />

        <PageMain>
          <PageHeader
            eyebrow={
              <div className="flex flex-wrap gap-2">
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
                  Live on npm · v1.1.6
                  <ArrowUpRight className="h-3 w-3" />
                </a>
                <Link
                  to="/speed"
                  onClick={() => trackMcpEvent("click", "speed_pill")}
                  className="eyebrow transition-colors hover:bg-aurora/20"
                >
                  <Zap className="h-3 w-3" />
                  Fastest on the internet · dispute it
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            }
            title={
              <>
                Domain availability,{" "}
                <span className="text-aurora-gradient">inside every LLM.</span>
              </>
            }
            lede={
              <>
                One install. Live answers in ~100 ms from DNS → RDAP → registrar APIs — straight into
                Claude, Cursor, ChatGPT and any MCP-compatible client. If you find a faster domain
                checker, <Link to="/speed" className="text-aurora hover:underline">we want to know</Link>.
              </>
            }
            actions={
              <>
                <Button asChild size="lg" className="h-12 gap-2 px-6 shadow-lg shadow-primary/20">
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
                <Button asChild size="lg" variant="outline" className="h-12 gap-2 bg-card/30 px-6 backdrop-blur">
                  <Link to="/" onClick={() => trackMcpEvent("click", "try_web")}>
                    Try the web version
                  </Link>
                </Button>
              </>
            }
          >
            <StatGrid>
              <Stat value="52" label="TLDs covered" accent="mint" />
              <Stat value="7" label="Registrars compared" accent="violet" />
              <Stat value="<100ms" label="Typical response" />
              <Stat value="MIT" label="Open source" />
            </StatGrid>

          </PageHeader>


          {/* Three formats */}
          <section className="mb-20">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
                  Pick your stack
                </p>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                  Three drop-in formats
                </h2>
              </div>
            </div>
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
                      <span className="text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all font-medium">
                        Install <ArrowUpRight className="w-4 h-4" />
                      </span>
                    </>
                  }
                >
                  {f.for}
                </FeatureCard>
              ))}
            </div>
          </section>

          {/* Quick start */}
          <section className="mb-20">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
              Quick start
            </p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
              Up & running in 30 seconds
            </h2>
            <p className="text-muted-foreground mb-6 max-w-2xl">
              Using Claude Code? One command and you're done. Otherwise, drop the JSON below into your{" "}
              <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                claude_desktop_config.json
              </code>{" "}
              and restart the client.
            </p>

            {/* One-line CLI install */}
            <div className="mb-4 surface-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card/40">
                <div className="flex items-center gap-3">
                  <Terminal className="w-3.5 h-3.5 text-primary" />

                  <span className="text-xs text-muted-foreground font-mono">
                    Claude Code · one command
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyCli}
                  className="gap-1.5 h-7 text-xs"
                >
                  {copiedCli ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCli ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="p-6 overflow-x-auto text-[13px] leading-relaxed">
                <SyntaxHighlighter
                  language="bash"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: 0,
                    background: "transparent",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                  codeTagProps={{
                    style: {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    },
                  }}
                >
                  {`$ ${oneLineCommand}`}
                </SyntaxHighlighter>
              </div>
            </div>

            {/* JSON config */}
            <div className="surface-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card/40">
                <div className="flex items-center gap-3">
                  <Terminal className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground font-mono">
                    claude_desktop_config.json
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyConfig}
                  className="gap-1.5 h-7 text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="p-6 overflow-x-auto text-[13px] leading-relaxed">
                <SyntaxHighlighter
                  language="json"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: 0,
                    background: "transparent",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                  codeTagProps={{
                    style: {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    },
                  }}
                >
                  {configSnippet}
                </SyntaxHighlighter>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Then ask:{" "}
              <em className="text-foreground/80">
                "Check if myidea.com and myidea.io are available."
              </em>
            </p>
          </section>

          {/* Tools */}
          <section className="mb-20">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
              API surface
            </p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-8">Tools exposed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tools.map((t, i) => (
                <div
                  key={t.name}
                  className="group relative p-5 md:p-6 surface-card hover:border-foreground/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="text-foreground font-mono font-semibold text-lg">
                        {t.name}
                      </code>
                      <code className="text-muted-foreground/70 font-mono text-sm">{t.sig}</code>
                    </div>
                    <span className="shrink-0 text-xs font-mono font-bold text-foreground/90 bg-foreground/10 px-2 py-1 rounded-md">
                      0{i + 1}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>


          {/* Waitlist */}
          <section
            id="waitlist"
            className="mb-20 relative overflow-hidden p-8 md:p-10 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-purple-500/15 scroll-mt-24"
          >
            <div
              aria-hidden
              className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/20 blur-[120px] -z-0"
            />
            <div className="relative grid md:grid-cols-2 gap-8 md:gap-10 items-center">
              <div>
                <Badge variant="secondary" className="mb-3">
                  Coming soon
                </Badge>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">

                  Paid tier waitlist
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Free tier is generous (60 req/min · 5,000/day). Need more? Get API keys, 100k
                  req/day, webhooks and an SLA.
                </p>
              </div>
              <div>
                <WaitlistForm />
              </div>
            </div>

          </section>

          {/* Footer CTA */}
          <section className="text-center p-10 surface-card">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-primary/10 border border-primary/20 text-xs">
              MIT licensed · Built in Ukraine 🇺🇦
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              PRs welcome. Stars appreciated.
            </h2>
            <p className="text-muted-foreground mb-7 max-w-md mx-auto">
              Open issues, ship features, or fork it for your own registrar.
            </p>
            <Button asChild size="lg" className="gap-2 h-12 px-6 shadow-lg shadow-primary/20">
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
          </section>
        </PageMain>
      </div>
    </>
  );
};

export default Mcp;
