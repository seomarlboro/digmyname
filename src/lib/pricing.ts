/**
 * Pure helpers behind /pricing: winners per action, 3-year cost, grouping by
 * how many registrars actually track a TLD. No React, so the page's claims
 * ("compared across N registrars") are testable.
 */

export interface RegistrarPrice {
  id: string;
  registrar: string;
  tld: string;
  reg_price: number;
  renew_price: number;
  transfer_price: number | null;
  icann_fee: number | null;
  promo_code: string | null;
  whois_privacy: boolean | null;
  affiliate_url?: string | null;
  updated_at: string;
}

export interface TldSummary {
  tld: string;
  prices: RegistrarPrice[];
  /** Cheapest registration — used for JSON-LD and the enterprise split. */
  cheapestReg: RegistrarPrice;
  /** Year-1 registration above the enterprise threshold (splits the table). */
  isEnterprise: boolean;
}

/** Year-1 registration above this is shown in a collapsed "enterprise" group so it doesn't distort the normal prices. */
export const ENTERPRISE_THRESHOLD = 500;

/** Popular extensions first; everything else keeps the table's alphabetical order. */
export const TLD_ORDER = ["com", "net", "org", "io", "ai", "co", "xyz", "me", "app", "dev", "tech", "shop", "site", "online", "club"];

/** Total 3-year cost of ownership at a registrar: registration + 2 renewals. */
export const threeYearCost = (p: RegistrarPrice): number => p.reg_price + p.renew_price * 2;

/** A winning cell: the registrar with the best price for one action, plus the
 *  price to show. Each action's winner is independent — the cheapest registrar
 *  for registration may differ from the cheapest for renewal or transfer. This
 *  is NOT cross-registrar splicing: every cell names its own registrar. */
export interface Winner {
  registrar: string;
  price: number;
  promo: string | null;
}

const lowestBy = (list: RegistrarPrice[], value: (p: RegistrarPrice) => number): RegistrarPrice | null =>
  list.reduce<RegistrarPrice | null>((a, b) => (a == null || value(b) < value(a) ? b : a), null);

export const cheapestRegister = (list: RegistrarPrice[]): Winner | null => {
  const best = lowestBy(list, (p) => p.reg_price);
  return best ? { registrar: best.registrar, price: best.reg_price, promo: best.promo_code ?? null } : null;
};

export const cheapestRenew = (list: RegistrarPrice[]): Winner | null => {
  const best = lowestBy(list, (p) => p.renew_price);
  return best ? { registrar: best.registrar, price: best.renew_price, promo: null } : null;
};

export const cheapestTransfer = (list: RegistrarPrice[]): Winner | null => {
  const withT = list.filter((p) => p.transfer_price != null);
  if (withT.length === 0) return null;
  const best = lowestBy(withT, (p) => p.transfer_price ?? Infinity);
  return best ? { registrar: best.registrar, price: best.transfer_price!, promo: null } : null;
};

export const bestThreeYear = (list: RegistrarPrice[]): Winner | null => {
  const best = lowestBy(list, threeYearCost);
  return best ? { registrar: best.registrar, price: threeYearCost(best), promo: best.promo_code ?? null } : null;
};

/** Group rows per TLD and order them: popular first, then the rest as they came. */
export function summarize(prices: RegistrarPrice[]): TldSummary[] {
  const grouped = new Map<string, RegistrarPrice[]>();
  for (const p of prices) {
    if (!grouped.has(p.tld)) grouped.set(p.tld, []);
    grouped.get(p.tld)!.push(p);
  }
  const summaries: TldSummary[] = [];
  for (const [tld, list] of grouped) {
    const cheapestReg = list.reduce((a, b) => (a.reg_price < b.reg_price ? a : b));
    summaries.push({ tld, prices: list, cheapestReg, isEnterprise: cheapestReg.reg_price > ENTERPRISE_THRESHOLD });
  }
  summaries.sort((a, b) => {
    const ai = TLD_ORDER.indexOf(a.tld);
    const bi = TLD_ORDER.indexOf(b.tld);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return summaries;
}

/**
 * A TLD is "compared" only when at least two registrars track it. A single
 * registrar in every column is not a comparison, and the page must not say it is.
 */
export function splitByComparison(summaries: TldSummary[]): { compared: TldSummary[]; single: TldSummary[] } {
  return {
    compared: summaries.filter((s) => s.prices.length >= 2),
    single: summaries.filter((s) => s.prices.length < 2),
  };
}

export const STALE_AFTER_DAYS = 14;

export const isStale = (iso: string | undefined, now = Date.now()) => {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return now - then > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
};

export const formatUpdated = (iso: string | undefined, now = Date.now()) => {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
};

export const formatAbsolute = (iso: string | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

/** Newest `updated_at` in a list. */
export const newestUpdate = (list: RegistrarPrice[]): string | undefined =>
  list.length ? list.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at : undefined;
