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
import { PageMain, PageHeader, Section, Eyebrow, Stat, StatGrid, DataTable } from "@/components/PageKit";
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

/** Total 3-year cost of ownership at a registrar: registration + 2 renewals.
 *  Used only to pick the "Best 3-year value" winner. */
const threeYearCost = (p: RegistrarPrice): number => p.reg_price + p.renew_price * 2;

/** A winning cell: the registrar with the best price for one action, plus the
 *  price to show. Each action's winner is independent — the cheapest registrar
 *  for registration may differ from the cheapest for renewal or transfer. This
 *  is NOT cross-registrar splicing: every cell names its own registrar. */
interface Winner {
  registrar: string;
  price: number;
  promo: string | null;
}

/** Lowest `reg_price` across the TLD's registrars. */
const cheapestRegister = (list: RegistrarPrice[]): Winner | null => {
  const best = list.reduce<RegistrarPrice | null>(
    (a, b) => (a == null || b.reg_price < a.reg_price ? b : a),
    null,
  );
  return best ? { registrar: best.registrar, price: best.reg_price, promo: best.promo_code ?? null } : null;
};

/** Lowest `renew_price` across the TLD's registrars. */
const cheapestRenew = (list: RegistrarPrice[]): Winner | null => {
  const best = list.reduce<RegistrarPrice | null>(
    (a, b) => (a == null || b.renew_price < a.renew_price ? b : a),
    null,
  );
  return best ? { registrar: best.registrar, price: best.renew_price, promo: null } : null;
};

/** Lowest `transfer_price` across registrars that publish one. */
const cheapestTransfer = (list: RegistrarPrice[]): Winner | null => {
  const withT = list.filter((p) => p.transfer_price != null);
  if (withT.length === 0) return null;
  const best = withT.reduce((a, b) => ((b.transfer_price ?? Infinity) < (a.transfer_price ?? Infinity) ? b : a));
  return { registrar: best.registrar, price: best.transfer_price!, promo: null };
};

/** Lowest 3-year total (reg + 2 renewals) across registrars. */
const bestThreeYear = (list: RegistrarPrice[]): Winner | null => {
  const best = list.reduce<RegistrarPrice | null>(
    (a, b) => (a == null || threeYearCost(b) < threeYearCost(a) ? b : a),
    null,
  );
  return best ? { registrar: best.registrar, price: threeYearCost(best), promo: best.promo_code ?? null } : null;
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
              </div>
            </div>

            {/* Summary table — one row per TLD, cheapest registrar for each action */}
            <Section
              title="Cheapest per extension"
              lede="One row per TLD — the cheapest registrar we found for each action. Each column can be a different registrar."
              aside={pricesAreStale ? `Prices last verified ${formatAbsolute(lastUpdated)}` : `Prices updated ${formatUpdated(lastUpdated)}`}
            >
              {standard.length === 0 ? (
                <NoMatches query={query} />
              ) : (
              <DataTable
                rows={standard}
                rowKey={(s) => s.tld}
                minWidth="820px"
                columns={[
                  {
                    header: "Domain",
                    width: "1.1fr",
                    cell: (s) => <span className="font-display text-3xl font-extrabold tracking-tight text-mint">.{s.tld}</span>,
                  },
                  {
                    header: "Cheapest register",
                    width: "1fr",
                    cell: (s) => {
                      const reg = cheapestRegister(s.prices);
                      return reg ? <PriceTag registrar={reg.registrar} price={reg.price} suffix="/yr" promo={reg.promo} /> : <NaCell />;
                    },
                  },
                  {
                    header: "Cheapest renew",
                    width: "1fr",
                    cell: (s) => {
                      const renew = cheapestRenew(s.prices);
                      return renew ? <PriceTag registrar={renew.registrar} price={renew.price} suffix="/yr" /> : <NaCell />;
                    },
                  },
                  {
                    header: "Cheapest transfer",
                    width: "1fr",
                    cell: (s) => {
                      const transfer = cheapestTransfer(s.prices);
                      return transfer ? <PriceTag registrar={transfer.registrar} price={transfer.price} suffix="/yr" /> : <NaCell />;
                    },
                  },
                  {
                    header: "Best 3-year value",
                    sub: "reg + 2 renewals",
                    width: "1fr",
                    cell: (s) => {
                      const best3 = bestThreeYear(s.prices);
                      return best3 ? <PriceTag registrar={best3.registrar} price={best3.price} suffix="/3yr" promo={best3.promo} /> : <NaCell />;
                    },
                  },
                  {
                    header: "WHOIS Privacy",
                    width: "0.7fr",
                    cell: (s) =>
                      s.prices.some((p) => p.whois_privacy) ? (
                        <Shield className="h-5 w-5 text-mint" />
                      ) : (
                        <ShieldOff className="h-5 w-5 text-muted-foreground" />
                      ),
                  },
                ]}
              />

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
                      <DetailedTldTable key={s.tld} summary={s} />

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
                    <DetailedTldTable key={s.tld} summary={s} />
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

/* ─── PriceTag ─────────────────────────────────────────── */

/** THE single price primitive: one registrar name, one price, one suffix
 *  ("/yr" or "/3yr"), and an optional promo chip. Used for every price cell in
 *  the summary table so all four columns render identically. Each cell names
 *  its own registrar — this is not cross-registrar splicing. */
const PriceTag = ({
  registrar,
  price,
  suffix,
  promo,
}: {
  registrar: string;
  price: number;
  suffix: string;
  promo?: string | null;
}) => {
  const c = getRegistrarColor(registrar);

  return (
    <div className="min-h-[46px]">
      {/* Fixed-height meta line so the promo badge never shifts row height. */}
      <div className="flex min-h-[22px] items-center gap-1.5">
        <span className={`text-sm font-medium ${c.text}`}>{registrar}</span>
        {promo && (
          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
            {promo}
          </Badge>
        )}
      </div>

      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="font-mono text-base font-extrabold tabular-nums text-foreground">
          ${price.toFixed(2)}
        </span>
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </p>
    </div>
  );
};

/* ─── Detailed TLD Table ───────────────────────────────── */

const DetailedTldTable = ({ summary: s }: { summary: TldSummary }) => {
  // Sort by registration price — cheapest first.
  const sorted = [...s.prices].sort((a, b) => a.reg_price - b.reg_price);
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
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="w-1/4 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Registrar</th>
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
            // Award the cheapest registration (first after the sort).
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
