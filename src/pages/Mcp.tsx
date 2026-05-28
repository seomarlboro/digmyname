import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Github, Puzzle, Sparkles, Bot, Check, Copy, ExternalLink, Terminal } from "lucide-react";
import { useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const GITHUB_URL = "https://github.com/seomarlboro/domain-check-skills";

const formats = [
  {
    icon: Puzzle,
    title: "MCP Server",
    for: "Claude Desktop, Cursor, Windsurf, Continue, Zed",
    href: `${GITHUB_URL}/tree/main/mcp`,
    badge: "Open standard",
  },
  {
    icon: Sparkles,
    title: "Claude Skill",
    for: "Claude.ai web & desktop (Skills)",
    href: `${GITHUB_URL}/tree/main/skill`,
    badge: "Zero-config",
  },
  {
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
    desc: "Live availability for one domain (Domainr + RDAP + DNS + Porkbun). Never returns Taken when uncertain.",
  },
  {
    name: "search_domains",
    desc: "Suggest a base name across 12 popular TLDs in parallel.",
  },
  {
    name: "get_registrars",
    desc: "Side-by-side pricing across 7 registrars including 3-year value.",
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

const Mcp = () => {
  const [copied, setCopied] = useState(false);

  const copyConfig = async () => {
    await navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Helmet>
        <title>MCP Server, Claude Skill & Custom GPT — DigMyName</title>
        <meta
          name="description"
          content="Check domain availability from any LLM. Free MCP server, Claude Skill and Custom GPT — 7 registrars, 52 TLDs, no hallucinations."
        />
        <link rel="canonical" href="https://digmyname.com/mcp" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-12 max-w-[968px]">
          {/* Hero */}
          <section className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">
              <Terminal className="w-3 h-3 mr-1" />
              Free & open-source
            </Badge>
            <h1 className="text-4xl md:text-6xl font-black mb-6 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Domain Check Skills
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Plug live domain availability into the LLMs you already use. MCP server, Claude Skill,
              and Custom GPT — all powered by the DigMyName engine.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button asChild size="lg" className="gap-2">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="w-5 h-5" />
                  View on GitHub
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link to="/">Try the web version</Link>
              </Button>
            </div>
          </section>

          {/* Three formats */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6 text-center">Three drop-in formats</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {formats.map((f) => (
                <a
                  key={f.title}
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-6 rounded-xl border border-border bg-card/50 backdrop-blur hover:border-primary/50 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <f.icon className="w-8 h-8 text-primary" />
                    <Badge variant="outline" className="text-xs">{f.badge}</Badge>
                  </div>
                  <h3 className="font-bold text-lg mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{f.for}</p>
                  <span className="text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    Install <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              ))}
            </div>
          </section>

          {/* Quick start */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Quick start (MCP)</h2>
            <p className="text-muted-foreground mb-4">
              Add this to your <code className="text-sm bg-muted px-1.5 py-0.5 rounded">claude_desktop_config.json</code>:
            </p>
            <div className="relative rounded-xl border border-border bg-card/50 backdrop-blur overflow-hidden">
              <Button
                size="sm"
                variant="ghost"
                onClick={copyConfig}
                className="absolute top-3 right-3 gap-1.5"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <pre className="p-5 text-sm overflow-x-auto">
                <code>{configSnippet}</code>
              </pre>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Restart your client, then ask: <em>"Check if myidea.com and myidea.io are available."</em>
            </p>
          </section>

          {/* Tools */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Tools exposed</h2>
            <div className="space-y-3">
              {tools.map((t) => (
                <div key={t.name} className="p-5 rounded-xl border border-border bg-card/50 backdrop-blur">
                  <code className="text-primary font-mono font-bold">{t.name}</code>
                  <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Footer CTA */}
          <section className="text-center p-8 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-purple-500/10">
            <h2 className="text-2xl font-bold mb-3">MIT licensed. PRs welcome.</h2>
            <p className="text-muted-foreground mb-5">
              Built in Ukraine 🇺🇦. Star the repo if you find it useful.
            </p>
            <Button asChild size="lg" className="gap-2">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
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
