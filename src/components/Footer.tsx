import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
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

/**
 * Directory badge. Exactly one image request: the variant for the resolved
 * theme, once the theme is known. (Two <img>s toggled with CSS `hidden` both
 * download — the browser doesn't care that one is display:none.)
 */
const DirectoryBadge = ({
  href,
  alt,
  light,
  dark,
  width,
  height,
}: {
  href: string;
  alt: string;
  light: string;
  dark: string;
  width: number;
  height: number;
}) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <a href={href} target="_blank" rel="nofollow noopener noreferrer" className="block shrink-0" style={{ height: 40, width: (width / height) * 40 }}>
      {mounted && (
        <img
          src={resolvedTheme === "dark" ? dark : light}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="block h-10 w-auto"
        />
      )}
    </a>
  );
};

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
            Honest domain search. Three availability signals, real registrar prices,
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
            <li>Buy links may earn us a commission — the price you see is the registrar's own.</li>
            <li className="pt-2">
              <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
              <span aria-hidden="true"> · </span>
              <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-4 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Built in Ukraine 🇺🇦 · MIT licensed · © 2026 DigMyName</span>
        <div className="flex items-center gap-3">
          <DirectoryBadge
            href="https://codetrendy.com/?utm_source=digmyname.com&utm_medium=badge"
            alt="CodeTrendy (codetrendy.com)"
            light="https://codetrendy.com/api/badge?style=classic"
            dark="https://codetrendy.com/api/badge?style=dark"
            width={220}
            height={56}
          />
          <DirectoryBadge
            href="https://sellwithboost.com"
            alt="Listed on Sell With Boost"
            light="https://sellwithboost.com/badge/listing.svg"
            dark="https://sellwithboost.com/badge/listing-dark.svg"
            width={160}
            height={40}
          />
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
