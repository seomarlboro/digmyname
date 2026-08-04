import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
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
          content="MCP server to check domain availability from any LLM — Claude, Cursor, Windsurf, Continue. 7 registrars, 52 TLDs. Powered by DigMyName."
        />
        <link rel="canonical" href="https://digmyname.com/mcp" />
        <meta property="og:title" content="Domain Check Skills — MCP / Claude Skill / Custom GPT" />
        <meta property="og:description" content="MCP server to check domain availability from any LLM — Claude, Cursor, Windsurf, Continue. 7 registrars, 52 TLDs." />
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
          softwareVersion: "1.1.3",
          downloadUrl: NPM_URL,
          codeRepository: GITHUB_URL,
          license: "https://opensource.org/licenses/MIT",
          description: "MCP server to check domain availability from any LLM — Claude, Cursor, Windsurf, Continue. 7 registrars, 52 TLDs. Powered by DigMyName.",
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-background relative overflow-hidden">
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

        <main className="container mx-auto px-4 py-16 max-w-[968px] xl:max-w-[1200px] 2xl:max-w-[1320px]">
          {/* Hero */}
          <section className="text-center mb-20">
            <div className="flex flex-wrap gap-2 justify-center mb-6">
              <a
                href={NPM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackMcpEvent("click", "npm_pill")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur text-xs font-medium hover:bg-primary/15 transition-colors"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Live on npm · v1.1.3
                <ArrowUpRight className="w-3 h-3" />
              </a>
              <Link
                to="/speed"
                onClick={() => trackMcpEvent("click", "speed_pill")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 backdrop-blur text-xs font-medium hover:bg-emerald-500/15 transition-colors"
              >
                <Zap className="w-3 h-3 text-emerald-400" />
                Fastest on the internet · dispute it
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <h1 className="mb-5 text-4xl md:text-5xl font-bold tracking-tight text-foreground">
              Domain availability,
              <br className="hidden sm:block" />{" "}
              <span className="text-gradient">inside every LLM.</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              One install. Live answers in ~100 ms from DNS → RDAP → registrar APIs — straight into
              Claude, Cursor, ChatGPT and any MCP-compatible client. If you find a faster domain
              checker, <Link to="/speed" className="text-primary hover:underline">we want to know</Link>.
            </p>

            <div className="flex flex-wrap gap-3 justify-center mb-10">
              <Button asChild size="lg" className="gap-2 h-12 px-6 shadow-lg shadow-primary/20">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackMcpEvent("click", "github_hero")}
                >
                  <Github className="w-5 h-5" />
                  View on GitHub
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 h-12 px-6 backdrop-blur bg-card/30">
                <Link to="/" onClick={() => trackMcpEvent("click", "try_web")}>
                  Try the web version
                </Link>
              </Button>
            </div>

            {/* Live badges */}
            <div className="flex flex-wrap gap-2 justify-center">
              <a href={NPM_URL} target="_blank" rel="noopener noreferrer" aria-label="npm version">
                <img
                  src="https://img.shields.io/npm/v/domain-check-skills-mcp?color=145DFB&label=npm&style=flat-square"
                  alt="npm version"
                />
              </a>
              <a href={NPM_URL} target="_blank" rel="noopener noreferrer" aria-label="npm downloads">
                <img
                  src="https://img.shields.io/npm/dm/domain-check-skills-mcp?color=145DFB&label=downloads&style=flat-square"
                  alt="npm downloads"
                />
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub stars">
                <img
                  src="https://img.shields.io/github/stars/seomarlboro/domain-check-skills?color=145DFB&style=flat-square"
                  alt="GitHub stars"
                />
              </a>
              <img
                src="https://img.shields.io/badge/license-MIT-145DFB?style=flat-square"
                alt="MIT license"
              />
            </div>
          </section>


          {/* Stats strip */}
          <section className="mb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="group p-6 rounded-2xl border border-border bg-card/40 backdrop-blur hover:border-primary/40 hover:bg-card/60 transition-colors flex flex-col items-center text-center"
                >
                  <div className="w-11 h-11 mb-3 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center">
                    <s.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-2xl md:text-3xl font-bold tracking-tight leading-none bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
                    {s.value}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 uppercase tracking-widest font-semibold">
                    {s.label}
                  </div>
                </div>
              ))}

            </div>
          </section>

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
                <a
                  key={f.title}
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackMcpEvent("click", `format_${f.title.toLowerCase().replace(/\s+/g, "_")}`)
                  }
                  className="group relative p-6 rounded-2xl border border-border bg-card/40 backdrop-blur-xl hover:border-primary/50 hover:bg-card/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center">
                      <f.icon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground/60">{f.n}</span>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mb-5 leading-relaxed flex-1">{f.for}</p>

                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {f.badge}
                    </Badge>
                    <span className="text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all font-medium">
                      Install <ArrowUpRight className="w-4 h-4" />
                    </span>
                  </div>
                </a>
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
            <div className="mb-4 rounded-2xl border border-border bg-[#0a0a14] overflow-hidden shadow-2xl shadow-primary/5">
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
              <pre className="p-6 text-sm overflow-x-auto font-mono leading-relaxed">
                <code className="text-foreground/90">
                  <span className="text-primary select-none">$ </span>
                  {oneLineCommand}
                </code>
              </pre>
            </div>

            {/* JSON config */}
            <div className="rounded-2xl border border-border bg-[#0a0a14] overflow-hidden shadow-2xl shadow-primary/5">
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
              <pre className="p-6 text-sm overflow-x-auto font-mono leading-relaxed">
                <code className="text-foreground/90">{configSnippet}</code>
              </pre>
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
            <div className="space-y-3">
              {tools.map((t, i) => (
                <div
                  key={t.name}
                  className="group relative p-5 md:p-6 rounded-2xl border border-border bg-card/40 backdrop-blur-xl hover:border-primary/40 transition-colors"
                >
                  <div className="absolute left-0 top-6 bottom-6 w-1 rounded-r-full bg-gradient-to-b from-primary to-purple-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-baseline gap-2 flex-wrap mb-2">
                    <span className="text-xs font-mono text-muted-foreground/50">
                      0{i + 1}
                    </span>
                    <code className="text-primary font-mono font-semibold text-base">
                      {t.name}
                    </code>
                    <code className="text-muted-foreground/70 font-mono text-sm">{t.sig}</code>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>


          {/* Waitlist */}
          <section
            id="waitlist"
            className="mb-20 relative overflow-hidden p-8 md:p-10 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/40 to-purple-500/15 backdrop-blur-xl scroll-mt-24"
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
          <section className="text-center p-10 rounded-3xl border border-border bg-card/40 backdrop-blur-xl">
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
        </main>
      </div>
    </>
  );
};

export default Mcp;
