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
      "mx-auto max-w-[968px] px-4 pb-24 pt-10 xl:max-w-[1200px] 2xl:max-w-[1320px]",
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
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
}) => (
  <section className="bento bento-p-lg mb-10">
    <div className="aurora-glow-mint -left-24 -top-24 h-72 w-72" />
    <div className="aurora-glow-violet -bottom-32 -right-20 h-72 w-72" />
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

      {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
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
  cols?: 3 | 4;
  className?: string;
}) => (
  <div
    className={cn(
      "mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60",
      cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4",
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
}: {
  value: ReactNode;
  label: ReactNode;
  accent?: "mint" | "violet";
}) => (
  <div className="bg-card px-5 py-5 transition-colors hover:bg-muted/40">
    <div
      className={cn(
        "stat-value text-left",
        accent === "mint" && "text-mint",
        accent === "violet" && "text-violet",
      )}
    >
      {value}
    </div>
    <div className="stat-label mt-1 text-left">{label}</div>
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
