import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Loader2, Shield, ShieldOff, Award, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getRegistrarColor } from "@/lib/registrarColors";
import { PageMain, PageHeader, Section, Eyebrow, Stat, StatGrid } from "@/components/PageKit";

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
}

const Pricing = () => {
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

  const tldSummaries = useMemo(() => {
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
      summaries.push({ tld, prices: list, cheapestReg, cheapestRenew, cheapestTransfer, best3Year });
    }

    summaries.sort((a, b) => {
      const ai = tldOrder.indexOf(a.tld);
      const bi = tldOrder.indexOf(b.tld);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return summaries;
  }, [prices]);

  const registrars = useMemo(() => {
    if (!prices) return [];
    return [...new Set(prices.map((p) => p.registrar))].sort();
  }, [prices]);

  return (
    <div className="min-h-screen bg-transparent">
      <Helmet>
        <title>Domain Pricing Comparison — DigMyName</title>
        <meta name="description" content="Compare domain registration, renewal, and transfer prices side-by-side across major registrars." />
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
          lede={`Registration, renewal and transfer prices compared across ${registrars.length} registrars and ${tldSummaries.length} extensions — including the renewal traps everyone else hides.`}
        >
          <StatGrid cols={3}>
            <Stat value={tldSummaries.length || "—"} label="TLDs tracked" accent="mint" />
            <Stat value={registrars.length || "—"} label="Registrars" accent="violet" />
            <Stat value="3yr" label="True cost basis" />
          </StatGrid>

        </PageHeader>

        {isLoading ? (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-aurora" />
            <p className="mt-3 text-sm text-muted-foreground">Loading prices…</p>
          </div>
        ) : (
          <>
            {/* Summary table */}
            <Section title="Cheapest per extension" lede="One row per TLD — the best price we found for each action." aside="Updated daily">
              <div className="bento overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Domain</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Cheapest Registration</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Cheapest Renewal</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Cheapest Transfer</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Best 3-Year Value</th>
                    <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">WHOIS Privacy</th>
                  </tr>
                </thead>
                <tbody>
                  {tldSummaries.map((s) => {
                    const best3Cost = s.best3Year.reg_price + s.best3Year.renew_price * 2;
                    return (
                      <tr key={s.tld} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/30">
                        <td className="px-5 py-5">
                          <span className="font-display text-2xl font-extrabold tracking-tight text-aurora">.{s.tld}</span>
                        </td>
                        <td className="px-5 py-5">
                          <SummaryPriceCell registrar={s.cheapestReg.registrar} price={s.cheapestReg.reg_price} promo={s.cheapestReg.promo_code} />
                        </td>
                        <td className="px-5 py-5">
                          <SummaryPriceCell
                            registrar={s.cheapestRenew.registrar}
                            price={s.cheapestRenew.renew_price}
                          />
                        </td>
                        <td className="px-5 py-5">
                          {s.cheapestTransfer ? (
                            <SummaryPriceCell registrar={s.cheapestTransfer.registrar} price={s.cheapestTransfer.transfer_price!} />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-5">
                          <div>
                            <span className={`text-sm font-medium ${getRegistrarColor(s.best3Year.registrar).text}`}>{s.best3Year.registrar}</span>
                            <p className="mt-0.5">
                              <span className="font-mono font-mono text-base font-extrabold tabular-nums text-foreground">${best3Cost.toFixed(2)}</span>
                              <span className="text-sm text-muted-foreground"> /3yr</span>
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-5">
                          {s.prices.some((p) => p.whois_privacy) ? (
                            <Shield className="h-5 w-5 text-mint" />
                          ) : (
                            <ShieldOff className="h-5 w-5 text-muted-foreground" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </Section>

            {/* Full comparison by TLD */}
            <Section title="Detailed price comparison" lede="Every registrar we track, per extension. Cheapest first." aside="Lower is better">
              <div className="space-y-4">
                {tldSummaries.map((s) => (
                  <DetailedTldTable key={s.tld} summary={s} />
                ))}
              </div>
            </Section>
          </>
        )}
      </PageMain>
      
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
  const cheapestRegPrice = s.cheapestReg.reg_price;
  const maxRegPrice = Math.max(...s.prices.map((p) => p.reg_price));
  const range = maxRegPrice - cheapestRegPrice || 1;

  return (
    <div className="bento overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/30 px-5 py-4">
        <span className="font-display text-2xl font-extrabold tracking-tight text-aurora">.{s.tld}</span>
        <span className="text-sm text-muted-foreground">{s.prices.length} registrars</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-secondary/20">
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
            const barWidth = range > 0 ? ((p.reg_price - cheapestRegPrice) / range) * 100 : 0;

            return (
              <tr key={p.id} className={`border-b border-border transition-colors hover:bg-secondary/30 ${isCheapest ? "bg-mint/5" : ""}`}>
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
