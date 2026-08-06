import { useId, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CodeTab {
  label: string;
  language: string;
  code: string;
}

interface CodeBlockProps {
  /** Tabbed mode */
  tabs?: CodeTab[];
  defaultTab?: number;
  /** Single-snippet mode */
  label?: string;
  language?: string;
  code?: string;
  /** Text to place on the clipboard (defaults to the rendered code) */
  copyText?: string;
  onCopy?: () => void;
}

export function CodeBlock({
  tabs,
  defaultTab = 0,
  label,
  language = "bash",
  code = "",
  copyText,
  onCopy,
}: CodeBlockProps) {
  const [active, setActive] = useState(defaultTab);
  const [copied, setCopied] = useState(false);
  const uid = useId().replace(/:/g, "");

  const current = tabs?.length
    ? tabs[Math.min(active, tabs.length - 1)]
    : { label: label ?? "", language, code };

  const copy = async () => {
    await navigator.clipboard.writeText(copyText ?? current.code);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1500);
  };

  const tabId = (idx: number) => `${uid}-tab-${idx}`;
  const panelId = `${uid}-panel`;

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (!tabs?.length) return;
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        {tabs?.length ? (
          <div className="flex gap-1" role="tablist" onKeyDown={onTabKeyDown}>
            {tabs.map((tab, idx) => (
              <button
                key={tab.label}
                id={tabId(idx)}
                role="tab"
                aria-selected={idx === active}
                aria-controls={panelId}
                tabIndex={idx === active ? 0 : -1}
                onClick={() => setActive(idx)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  idx === active
                    ? "bg-muted/40 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-xs text-muted-foreground">{label}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 text-xs">
          {copied ? (
            <Check className="h-3.5 w-3.5 text-aurora-mint" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div
        className="overflow-x-auto p-4 text-sm leading-relaxed"
        {...(tabs?.length
          ? {
              id: panelId,
              role: "tabpanel",
              "aria-labelledby": tabId(Math.min(active, tabs.length - 1)),
              tabIndex: 0,
            }
          : {})}
      >
        <SyntaxHighlighter
          language={current.language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: 0,
            background: "transparent",
            fontSize: "14px",
            lineHeight: "1.6",

          }}
          codeTagProps={{
            style: {
              fontFamily:
                '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            },
          }}
        >
          {current.code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

