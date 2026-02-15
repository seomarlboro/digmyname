import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Loader2, Shield, ShieldOff, TrendingDown, Award, ArrowRightLeft, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getRegistrarColor } from "@/lib/registrarColors";

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
          {/* Registrar legend */}
          <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-3">
            {registrars.map((r) => {
              const c = getRegistrarColor(r);
              return (
                <span key={r} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${c.bg} ${c.border} ${c.text}`}>
                  <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                  {r}
                </span>
              );
            })}
          </div>
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
            {/* Summary cards grid */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tldSummaries.map((s) => (
                <SummaryCard key={s.tld} summary={s} />
              ))}
            </div>

            {/* Full comparison by TLD */}
            <h2 className="mt-14 mb-6 text-2xl font-extrabold text-foreground">Detailed Price Comparison</h2>
            <div className="space-y-6">
              {tldSummaries.map((s) => (
                <DetailedTldCard key={s.tld} summary={s} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

/* ─── Summary Card ─────────────────────────────────────── */

const SummaryCard = ({ summary: s }: { summary: TldSummary }) => {
  const best3YearCost = s.best3Year.reg_price + s.best3Year.renew_price * 2;
  const regColor = getRegistrarColor(s.cheapestReg.registrar);
  const renewColor = getRegistrarColor(s.cheapestRenew.registrar);
  const best3Color = getRegistrarColor(s.best3Year.registrar);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card/80 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-2xl font-extrabold text-primary">.{s.tld}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{s.prices.length} registrars</span>
          {s.prices.some((p) => p.whois_privacy) ? (
            <Shield className="h-4 w-4 text-available" />
          ) : (
            <ShieldOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Price rows */}
      <div className="divide-y divide-border/50 px-5">
        <PriceRow
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Register"
          registrar={s.cheapestReg.registrar}
          price={s.cheapestReg.reg_price}
          promo={s.cheapestReg.promo_code}
          color={regColor}
        />
        <PriceRow
          icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
          label="Renew"
          registrar={s.cheapestRenew.registrar}
          price={s.cheapestRenew.renew_price}
          color={renewColor}
          isRenewHigher={s.cheapestRenew.renew_price > s.cheapestReg.reg_price * 1.8}
        />
        {s.cheapestTransfer && (
          <PriceRow
            icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
            label="Transfer"
            registrar={s.cheapestTransfer.registrar}
            price={s.cheapestTransfer.transfer_price!}
            color={getRegistrarColor(s.cheapestTransfer.registrar)}
          />
        )}
      </div>

      {/* Best 3-year footer */}
      <div className={`flex items-center gap-2 border-t border-border px-5 py-3 ${best3Color.bg}`}>
        <Trophy className={`h-4 w-4 ${best3Color.text}`} />
        <div className="flex flex-1 items-center justify-between">
          <span className={`text-xs font-semibold ${best3Color.text}`}>{s.best3Year.registrar}</span>
          <span className="text-sm font-bold text-foreground">${best3YearCost.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">/3yr</span></span>
        </div>
      </div>
    </div>
  );
};

const PriceRow = ({
  icon,
  label,
  registrar,
  price,
  promo,
  color,
  isRenewHigher,
}: {
  icon: React.ReactNode;
  label: string;
  registrar: string;
  price: number;
  promo?: string | null;
  color: ReturnType<typeof getRegistrarColor>;
  isRenewHigher?: boolean;
}) => (
  <div className="flex items-center gap-3 py-3">
    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${color.bg} ${color.text}`}>
      {icon}
    </span>
    <div className="flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
        <span className={`text-xs font-medium ${color.text}`}>{registrar}</span>
        {promo && (
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[9px] font-mono">
            {promo}
          </Badge>
        )}
      </div>
    </div>
    <span className={`text-base font-bold tabular-nums ${isRenewHigher ? "text-warning" : "text-foreground"}`}>
      ${price.toFixed(2)}
      <span className="text-xs font-normal text-muted-foreground">/yr</span>
    </span>
  </div>
);

/* ─── Detailed TLD Card ────────────────────────────────── */

const DetailedTldCard = ({ summary: s }: { summary: TldSummary }) => {
  const sorted = [...s.prices].sort((a, b) => a.reg_price - b.reg_price);
  const cheapestRegPrice = s.cheapestReg.reg_price;
  const maxRegPrice = Math.max(...s.prices.map((p) => p.reg_price));
  const range = maxRegPrice - cheapestRegPrice || 1;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/30 px-5 py-4">
        <span className="text-2xl font-extrabold text-primary">.{s.tld}</span>
        <span className="text-sm text-muted-foreground">{s.prices.length} registrars</span>
      </div>
      <div className="divide-y divide-border/50">
        {sorted.map((p, i) => {
          const c = getRegistrarColor(p.registrar);
          const isCheapest = i === 0;
          const barWidth = range > 0 ? ((p.reg_price - cheapestRegPrice) / range) * 100 : 0;
          const renewHigher = p.renew_price > p.reg_price * 1.8;

          return (
            <div
              key={p.id}
              className={`group relative grid grid-cols-[minmax(140px,1fr)_repeat(5,minmax(80px,1fr))_40px] items-center gap-2 px-5 py-3.5 transition-colors hover:bg-secondary/30 ${isCheapest ? "bg-available/5" : ""}`}
            >
              {/* Registrar */}
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                <span className={`text-sm font-semibold ${isCheapest ? "text-available" : c.text}`}>
                  {p.registrar}
                </span>
                {isCheapest && (
                  <Award className="h-3.5 w-3.5 text-available" />
                )}
              </div>

              {/* Register */}
              <div>
                <div className="flex items-baseline gap-0.5">
                  <span className={`text-sm font-bold tabular-nums ${isCheapest ? "text-available" : "text-foreground"}`}>
                    ${p.reg_price.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">/yr</span>
                </div>
                {/* Price bar */}
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/50">
                  <div
                    className={`h-full rounded-full transition-all ${isCheapest ? "bg-available" : c.dot}`}
                    style={{ width: `${Math.max(4, 100 - barWidth)}%` }}
                  />
                </div>
              </div>

              {/* Renew */}
              <div className="flex items-baseline gap-0.5">
                <span className={`text-sm font-bold tabular-nums ${renewHigher ? "text-warning" : "text-foreground"}`}>
                  ${p.renew_price.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">/yr</span>
              </div>

              {/* Transfer */}
              <div>
                {p.transfer_price != null ? (
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-sm font-bold tabular-nums text-foreground">${p.transfer_price.toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground">/yr</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>

              {/* ICANN */}
              <div>
                <span className="text-sm tabular-nums text-muted-foreground">${p.icann_fee.toFixed(2)}</span>
              </div>

              {/* Promo */}
              <div>
                {p.promo_code ? (
                  <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                    {p.promo_code}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>

              {/* WHOIS */}
              <div>
                {p.whois_privacy ? (
                  <Shield className="h-4 w-4 text-available" />
                ) : (
                  <ShieldOff className="h-4 w-4 text-muted-foreground/50" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Column headers as sticky overlay */}
      <div className="absolute top-0 left-0 right-0" />
    </div>
  );
};

export default Pricing;
