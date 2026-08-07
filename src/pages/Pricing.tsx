import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Loader2, Shield, ShieldOff, Award, Search, ChevronDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getRegistrarColor } from "@/lib/registrarColors";
import { NetworkIcon, StoreIcon, CertificateIcon } from "@/components/StatIcons";
import { PageMain, PageHeader, Section, Eyebrow, Stat, StatGrid } from "@/components/PageKit";
import { cn } from "@/lib/utils";

interface RegistrarPrice {
  id: string;
  registrar: string;
  tld: string;
  reg_price: number;
  renew_price: number;
  transfer_price: number | null;
  icann_fee: number;
  promo_code: string | null;
  whois_privacy: boolean;
  updated_at: string;
}

interface TldSummary {
  tld: string;
  prices: RegistrarPrice[];
  /** Cheapest registration — used only for JSON-LD structured data. */
  cheapestReg: RegistrarPrice;
  /** Whether year-1 registration exceeds the enterprise threshold (splits the table). */
  isEnterprise: boolean;
}

/** Ownership horizon in years. The user picks one; the whole table re-derives
 *  a single final price per TLD for that horizon. */
type PriceTerm = 1 | 2 | 3;

const TERMS: readonly PriceTerm[] = [1, 2, 3];

const TERM_LABEL: Record<PriceTerm, string> = {
  1: "1 year",
  2: "2 years",
  3: "3 years",
};

/** Formula caption shown under the price column header. */
const TERM_FORMULA: Record<PriceTerm, string> = {
  1: "registration",
  2: "reg + 1 renewal",
  3: "reg + 2 renewals",
};

/** Total cost of owning a domain at this registrar for `term` years.
 *  Year 1 is the registration price; every subsequent year is a renewal.
 *  This is the ONLY figure the table shows — one number, one registrar. */
const termCost = (p: RegistrarPrice, term: PriceTerm): number =>
  p.reg_price + p.renew_price * (term - 1);

interface TermView {
  /** The single registrar that owns this row — cheapest total for the term. */
  primary: RegistrarPrice | null;
  /** The one final price shown big: total cost over `term` years. */
  total: number | null;
  /** Promo code, if the winning registrar has one (applies to registration). */
  promo: string | null;
  /** Renewal-trap ratio (renew/reg). Non-null only when it's a real trap (≥2×). */
  trapRatio: number | null;
}

/** One derived view per row. Picks the single registrar with the lowest total
 *  cost of ownership for the selected term, and exposes ONE price from it.
 *  INVARIANT: no cross-registrar splicing — price, promo and trap badge all come
 *  from the same `primary` row. */
const termView = (s: TldSummary, term: PriceTerm): TermView => {
  let best: { row: RegistrarPrice; total: number } | null = null;
  for (const p of s.prices) {
    const total = termCost(p, term);
    if (!best || total < best.total) best = { row: p, total };
  }
  if (!best) return { primary: null, total: null, promo: null, trapRatio: null };

  const { row, total } = best;
  const ratio =
    row.reg_price > 0 && row.renew_price / row.reg_price >= 2
      ? row.renew_price / row.reg_price
      : null;

  return {
    primary: row,
    total,
    promo: row.promo_code ?? null,
    // Trap only matters when the term includes at least one renewal.
    trapRatio: term > 1 ? ratio : null,
  };
};


const ENTERPRISE_THRESHOLD = 500;

const formatUpdated = (iso: string | undefined) => {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
};

const STALE_AFTER_DAYS = 14;

const isStale = (iso: string | undefined) => {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
};

const formatAbsolute = (iso: string | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const NoMatches = ({ query }: { query: string }) => (
  <p className="surface-card p-6 text-sm text-muted-foreground">
    No extensions match “{query}”.
  </p>
);


const Pricing = () => {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState<PriceTerm>(3);

  const { data: prices, isLoading } = useQuery({
    queryKey: ["registrar-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrar_prices")
        .select("*")
        .eq("supported", true)
        .order("tld")
        .order("reg_price");
      if (error) throw error;
      return data as RegistrarPrice[];
    },
  });

  const lastUpdated = useMemo(() => {
    if (!prices?.length) return undefined;
    return prices.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at;
  }, [prices]);

  const pricesAreStale = isStale(lastUpdated);

  const allSummaries = useMemo(() => {
    if (!prices) return [];
    const grouped = new Map<string, RegistrarPrice[]>();
    for (const p of prices) {
      if (!grouped.has(p.tld)) grouped.set(p.tld, []);
      grouped.get(p.tld)!.push(p);
    }

    const tldOrder = ["com", "net", "org", "io", "ai", "co", "xyz", "me", "app", "dev", "tech", "shop", "site", "online", "club"];

    const summaries: TldSummary[] = [];
    for (const [tld, list] of grouped) {
      const cheapestReg = list.reduce((a, b) => a.reg_price < b.reg_price ? a : b);
      const isEnterprise = cheapestReg.reg_price > ENTERPRISE_THRESHOLD;
      summaries.push({
        tld,
        prices: list,
        cheapestReg,
        isEnterprise,
      });
    }

    summaries.sort((a, b) => {
      const ai = tldOrder.indexOf(a.tld);
      const bi = tldOrder.indexOf(b.tld);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return summaries;
  }, [prices]);

  const filtered = useMemo(() => {
    const q = query.trim().replace(/^\./, "").toLowerCase();
    if (!q) return allSummaries;
    return allSummaries.filter((s) => s.tld.includes(q));
  }, [allSummaries, query]);

  const standard = filtered.filter((s) => !s.isEnterprise);
  const enterprise = filtered.filter((s) => s.isEnterprise);

  const registrars = useMemo(() => {
    if (!prices) return [];
    return [...new Set(prices.map((p) => p.registrar))].sort();
  }, [prices]);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Domain Pricing Comparison — DigMyName</title>
        <meta name="description" content="Compare domain registration, renewal, and transfer prices side-by-side across major registrars — including the renewal traps everyone else hides." />
        <link rel="canonical" href="https://digmyname.com/pricing" />
        <meta property="og:title" content="Domain Pricing Comparison — DigMyName" />
        <meta property="og:description" content="Side-by-side domain prices across major registrars." />
        <meta property="og:url" content="https://digmyname.com/pricing" />
        <meta property="og:image" content="https://digmyname.com/og-image.jpg" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": "Domain Pricing Comparison",
          "description": "Compare registration, renewal and transfer prices across registrars for popular TLDs.",
          "url": "https://digmyname.com/pricing"
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://digmyname.com/" },
            { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://digmyname.com/pricing" }
          ]
        })}</script>
        {allSummaries.length > 0 && (
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Cheapest domain registration prices by extension",
            itemListElement: allSummaries.slice(0, 20).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Product",
                name: `.${s.tld} domain registration`,
                category: "Domain name registration",
                offers: {
                  "@type": "Offer",
                  price: s.cheapestReg.reg_price.toFixed(2),
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  seller: { "@type": "Organization", name: s.cheapestReg.registrar },
                },
              },
            })),
          })}</script>
        )}
      </Helmet>
      <Header />
      <PageMain>
        <PageHeader
          eyebrow={<Eyebrow>Pricing</Eyebrow>}
          title={
            <>
              Domain pricing,{" "}
              <span className="text-aurora-gradient">side by side.</span>
            </>
          }
          lede={`Registration, renewal and transfer prices compared across ${registrars.length} registrars and ${allSummaries.length} extensions — including the renewal traps everyone else hides.`}
        >
          <StatGrid cols={3}>
            <Stat value={allSummaries.length || "—"} label="TLDs tracked" accent="mint" icon={NetworkIcon} />
            <Stat value={registrars.length || "—"} label="Registrars" accent="violet" icon={StoreIcon} />
            <Stat value="3yr" label="True cost basis" icon={CertificateIcon} />
          </StatGrid>

        </PageHeader>

        {pricesAreStale && (
          <div className="surface-card mb-6 flex items-start gap-3 border-warning/40 bg-warning/15 p-4 text-warning">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Prices last verified {formatAbsolute(lastUpdated)} — they may be outdated. We're
              working on refreshing them.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-aurora" />
            <p className="mt-3 text-sm text-muted-foreground">Loading prices…</p>
          </div>
        ) : (
          <>
            {/* Sticky filter bar */}
            <div className="sticky top-[68px] z-30 -mx-4 mb-6 border-y border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter extensions — try io, ai, shop"
                    aria-label="Filter TLDs"
                    className="h-10 pl-9"
                  />
                </div>

                <div role="group" aria-label="Ownership term" className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/20 p-1">
                  {TERMS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTerm(t)}
                      aria-pressed={term === t}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                        term === t
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {TERM_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary table */}
            <Section
              title="Cheapest per extension"
              lede="One row per TLD — the best price we found for each action."
              aside={pricesAreStale ? `Prices last verified ${formatAbsolute(lastUpdated)}` : `Prices updated ${formatUpdated(lastUpdated)}`}
            >
              {standard.length === 0 ? (
                <NoMatches query={query} />
              ) : (
              <div className="surface-card-lg overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Domain</th>
                    <th className="w-1/3 px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Best price · {TERM_LABEL[term]}
                      <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-muted-foreground">
                        {TERM_FORMULA[term]}
                      </span>
                    </th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">WHOIS Privacy</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {standard.map((s) => {
                    const v = termView(s, term);
                    return (
                      <tr key={s.tld} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/10">
                        <td className="px-5 py-5">
                          <span className="font-display text-3xl font-extrabold tracking-tight text-mint">.{s.tld}</span>
                        </td>
                        <td className="px-5 py-5 align-middle">
                          {v.primary && v.total != null ? (
                            <FinalPriceCell view={v} term={term} />
                          ) : (
                            <NaCell />
                          )}
                        </td>

                        <td className="px-5 py-5">
                          {s.prices.some((p) => p.whois_privacy) ? (
                            <Shield className="h-5 w-5 text-mint" />
                          ) : (
                            <ShieldOff className="h-5 w-5 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-5 py-5">
                          {(() => {
                            const rowUpdated = s.prices.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at;
                            return (
                              <span className={cn("text-sm", isStale(rowUpdated) ? "text-warning" : "text-muted-foreground")}>
                                {formatUpdated(rowUpdated)}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              )}
            </Section>

            {/* Premium / enterprise TLDs */}
            {enterprise.length > 0 && (
              <Section
                title="Premium / enterprise extensions"
                lede="Extensions above $500/yr. Collapsed by default so they don't distort the normal prices."
              >
                <Collapsible>
                  <CollapsibleTrigger className="surface-card group flex w-full items-center justify-between p-5 text-left">
                    <span className="text-base font-bold text-foreground">
                      {enterprise.length} enterprise-priced {enterprise.length === 1 ? "extension" : "extensions"}
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({enterprise.map((s) => `.${s.tld}`).join(", ")})
                      </span>
                    </span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4">
                    {enterprise.map((s) => (
                      <DetailedTldTable key={s.tld} summary={s} term={term} />

                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </Section>
            )}

            {/* Full comparison by TLD */}
            <Section title="Detailed price comparison" lede="Every registrar we track, per extension. Cheapest first." aside="Lower is better">
              {standard.length === 0 ? (
                <NoMatches query={query} />
              ) : (
                <div className="space-y-4">
                  {standard.map((s) => (
                    <DetailedTldTable key={s.tld} summary={s} term={term} />
                  ))}
                </div>
              )}
            </Section>

          </>
        )}
      </PageMain>
      
    </div>
  );
};

/* ─── n/a cell ─────────────────────────────────────────── */

/** Consistent, height-stable placeholder so rows do not shrink when a term has no data. */
const NaCell = () => (
  <div className="flex min-h-[46px] items-center text-sm text-muted-foreground">—</div>
);

/* ─── Final price cell ─────────────────────────────────── */

/** The single price the table shows per row: total cost of ownership over the
 *  selected term, from ONE registrar. One big number, the winning registrar's
 *  name, an optional promo, and — when the term includes a renewal and that
 *  renewal is a rip-off — a small trap badge underneath. No cross-registrar
 *  splicing, no "$X → $Y" arrows. */
const FinalPriceCell = ({ view, term }: { view: TermView; term: PriceTerm }) => {
  const { primary, total, promo, trapRatio } = view;
  if (!primary || total == null) return <NaCell />;

  const c = getRegistrarColor(primary.registrar);
  const trapPct = trapRatio != null ? Math.round((trapRatio - 1) * 100) : null;
  const severe = trapPct != null && trapPct >= 500;
  // Per-year average helps compare across terms without a second big number.
  const perYear = total / term;

  return (
    <div className="min-h-[46px]">
      {/* Fixed-height meta line so the promo badge never shifts row height. */}
      <div className="flex min-h-[22px] items-center gap-1.5">
        <span className={`text-sm font-medium ${c.text}`}>{primary.registrar}</span>
        {promo && (
          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
            {promo}
          </Badge>
        )}
      </div>

      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-base font-extrabold tabular-nums text-foreground">
          ${total.toFixed(2)}
        </span>
        <span className="text-sm text-muted-foreground">
          {term === 1 ? "/yr" : `/${term}yr`}
        </span>
        {term > 1 && (
          <span className="text-xs text-muted-foreground">
            (${perYear.toFixed(2)}/yr avg)
          </span>
        )}
      </p>

      {/* Trap badge sits UNDER the price, only when a renewal is priced in. */}
      {trapPct != null && (
        <div className="mt-1">
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] font-bold",
              severe
                ? "border-destructive/40 bg-destructive/15 text-destructive"
                : "border-warning/40 bg-warning/15 text-warning",
            )}
          >
            +{trapPct.toLocaleString()}% at renewal
          </Badge>
        </div>
      )}
    </div>
  );
};

/* ─── Detailed TLD Table ───────────────────────────────── */

const DetailedTldTable = ({ summary: s, term }: { summary: TldSummary; term: PriceTerm }) => {
  // Sort by total cost of ownership over the selected term — same basis as the
  // headline table, so the Award always lands on the row that wins upstairs.
  const sorted = [...s.prices].sort((a, b) => termCost(a, term) - termCost(b, term));
  const newestUpdated = sorted.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at;


  return (
    <div className="surface-card-lg overflow-x-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <span className="font-display text-2xl font-extrabold tracking-tight text-mint">.{s.tld}</span>
        <span className="text-sm text-muted-foreground">{s.prices.length} registrars</span>
        <span className={cn("ml-auto text-xs", isStale(newestUpdated) ? "text-warning" : "text-muted-foreground")}>
          Updated {formatUpdated(newestUpdated)}
        </span>
      </div>
      <table className="min-w-[820px] text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Registrar</th>
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Register</th>
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Renew</th>
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Transfer</th>
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">ICANN Fee</th>
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Promo</th>
            <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">WHOIS</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const c = getRegistrarColor(p.registrar);
            // Award the cheapest by total cost of ownership over the term.
            const isCheapest = i === 0;
            const renewHigher = p.renew_price > p.reg_price * 1.8;

            return (
              <tr key={p.id} className="border-b border-border transition-colors hover:bg-muted/10">
                <td className="px-5 py-4">
                  <span className={`text-base font-bold ${c.text}`}>
                    {p.registrar}
                  </span>
                  {isCheapest && <Award className="ml-1.5 inline h-4 w-4 text-mint" />}
                </td>
                <td className="px-5 py-4">
                  <span className={`font-mono text-base font-extrabold tabular-nums ${isCheapest ? "text-mint" : "text-foreground"}`}>
                    ${p.reg_price.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground">/yr</span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={cn(
                      "font-mono text-base font-extrabold tabular-nums",
                      renewHigher ? "text-warning" : "text-foreground",
                    )}
                  >
                    ${p.renew_price.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground">/yr</span>
                </td>
                <td className="px-5 py-4">
                  {p.transfer_price != null ? (
                    <>
                      <span className="font-mono text-base font-extrabold tabular-nums text-foreground">${p.transfer_price.toFixed(2)}</span>
                      <span className="text-sm text-muted-foreground">/yr</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}

                </td>
                <td className="px-5 py-4">
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">${p.icann_fee.toFixed(2)}</span>
                </td>
                <td className="px-5 py-4">
                  {p.promo_code ? (
                    <Badge variant="secondary" className="text-xs font-mono px-2 py-0.5">
                      {p.promo_code}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {p.whois_privacy ? (
                    <Shield className="h-5 w-5 text-mint" />
                  ) : (
                    <ShieldOff className="h-5 w-5 text-muted-foreground/70" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Pricing;
