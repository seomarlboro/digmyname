import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** How long the check mark stays after a copy. */
export const COPIED_MS = 1500;

/**
 * A registrar's promo code as a secondary badge that copies itself to the
 * clipboard. The one promo primitive: result cards, /tld pages and /pricing all
 * use it, so the look and the copy behaviour never drift apart.
 */
export const PromoCode = ({ code, size = "default", title = "Copy promo code" }: { code: string; size?: "default" | "sm"; title?: string }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (e: MouseEvent) => {
    // Cards can be clickable; copying must not also trigger the row.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      aria-label={copied ? `Promo code ${code} copied` : `Copy promo code ${code}`}
      className={cn(badgeVariants({ variant: "secondary" }), "gap-1 font-mono font-normal", size === "sm" ? "px-1.5 py-0 text-[10px]" : "text-xs")}
    >
      {code}
      <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3", copied ? "text-mint" : "text-muted-foreground")} aria-hidden="true" />
    </button>
  );
};

export default PromoCode;
