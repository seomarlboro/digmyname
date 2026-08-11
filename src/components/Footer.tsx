import { Link } from "react-router-dom";
import ShovelLogo from "@/components/ShovelLogo";

const GITHUB_URL = "https://github.com/seomarlboro/domain-check-skills";
const API_BASE = "https://api.digmyname.com/functions/v1/public-api";

const product = [
  { to: "/", label: "Domains" },
  { to: "/pricing", label: "Pricing" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/speed", label: "Speed" },
  { to: "/mcp", label: "MCP" },
  { to: "/api", label: "API" },
];

const Footer = () => (
  <footer className="relative z-10 mt-8 border-t border-border/60 bg-background">
    <div className="content-wrap py-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <ShovelLogo className="h-7 w-7" />
            <span className="logo-text text-foreground">DigMyName</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Honest domain search. Four verification sources, real registrar prices,
            no guesses shown as facts.
          </p>
        </div>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Product
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {product.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Developers
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link to="/api" className="text-muted-foreground transition-colors hover:text-foreground">
                API docs
              </Link>
            </li>
            <li>
              <a href="/llms.txt" className="text-muted-foreground transition-colors hover:text-foreground">
                /llms.txt
              </a>
            </li>
            <li>
              <a
                href={`${API_BASE}/openapi.json`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                /openapi.json
              </a>
            </li>
            <li>
              <a
                href="/.well-known/ai-plugin.json"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                /.well-known/ai-plugin.json
              </a>
            </li>
            <li>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                GitHub
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            About
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Not a registrar</li>
            <li>No hidden markup</li>
            <li>Helping you find the right name and buy it wherever it's cheapest.</li>
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-4 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Built in Ukraine 🇺🇦 · MIT licensed · © 2026 DigMyName</span>
        <div className="flex items-center gap-3">
          <a
            href="https://codetrendy.com/?utm_source=digmyname.com&utm_medium=badge"
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="shrink-0"
          >
            <img
              src="https://codetrendy.com/api/badge?style=classic"
              alt="CodeTrendy (codetrendy.com)"
              height={40}
              className="block dark:hidden h-[40px] w-auto"
            />
            <img
              src="https://codetrendy.com/api/badge?style=dark"
              alt="CodeTrendy (codetrendy.com)"
              height={40}
              className="hidden dark:block h-[40px] w-auto"
            />
          </a>
          <a
            href="https://sellwithboost.com"
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="shrink-0"
          >
            <img
              src="https://sellwithboost.com/badge/listing.svg"
              alt="Listed on Sell With Boost"
              height={40}
              className="block dark:hidden h-[40px] w-auto"
            />
            <img
              src="https://sellwithboost.com/badge/listing-dark.svg"
              alt="Listed on Sell With Boost"
              height={40}
              className="hidden dark:block h-[40px] w-auto"
            />
          </a>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
