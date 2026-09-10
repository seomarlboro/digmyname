import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CheapestRegistrar } from "@/lib/cardFacts";

export type { CheapestRegistrar } from "@/lib/cardFacts";

/** Cheapest first-year registrar per TLD, from the live registrar table. Shared
 *  with the Pricing page through the same react-query key, so a visitor who
 *  opens both pays for the table once. */
export function useCheapestRegistrars() {
  const { data: prices } = useQuery({
    queryKey: ["registrar-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrar_prices")
        .select("id,tld,registrar,reg_price,renew_price,transfer_price,icann_fee,promo_code,whois_privacy,affiliate_url,updated_at")
        .eq("supported", true)
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
      const candidate: CheapestRegistrar = {
        registrar: p.registrar,
        regPrice: p.reg_price,
        renewPrice: p.renew_price,
        affiliateUrl: p.affiliate_url,
        promoCode: p.promo_code,
        whoisPrivacy: p.whois_privacy ?? false,
      };
      const existing = map.get(p.tld);
      if (!existing || p.reg_price < existing.regPrice) map.set(p.tld, candidate);
    }
    return map;
  }, [prices]);

  return cheapestByTld;
}
