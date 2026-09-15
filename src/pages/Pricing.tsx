import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { Loader2, Shield, ShieldOff, Search, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getRegistrarColor } from "@/lib/registrarColors";
import { NetworkIcon, StoreIcon, CertificateIcon } from "@/components/StatIcons";
import { PageMain, PageHeader, Section, Eyebrow, Stat, StatGrid, DataTable, type DataRowGroup } from "@/components/PageKit";
import { trackSiteEvent } from "@/lib/siteEvents";
import { TLD_HUB_PATH, legacyTldHash, tldPath } from "@/lib/tldPages";
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
} from "@/lib/pricing";

const NoMatches = ({ query }: { query: string }) => (
  <p className="surface-card p-6 text-sm text-muted-foreground">
    No extensions match “{query}”.
  </p>
);

const Pricing = () => {
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  // Per-extension tables moved to /tld/<tld>. Old deep links (/pricing#tld-io,
  // still out there in shared links and old structured data) land on the new page.
  useEffect(() => {
    const tld = legacyTldHash(location.hash);
    if (tld) navigate(tldPath(tld), { replace: true });
  }, [location.hash, navigate]);

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
  const summaryRows = [...compared, ...single, ...enterprise];
  const groupList = [
    { label: `Compared across registrars · ${compared.length}`, size: compared.length },
    { label: `Tracked at one registrar so far — no comparison yet · ${single.length}`, size: single.length },
    { label: `Premium / enterprise — above $500/yr · ${enterprise.length}`, size: enterprise.length },
  ];
  let start = 0;
  const allGroups: DataRowGroup[] = [];
  for (const g of groupList) {
    if (g.size > 0) allGroups.push({ label: g.label, startIndex: start });
    start += g.size;
  }
  const summaryGroups = allGroups.length > 1 ? allGroups : undefined;

  const registrars = useMemo(() => {
    if (!prices) return [];
    return [...new Set(prices.map((p) => p.registrar))].sort();
  }, [prices]);

  const totals = useMemo(() => splitByComparison(allSummaries), [allSummaries]);

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
          // A plain list of the extensions on the page, each pointing at its own
          // price page. No Product/Offer markup: DigMyName sells nothing here, and
          // Google's merchant-listing rules expect Offer only where the thing is sold.
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Domain extensions with registrar price comparison",
            numberOfItems: allSummaries.length,
            itemListElement: allSummaries.slice(0, 20).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `.${s.tld}`,
              url: `https://digmyname.com${tldPath(s.tld)}`,
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
              lede="One row per TLD — the cheapest registrar we found for each action. Each column can be a different registrar. Open an extension for every registrar's price and the date it was verified. Extensions tracked at only one registrar are listed separately: one price is not a comparison."
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
                      <Link to={tldPath(s.tld)} onClick={() => trackSiteEvent("pricing_tld_view", { tld: s.tld })} className="font-display text-3xl font-extrabold tracking-tight text-mint hover:underline">
                        .{s.tld}
                      </Link>
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
              <p className="mt-4 text-sm text-muted-foreground">
                Every registrar's price for one extension, with the date each was verified:{" "}
                <Link to={TLD_HUB_PATH} className="font-medium text-foreground hover:underline">
                  domain prices by extension
                </Link>
                .
              </p>
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

export default Pricing;
