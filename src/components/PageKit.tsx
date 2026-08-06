import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageKit — the shared design system for the info pages
 * (Pricing · How it works · Speed · MCP).
 *
 * One page shell, one header, one section rhythm, one card primitive.
 * Anything visual on those pages should be composed from these parts
 * so the four pages stay pixel-consistent.
 */

/* ── Page shell ─────────────────────────────────────────── */

export const PageMain = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <main
    className={cn(
      "content-wrap pb-20 pt-6 sm:pb-24 sm:pt-10",
      className,
    )}
  >
    {children}
  </main>
);

/* ── Page header ────────────────────────────────────────── */

export const PageHeader = ({
  eyebrow,
  title,
  lede,
  actions,
  children,
  align = "left",
  plain = false,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
  plain?: boolean;
}) => (
  <section className="mb-8 py-2 sm:mb-10">
    <div
      className={cn(
        "relative",
        align === "center" && "flex flex-col items-center text-center",
      )}
    >
      {eyebrow}
      <h1 className={cn("page-title w-full", eyebrow ? "mt-6" : "")}>{title}</h1>
      {lede && (
        <p
          className={cn(
            "page-lede mt-5 w-full",
            align === "center" && "max-w-3xl",
          )}
        >
          {lede}
        </p>
      )}

      {actions && <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">{actions}</div>}
      {children}
    </div>
  </section>
);

/* ── Section ────────────────────────────────────────────── */

export const Section = ({
  title,
  lede,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("mt-14", className)}>
    {title && (
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">{title}</h2>
          {lede && <p className="section-lede max-w-2xl">{lede}</p>}
        </div>
        {aside && (
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {aside}
          </span>
        )}
      </div>
    )}
    {children}
  </section>
);

/* ── Bento grid + tile ──────────────────────────────────── */

export const Bento = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-6", className)}>
    {children}
  </div>
);

export const BentoTile = ({
  children,
  className,
  span = 3,
  hover = true,
  as: As = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  span?: 2 | 3 | 4 | 6;
  hover?: boolean;
  as?: any;
  [key: string]: any;
}) => {
  const spanClass = {
    2: "md:col-span-2",
    3: "md:col-span-3",
    4: "md:col-span-4",
    6: "md:col-span-6",
  }[span];

  return (
    <As
      className={cn("bento bento-p", spanClass, hover && "bento-hover", className)}
      {...rest}
    >
      {children}
    </As>
  );
};

/* ── Stat tile + grid ───────────────────────────────────── */

export const StatGrid = ({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) => (
  <div
    className={cn(
      "surface-card mt-8 grid overflow-hidden sm:mt-10",
      cols === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : cols === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
      className,
    )}
  >
    {children}
  </div>
);


export const Stat = ({
  value,
  label,
  accent,
  icon: Icon,
}: {
  value: ReactNode;
  label: ReactNode;
  accent?: "mint" | "violet" | "warning";
  icon?: (props: { className?: string }) => ReactNode;
}) => (
  <div className="flex min-w-0 items-center gap-4 border-b border-border/60 px-5 py-5 transition-colors last:border-b-0 hover:bg-muted/10 sm:gap-5 sm:border-b-0 sm:border-r sm:px-7 sm:py-8 sm:last:border-r-0 lg:px-10 lg:py-10">
    {Icon && (
      <Icon
        className={cn(
          "h-12 w-12 shrink-0 sm:h-[56px] sm:w-[56px]",
          accent === "mint"
            ? "text-mint"
            : accent === "violet"
              ? "text-violet"
              : accent === "warning"
                ? "text-warning"
                : "text-foreground/70",
        )}
      />
    )}
    <div className="min-w-0">
      <div
        className={cn(
          "stat-value text-left",
          accent === "mint" && "text-mint",
          accent === "violet" && "text-violet",
          accent === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
      <div className="stat-label mt-0.5 text-left">{label}</div>
    </div>
  </div>
);


/* ── Eyebrow chip ───────────────────────────────────────── */

export const Eyebrow = ({
  children,
  live,
}: {
  children: ReactNode;
  live?: boolean;
}) => (
  <span className="eyebrow">
    {live && (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aurora opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-aurora" />
      </span>
    )}
    {children}
  </span>
);

/* ── Feature card ───────────────────────────────────────
 * The single card primitive for numbered/feature grids on
 * How it works · Speed · MCP. Horizontal geometry everywhere:
 * icon left · title + body right · index top-right · footer.
 */

export const FeatureCard = ({
  icon: Icon,
  index,
  title,
  mono = false,
  children,
  footer,
  className,
  as: As = "div",
  ...rest
}: {
  icon: any;
  index?: ReactNode;
  title: ReactNode;
  /** Render the title in monospace — for file paths and function signatures. */
  mono?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  as?: any;
  [key: string]: any;
}) => (
  <As
    className={cn(
      "group relative flex items-start gap-5 overflow-hidden p-5 transition-colors sm:p-6",
      "surface-card card-hover hover:border-primary/40",
      className,
    )}
    {...rest}
  >
    <div className="icon-frame h-12 w-12 [&>svg]:h-6 [&>svg]:w-6">
      <Icon />
    </div>
    <div className="min-w-0 flex-1">
      {index && (
        <span className="absolute right-5 top-5 font-mono text-xs text-muted-foreground/50">
          {index}
        </span>
      )}
      <h3
        className={cn(
          "pr-8",
          mono
            ? "font-mono text-base font-semibold tracking-tight text-foreground sm:text-lg"
            : "card-title-lg",
        )}
      >
        {title}
      </h3>
      {children && <p className="card-body-lg">{children}</p>}
      {footer && <div className="mt-5 flex items-center justify-between">{footer}</div>}
    </div>
  </As>
);

