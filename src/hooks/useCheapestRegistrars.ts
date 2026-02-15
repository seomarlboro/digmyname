import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CheapestRegistrar {
  registrar: string;
  regPrice: number;
  renewPrice: number;
  affiliateUrl: string | null;
  promoCode: string | null;
  whoisPrivacy: boolean;
}

export function useCheapestRegistrars() {
  const { data: prices } = useQuery({
    queryKey: ["registrar-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrar_prices")
        .select("*")
        .order("tld")
        .order("reg_price");
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 30, // 30 min cache
  });

  const cheapestByTld = useMemo(() => {
    const map = new Map<string, CheapestRegistrar>();
    if (!prices) return map;

    for (const p of prices) {
      if (!map.has(p.tld)) {
        map.set(p.tld, {
          registrar: p.registrar,
          regPrice: p.reg_price,
          renewPrice: p.renew_price,
          affiliateUrl: p.affiliate_url,
          promoCode: p.promo_code,
          whoisPrivacy: p.whois_privacy ?? false,
        });
      } else {
        const existing = map.get(p.tld)!;
        if (p.reg_price < existing.regPrice) {
          map.set(p.tld, {
            registrar: p.registrar,
            regPrice: p.reg_price,
            renewPrice: p.renew_price,
            affiliateUrl: p.affiliate_url,
            promoCode: p.promo_code,
            whoisPrivacy: p.whois_privacy ?? false,
          });
        }
      }
    }
    return map;
  }, [prices]);

  return cheapestByTld;
}
