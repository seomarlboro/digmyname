import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { Loader2, Shield, ShieldOff, Award, Search, ChevronDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getRegistrarColor } from "@/lib/registrarColors";
import { NetworkIcon, StoreIcon, CertificateIcon } from "@/components/StatIcons";
import { PageMain, PageHeader, Section, Eyebrow, Stat, StatGrid, DataTable } from "@/components/PageKit";
import { cn } from "@/lib/utils";
import {
  bestThreeYear,
  cheapestRegister,
  cheapestRenew,
  cheapestTransfer,
  formatAbsolute,
  formatUpdated,
  isStale,
  newestUpdate,
  splitByComparison,
  summarize,
  type RegistrarPrice,
  type TldSummary,
} from "@/lib/pricing";

/** With this few extensions on screen the detailed tables open by default. */
const AUTO_EXPAND_AT_OR_BELOW = 3;

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
        .select("id,tld,registrar,reg_price,renew_price,transfer_price,icann_fee,promo_code,whois_privacy,affiliate_url,updated_at")
        .eq("supported", true)
        .order("tld")
        .order("reg_price");
      if (error) throw error;
      return data as RegistrarPrice[];
    },
  });

  const lastUpdated = useMemo(() => (prices?.length ? newestUpdate(prices) : undefined), [prices]);
  const pricesAreStale = isStale(lastUpdated);

  const allSummaries = useMemo(() => (prices ? summarize(prices) : []), [prices]);

  const filtered = useMemo(() => {
    const q = query.trim().replace(/^\./, "").toLowerCase();
    if (!q) return allSummaries;
    return allSummaries.filter((s) => s.tld.includes(q));
  }, [allSummaries, query]);

  const standard = filtered.filter((s) => !s.isEnterprise);
  const enterprise = filtered.filter((s) => s.isEnterprise);
  const { compared, single } = splitByComparison(standard);
  const summaryRows = [...compared, ...single];
  const summaryGroups =
    compared.length > 0 && single.length > 0
      ? [
          { label: `Compared across registrars · ${compared.length}`, startIndex: 0 },
          { label: `Tracked at one registrar so far — no comparison yet · ${single.length}`, startIndex: compared.length },
        ]
      : undefined;

  const registrars = useMemo(() => {
    if (!prices) return [];
    return [...new Set(prices.map((p) => p.registrar))].sort();
  }, [prices]);

  const totals = useMemo(() => splitByComparison(allSummaries), [allSummaries]);
  const detailsOpenByDefault = standard.length <= AUTO_EXPAND_AT_OR_BELOW;

  return (
    <div className="min-h-screen bg-background">
      <RouteHead path="/pricing">
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
          // A plain list of the extensions on the page. No Product/Offer markup:
          // DigMyName sells nothing here, and Google's merchant-listing rules
          // expect Offer only on the page where the thing is actually sold.
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Domain extensions with registrar price comparison",
            numberOfItems: allSummaries.length,
            itemListElement: allSummaries.slice(0, 20).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `.${s.tld}`,
              url: `https://digmyname.com/pricing#tld-${s.tld}`,
            })),
          })}</script>
        )}
      </RouteHead>
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
          lede={
            allSummaries.length
              ? `Registration, renewal and transfer prices from ${registrars.length} registrars: ${totals.compared.length} extensions compared side by side, ${totals.single.length} tracked at a single registrar so far — including the renewal traps everyone else hides.`
              : "Registration, renewal and transfer prices compared across registrars — including the renewal traps everyone else hides."
          }
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
            {/* Sticky filter bar — pinned right under the 4 rem header */}
            <div className="sticky top-16 z-30 -mx-4 mb-6 border-y border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
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
              lede="One row per TLD — the cheapest registrar we found for each action. Each column can be a different registrar. Extensions tracked at only one registrar are listed separately: one price is not a comparison."
              aside={pricesAreStale ? `Prices last verified ${formatAbsolute(lastUpdated)}` : `Prices updated ${formatUpdated(lastUpdated)}`}
            >
              {summaryRows.length === 0 ? (
                <NoMatches query={query} />
              ) : (
              <DataTable
                rows={summaryRows}
                groups={summaryGroups}
                rowKey={(s) => s.tld}
                minWidth="820px"
                columns={[
                  {
                    header: "Domain",
                    width: "1.1fr",
                    cell: (s) => (
                      <a href={`#tld-${s.tld}`} className="font-display text-3xl font-extrabold tracking-tight text-mint hover:underline">
                        .{s.tld}
                      </a>
                    ),
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
                      return renew ? <PriceTag registrar={s.prices.length > 1 ? renew.registrar : null} price={renew.price} suffix="/yr" /> : <NaCell />;
                    },
                  },
                  {
                    header: "Cheapest transfer",
                    width: "1fr",
                    cell: (s) => {
                      const transfer = cheapestTransfer(s.prices);
                      return transfer ? <PriceTag registrar={s.prices.length > 1 ? transfer.registrar : null} price={transfer.price} suffix="/yr" /> : <NaCell />;
                    },
                  },
                  {
                    header: "Best 3-year value",
                    sub: "reg + 2 renewals",
                    width: "1fr",
                    cell: (s) => {
                      const best3 = bestThreeYear(s.prices);
                      return best3 ? <PriceTag registrar={s.prices.length > 1 ? best3.registrar : null} price={best3.price} suffix="/3yr" promo={best3.promo} /> : <NaCell />;
                    },
                  },
                  {
                    header: "WHOIS Privacy",
                    width: "0.7fr",
                    cell: (s) =>
                      s.prices.some((p) => p.whois_privacy) ? (
                        <Shield className="h-5 w-5 text-mint" aria-label="WHOIS privacy included" />
                      ) : (
                        <ShieldOff className="h-5 w-5 text-muted-foreground" aria-label="No WHOIS privacy" />
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
                      <DetailedTldTable key={s.tld} summary={s} defaultOpen />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </Section>
            )}

            {/* Full comparison by TLD — collapsed rows, so the page is not 53 tables tall */}
            <Section title="Detailed price comparison" lede="Every registrar we track, per extension. Cheapest first. Open an extension to see all of its rows." aside="Lower is better">
              {standard.length === 0 ? (
                <NoMatches query={query} />
              ) : (
                <div className="space-y-3">
                  {standard.map((s) => (
                    <DetailedTldTable key={`${s.tld}-${detailsOpenByDefault}`} summary={s} defaultOpen={detailsOpenByDefault} />
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
 *  its own registrar — this is not cross-registrar splicing. `registrar: null`
 *  keeps the layout but prints no name: used when a TLD has a single registrar,
 *  so its name isn't repeated four times across a row that compares nothing. */
const PriceTag = ({
  registrar,
  price,
  suffix,
  promo,
}: {
  registrar: string | null;
  price: number;
  suffix: string;
  promo?: string | null;
}) => {
  const c = registrar ? getRegistrarColor(registrar) : null;

  return (
    <div className="min-h-[46px]">
      {/* Fixed-height meta line so the promo badge never shifts row height. */}
      <div className="flex min-h-[22px] items-center gap-1.5">
        {registrar ? (
          <span className={`text-sm font-medium ${c?.text ?? ""}`}>{registrar}</span>
        ) : (
          <span className="text-xs text-muted-foreground">same registrar</span>
        )}
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

const DetailedTldTable = ({ summary: s, defaultOpen = false }: { summary: TldSummary; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  // Sort by registration price — cheapest first.
  const sorted = [...s.prices].sort((a, b) => a.reg_price - b.reg_price);
  const newestUpdated = newestUpdate(sorted);
  const cheapest = sorted[0];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div id={`tld-${s.tld}`} className="surface-card-lg scroll-mt-32 overflow-hidden">
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/10">
          <span className="font-display text-2xl font-extrabold tracking-tight text-mint">.{s.tld}</span>
          <span className="text-sm text-muted-foreground">
            {s.prices.length === 1 ? "1 registrar" : `${s.prices.length} registrars`}
          </span>
          {!open && cheapest && (
            <span className="text-sm text-muted-foreground">
              from <span className="font-mono font-semibold tabular-nums text-foreground">${cheapest.reg_price.toFixed(2)}</span>/yr at{" "}
              <span className={cn("font-medium", getRegistrarColor(cheapest.registrar).text)}>{cheapest.registrar}</span>
            </span>
          )}
          <span className={cn("ml-auto text-xs", isStale(newestUpdated) ? "text-warning" : "text-muted-foreground")}>
            Updated {formatUpdated(newestUpdated)}
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t border-border/50">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border/50">
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
                  // Award the cheapest registration only when there is something to beat.
                  const isCheapest = i === 0 && sorted.length > 1;
                  const renewHigher = p.renew_price > p.reg_price * 1.8;

                  return (
                    <tr key={p.id} className={cn("border-b border-border/40 transition-colors last:border-0 hover:bg-muted/10", isCheapest && "bg-mint/[0.04]")}>
                      <td className="px-5 py-4">
                        <span className={`text-base font-bold ${c.text}`}>
                          {p.registrar}
                        </span>
                        {isCheapest && <Award className="ml-1.5 inline h-4 w-4 text-mint" aria-label="Cheapest registration" />}
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
                          title={renewHigher ? "Renews at more than 1.8× the first-year price" : undefined}
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
                        <span className="text-sm font-medium tabular-nums text-muted-foreground">${(p.icann_fee ?? 0).toFixed(2)}</span>
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
                          <Shield className="h-5 w-5 text-mint" aria-label="WHOIS privacy included" />
                        ) : (
                          <ShieldOff className="h-5 w-5 text-muted-foreground/70" aria-label="No WHOIS privacy" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default Pricing;
