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
  align,
}: {
  title?: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "center";
}) => (
  <section className={cn("mt-14", className)}>
    {title && (
      <div
        className={cn(
          "mb-6 flex flex-col gap-2",
          align === "center"
            ? "items-center"
            : "sm:flex-row sm:items-end sm:justify-between",
        )}
      >
        <div>
          <h2 className="section-title">{title}</h2>
          {lede && (
            <p className={cn("section-lede max-w-2xl", align === "center" && "mx-auto")}>
              {lede}
            </p>
          )}
        </div>
        {aside && (
          <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
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
        <span className="absolute right-5 top-5 font-mono text-xs text-muted-foreground/70">
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


/* ── DataTable ──────────────────────────────────────────
 * The single table primitive for every info page. One card shell,
 * one uppercase header row, optional grouped section-dividers,
 * optional per-row "winner" highlight, mono numeric cells, optional
 * sticky header. Replaces every hand-rolled <table> across the pages. */

export interface DataColumn<Row> {
  /** Column header label. */
  header: ReactNode;
  /** Cell renderer for this column. */
  cell: (row: Row) => ReactNode;
  /** Optional sub-label shown under the header (e.g. "reg + 2 renewals"). */
  sub?: ReactNode;
  /** Right-align this column (for numeric columns). */
  numeric?: boolean;
  /** Explicit grid track (e.g. "1.1fr" or "140px"). Defaults to "1fr". */
  width?: string;
}

export interface DataRowGroup {
  /** Group label rendered as a section-divider bar above its rows. */
  label: ReactNode;
  /** Index in the flat rows array where this group starts. */
  startIndex: number;
}

export function DataTable<Row>({
  columns,
  rows,
  groups,
  rowKey,
  stickyHeader = false,
  className,
  minWidth = "720px",
}: {
  columns: DataColumn<Row>[];
  rows: Row[];
  /** Optional grouped section headers, each marking where a group starts. */
  groups?: DataRowGroup[];
  /** Stable key extractor per row. */
  rowKey: (row: Row, i: number) => string;
  stickyHeader?: boolean;
  className?: string;
  minWidth?: string;
}) {
  const template = columns.map((c) => c.width ?? "1fr").join(" ");
  const groupAt = new Map<number, ReactNode>();
  (groups ?? []).forEach((g) => groupAt.set(g.startIndex, g.label));

  return (
    <div className={cn("surface-card-lg overflow-x-auto", className)}>
      <div style={{ minWidth }}>
        <div
          className={cn(
            "grid border-b border-border px-5 py-4",
            stickyHeader && "sticky top-0 z-10 blur-chrome",
          )}
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((c, i) => (
            <div key={i} className={cn("table-head", c.numeric && "text-right")}>
              {c.header}
              {c.sub && (
                <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-muted-foreground">
                  {c.sub}
                </span>
              )}
            </div>
          ))}
        </div>

        {rows.map((row, ri) => (
          <div key={rowKey(row, ri)}>
            {groupAt.has(ri) && (
              <div className="border-b border-border/60 bg-muted/40 px-5 py-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-secondary-foreground">
                  {groupAt.get(ri)}
                </span>
              </div>
            )}
            <div
              className="grid items-center border-b border-border/60 px-5 py-5 transition-colors last:border-0 hover:bg-muted/10"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((c, ci) => (
                <div key={ci} className={cn("min-w-0", c.numeric && "text-right")}>
                  {c.cell(row)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── CalloutBlock ───────────────────────────────────────
 * The single CTA primitive. Three variants:
 *   inline   — left text + right action, on a plain card
 *   accent   — icon chip + text + filled action, on a tinted card
 *   centered — eyebrow pill + title + body + action, centered
 * Replaces every hand-rolled footer/CTA/claim section. */

export const CalloutBlock = ({
  variant = "inline",
  icon: Icon,
  eyebrow,
  title,
  body,
  action,
  className,
}: {
  variant?: "inline" | "accent" | "centered";
  icon?: any;
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => {
  if (variant === "centered") {
    return (
      <div className={cn("surface-card mt-14 p-10 text-center", className)}>
        {eyebrow && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h2 className="section-title">{title}</h2>
        {body && <p className="mx-auto mt-2 mb-7 max-w-md text-muted-foreground">{body}</p>}
        {action}
      </div>
    );
  }

  if (variant === "accent") {
    return (
      <div
        className={cn(
          "mt-14 flex flex-col items-stretch gap-4 rounded-xl border border-primary/30 bg-primary/10 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6",
          className,
        )}
      >
        {Icon && (
          <div className="icon-frame h-12 w-12 shrink-0 [&>svg]:h-6 [&>svg]:w-6">
            <Icon />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium tracking-tight text-primary">{title}</h2>
          {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "surface-card mt-14 flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-medium tracking-tight text-foreground">{title}</h2>
        {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/* ── FaqList ────────────────────────────────────────────
 * The single definition-list primitive: question/answer pairs
 * (or generic term/detail). Replaces hand-rolled <dl> and <ul> blocks. */

export const FaqList = ({
  items,
  className,
}: {
  items: { q: ReactNode; a: ReactNode }[];
  className?: string;
}) => (
  <dl className={cn("space-y-4", className)}>
    {items.map((item, i) => (
      <div key={i} className="surface-card p-5">
        <dt className="text-base font-medium text-foreground">{item.q}</dt>
        <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
      </div>
    ))}
  </dl>
);
