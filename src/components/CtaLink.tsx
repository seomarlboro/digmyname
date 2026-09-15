import type { MouseEventHandler, ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The one outbound call-to-action of result cards and rows ("Buy", "View listing"):
 * gradient pill, external-link icon, 24 px side padding, opens in a new tab.
 * Look and spacing live here and in the `cta` variant/size of Button — call sites
 * pass only the destination, the label and, at most, visibility classes.
 */
export const CtaLink = ({
  href,
  onClick,
  children,
  className,
  ariaLabel,
  tone = "primary",
}: {
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
  /** Visibility only (e.g. "hidden sm:inline-flex"). */
  className?: string;
  ariaLabel?: string;
  /** Colour only; size, icon and spacing are identical. */
  tone?: "primary" | "secondary";
}) => (
  <Button variant={tone === "primary" ? "cta" : "cta-secondary"} size="cta" className={className} asChild>
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={ariaLabel}>
      <ExternalLink aria-hidden="true" />
      {children}
    </a>
  </Button>
);

export default CtaLink;
