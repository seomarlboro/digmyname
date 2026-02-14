import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Loader2, ExternalLink, Shield, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    <div className="min-h-screen bg-background">
      <Header />
      <section className="hero-gradient pb-8 pt-16 md:pb-12 md:pt-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-gradient text-3xl font-extrabold md:text-5xl">
            Domain Pricing Comparison
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground">
            Compare registration, renewal & transfer prices across {registrars.length} registrars
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 pb-20">
        {isLoading ? (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading prices…</p>
          </div>
        ) : (
          <>
            {/* Summary table */}
            <div className="mt-8 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-primary">Domain</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-available">Cheapest Registration</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-available">Cheapest Renewal</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-available">Cheapest Transfer</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-primary">Best 3-Year Value</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">WHOIS Privacy</th>
                  </tr>
                </thead>
                <tbody>
                  {tldSummaries.map((s) => (
                    <tr key={s.tld} className="border-b border-border transition-colors hover:bg-secondary/30">
                      <td className="px-5 py-5">
                        <span className="text-xl font-extrabold text-primary">.{s.tld}</span>
                      </td>
                      <td className="px-5 py-5">
                        <PriceCell price={s.cheapestReg} field="reg" />
                      </td>
                      <td className="px-5 py-5">
                        <PriceCell price={s.cheapestRenew} field="renew" />
                      </td>
                      <td className="px-5 py-5">
                        {s.cheapestTransfer ? (
                          <PriceCell price={s.cheapestTransfer} field="transfer" />
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-5">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{s.best3Year.registrar}</p>
                          <p className="text-sm text-muted-foreground">
                            <span className="font-bold text-foreground">${(s.best3Year.reg_price + s.best3Year.renew_price * 2).toFixed(2)}</span> /3yr
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        {s.prices.some((p) => p.whois_privacy) ? (
                          <Shield className="h-5 w-5 text-available" />
                        ) : (
                          <ShieldOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Full comparison by TLD */}
            <h2 className="mt-12 mb-6 text-2xl font-extrabold text-foreground">Detailed Price Comparison</h2>
            <div className="space-y-6">
              {tldSummaries.map((s) => (
                <div key={s.tld} className="overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center gap-3 border-b border-border bg-secondary/30 px-5 py-4">
                    <span className="text-2xl font-extrabold text-primary">.{s.tld}</span>
                    <span className="text-sm text-muted-foreground">{s.prices.length} registrars</span>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-secondary/20">
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Registrar</th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Register</th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Renew</th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Transfer</th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">ICANN Fee</th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Promo</th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">WHOIS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.prices
                        .sort((a, b) => a.reg_price - b.reg_price)
                        .map((p, i) => {
                          const isCheapest = p.registrar === s.cheapestReg.registrar;
                          return (
                            <tr key={p.id} className={`border-b border-border transition-colors hover:bg-secondary/30 ${i === 0 ? "bg-available/5" : ""}`}>
                              <td className="px-5 py-3.5">
                                <span className={`text-sm font-semibold ${isCheapest ? "text-available" : "text-foreground"}`}>
                                  {p.registrar}
                                </span>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className={`text-sm font-bold ${isCheapest ? "text-available" : "text-foreground"}`}>
                                  ${p.reg_price.toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">/yr</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="text-sm font-bold text-foreground">${p.renew_price.toFixed(2)}</span>
                                <span className="text-xs text-muted-foreground">/yr</span>
                              </td>
                              <td className="px-5 py-3.5">
                                {p.transfer_price != null ? (
                                  <>
                                    <span className="text-sm font-bold text-foreground">${p.transfer_price.toFixed(2)}</span>
                                    <span className="text-xs text-muted-foreground">/yr</span>
                                  </>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="text-sm text-muted-foreground">${p.icann_fee.toFixed(2)}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                {p.promo_code ? (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {p.promo_code}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                {p.whois_privacy ? (
                                  <Shield className="h-4 w-4 text-available" />
                                ) : (
                                  <ShieldOff className="h-4 w-4 text-muted-foreground" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const PriceCell = ({ price, field }: { price: RegistrarPrice; field: "reg" | "renew" | "transfer" }) => {
  const value = field === "reg" ? price.reg_price : field === "renew" ? price.renew_price : price.transfer_price;
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{price.registrar}</p>
      {price.promo_code && field === "reg" && (
        <Badge variant="secondary" className="text-[10px] font-mono mt-0.5 px-1.5 py-0">
          {price.promo_code}
        </Badge>
      )}
      <p className="mt-0.5 text-sm">
        <span className="font-bold text-foreground">${(value ?? 0).toFixed(2)}</span>
        <span className="text-muted-foreground">/yr</span>
      </p>
    </div>
  );
};

export default Pricing;
