import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CodeTab {
  label: string;
  language: string;
  code: string;
}

interface CodeBlockProps {
  tabs: CodeTab[];
  defaultTab?: number;
}

export function CodeBlock({ tabs, defaultTab = 0 }: CodeBlockProps) {
  const [active, setActive] = useState(defaultTab);
  const [copied, setCopied] = useState(false);

  const current = tabs[active];

  const copy = async () => {
    await navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-2">
        <div className="flex gap-1">
          {tabs.map((tab, idx) => (
            <button
              key={tab.label}
              onClick={() => setActive(idx)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                idx === active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <SyntaxHighlighter
          language={current.language}
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
          {current.code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
