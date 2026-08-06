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
  cheapestReg: RegistrarPrice;
  cheapestRenew: RegistrarPrice;
  cheapestTransfer: RegistrarPrice | null;
  best3Year: RegistrarPrice;
  isEnterprise: boolean;
  trapMultiplier: number | null;
}

type PriceMode = "reg" | "renew" | "transfer";

const MODE_LABEL: Record<PriceMode, string> = {
  reg: "Register",
  renew: "Renew",
  transfer: "Transfer",
};

const MODE_FORMULA: Record<PriceMode, string> = {
  reg: "reg + 2 renewals",
  renew: "3 renewals",
  transfer: "transfer + 2 renewals",
};

/** Price of a registrar row for the current mode. `null` when the row has no price for it. */
const modePrice = (p: RegistrarPrice, mode: PriceMode): number | null =>
  mode === "reg" ? p.reg_price : mode === "renew" ? p.renew_price : p.transfer_price;

/** Three-year cost of a registrar row for the current mode. `null` when not applicable. */
const modeThreeYear = (p: RegistrarPrice, mode: PriceMode): number | null =>
  mode === "reg"
    ? p.reg_price + p.renew_price * 2
    : mode === "renew"
      ? p.renew_price * 3
      : p.transfer_price != null
        ? p.transfer_price + p.renew_price * 2
        : null;

interface ModeView {
  /** Registrar row that is cheapest for the current mode. */
  primary: RegistrarPrice | null;
  primaryPrice: number | null;
  promo: string | null;
  best3: { row: RegistrarPrice; cost: number } | null;
}

/** One derived view per row, consumed by every summary column. */
const modeView = (s: TldSummary, mode: PriceMode): ModeView => {
  const primary =
    mode === "reg" ? s.cheapestReg : mode === "renew" ? s.cheapestRenew : s.cheapestTransfer;
  const primaryPrice = primary ? modePrice(primary, mode) : null;

  let best3: { row: RegistrarPrice; cost: number } | null = null;
  for (const p of s.prices) {
    const cost = modeThreeYear(p, mode);
    if (cost != null && (!best3 || cost < best3.cost)) best3 = { row: p, cost };
  }

  return {
    primary,
    primaryPrice,
    // Promo codes apply to the registration price only.
    promo: mode === "reg" ? (primary?.promo_code ?? null) : null,
    best3,
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

const Pricing = () => {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PriceMode>("reg");

  const { data: prices, isLoading } = useQuery({
    queryKey: ["registrar-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrar_prices")
        .select("*")
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
      const cheapestRenew = list.reduce((a, b) => a.renew_price < b.renew_price ? a : b);
      const withTransfer = list.filter((p) => p.transfer_price != null);
      const cheapestTransfer = withTransfer.length
        ? withTransfer.reduce((a, b) => (a.transfer_price ?? 999) < (b.transfer_price ?? 999) ? a : b)
        : null;
      const best3Year = list.reduce((a, b) => {
        const costA = a.reg_price + a.renew_price * 2;
        const costB = b.reg_price + b.renew_price * 2;
        return costA < costB ? a : b;
      });
      const isEnterprise = cheapestReg.reg_price > ENTERPRISE_THRESHOLD;
      const trapMultiplier =
        cheapestReg.reg_price > 0 && cheapestReg.renew_price / cheapestReg.reg_price >= 2
          ? cheapestReg.renew_price / cheapestReg.reg_price
          : null;
      summaries.push({
        tld,
        prices: list,
        cheapestReg,
        cheapestRenew,
        cheapestTransfer,
        best3Year,
        isEnterprise,
        trapMultiplier,
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

                <div role="group" aria-label="Price mode" className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/20 p-1">
                  {(Object.keys(MODE_LABEL) as PriceMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      aria-pressed={mode === m}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                        mode === m
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {MODE_LABEL[m]}
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
                <p className="surface-card p-6 text-sm text-muted-foreground">
                  No extensions match “{query}”.
                </p>
              ) : (
              <div className="surface-card-lg overflow-x-auto">
              <table className="min-w-[900px] text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Domain</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Cheapest {MODE_LABEL[mode]}</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Renewal reality</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Best 3-Year Value
                      <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-muted-foreground">
                        {MODE_FORMULA[mode]}
                      </span>
                    </th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">WHOIS Privacy</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {standard.map((s) => {
                    const v = modeView(s, mode);
                    return (
                      <tr key={s.tld} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/10">
                        <td className="px-5 py-5">
                          <span className="font-display text-3xl font-extrabold tracking-tight text-[hsl(var(--aurora-mint))]">.{s.tld}</span>
                        </td>
                        <td className="px-5 py-5 align-middle">
                          {v.primary && v.primaryPrice != null ? (
                            <SummaryPriceCell registrar={v.primary.registrar} price={v.primaryPrice} promo={v.promo} />
                          ) : (
                            <NaCell />
                          )}
                        </td>
                        <td className="px-5 py-5 align-middle">
                          {v.primary ? <RenewalTrap row={v.primary} /> : <NaCell />}
                        </td>
                        <td className="px-5 py-5 align-middle">
                          {v.best3 ? (
                            <div>
                              <span className={`text-sm font-medium ${getRegistrarColor(v.best3.row.registrar).text}`}>{v.best3.row.registrar}</span>
                              <p className="mt-0.5">
                                <span className="font-mono text-base font-extrabold tabular-nums text-foreground">${v.best3.cost.toFixed(2)}</span>
                                <span className="text-sm text-muted-foreground"> /3yr</span>
                              </p>
                            </div>
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
                      <DetailedTldTable key={s.tld} summary={s} mode={mode} />

                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </Section>
            )}

            {/* Full comparison by TLD */}
            <Section title="Detailed price comparison" lede="Every registrar we track, per extension. Cheapest first." aside="Lower is better">
              {standard.length === 0 ? (
                <p className="surface-card p-6 text-sm text-muted-foreground">
                  No extensions match “{query}”.
                </p>
              ) : (
                <div className="space-y-4">
                  {standard.map((s) => (
                    <DetailedTldTable key={s.tld} summary={s} mode={mode} />
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

/* ─── Renewal trap ─────────────────────────────────────── */

const RenewalTrap = ({ summary: s }: { summary: TldSummary }) => {
  if (!s.trapMultiplier) {
    return (
      <div>
        <Badge variant="secondary" className="text-[11px]">Fair renewal</Badge>
        <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
          ${s.cheapestReg.reg_price.toFixed(2)} → ${s.cheapestReg.renew_price.toFixed(2)}
        </p>
      </div>
    );
  }

  const pct = Math.round((s.cheapestReg.renew_price / s.cheapestReg.reg_price - 1) * 100);
  const severe = pct >= 500;

  return (
    <div>
      <Badge
        className={cn(
          "text-[11px] font-bold",
          severe
            ? "border-destructive/40 bg-destructive/15 text-destructive"
            : "border-warning/40 bg-warning/15 text-warning",
        )}
        variant="outline"
      >
        +{pct.toLocaleString()}% at renewal
      </Badge>
      <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
        ${s.cheapestReg.reg_price.toFixed(2)} → ${s.cheapestReg.renew_price.toFixed(2)}
      </p>
    </div>
  );
};

/* ─── Summary Price Cell ───────────────────────────────── */

const SummaryPriceCell = ({
  registrar,
  price,
  promo,
  isWarning,
}: {
  registrar: string;
  price: number;
  promo?: string | null;
  isWarning?: boolean;
}) => {
  const c = getRegistrarColor(registrar);
  return (
    <div>
      <span className={`text-sm font-medium ${c.text}`}>{registrar}</span>
      {promo && (
        <Badge variant="secondary" className="ml-1.5 text-[10px] font-mono px-1.5 py-0">
          {promo}
        </Badge>
      )}
      <p className="mt-0.5">
        <span className={`text-base font-extrabold ${isWarning ? "text-warning" : "text-foreground"}`}>${price.toFixed(2)}</span>
        <span className="text-sm text-muted-foreground">/yr</span>
      </p>
    </div>
  );
};

/* ─── Detailed TLD Table ───────────────────────────────── */

const DetailedTldTable = ({ summary: s }: { summary: TldSummary }) => {
  const sorted = [...s.prices].sort((a, b) => a.reg_price - b.reg_price);
  const newestUpdated = sorted.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at;

  return (
    <div className="surface-card-lg overflow-x-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <span className="font-display text-2xl font-extrabold tracking-tight text-aurora">.{s.tld}</span>
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
            const isCheapest = i === 0;
            const renewHigher = p.renew_price > p.reg_price * 1.8;

            return (
              <tr key={p.id} className="border-b border-border transition-colors hover:bg-muted/10">
                <td className="px-5 py-4">
                  <span className={`text-base font-bold ${isCheapest ? "text-mint" : c.text}`}>
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
                  <span className={`font-mono text-base font-extrabold tabular-nums ${renewHigher ? "text-warning" : "text-foreground"}`}>
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
                    <ShieldOff className="h-5 w-5 text-muted-foreground/50" />
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
