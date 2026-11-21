// ============================================================================
// WHO MAY SPEND THE REGISTRAR'S QUOTE ALLOWANCE
//
// A price quote is one name sent to the registrar's availability endpoint. The
// registrar allows 200 names per 60 s per account in bulk calls (their OpenAPI
// spec, read 2026-09-16), and since 2026-11-21 every available name outside
// .com/.net/.org needs a quote before a price is shown — a full search of a
// fresh name is about 45 of them.
//
// Two kinds of caller draw on that allowance:
//   • "site" — a visitor is looking at cards that say "Checking price…".
//   • "api"  — the keyless public API, which quotes AFTER it has answered, so
//              that a later call finds the price. Nobody is waiting.
// A script walking the API must not leave a visitor without prices, so the API
// may use at most `apiShare` of a window (30 %), and never what the site has
// already taken: at least 70 % is always the site's. When the registrar itself
// says "slow down" (429) the API stops asking for as long as it was told to,
// without a word in the logs — a missing background quote costs nothing but a
// price that arrives later.
//
// Honest limit of this file: the ledger lives in one isolate. `check-domains`
// and `public-api` are separate functions with separate isolates, so what this
// guarantees across them is that each API isolate caps ITSELF at 30 %. The
// registrar's own 429 remains the shared limit.
//
// No Deno globals, no remote imports — unit-tested by `registrar-budget_test.ts`.
// ============================================================================

export type QuoteCaller = "site" | "api";

export interface QuoteBudgetLimits {
  windowMs: number;
  /** Names per window, all callers together. */
  maxDomains: number;
  /** Fraction of a window the API may use at most (the rest is reserved for the site). */
  apiShare: number;
}

export const DEFAULT_QUOTE_LIMITS: QuoteBudgetLimits = { windowMs: 60_000, maxDomains: 200, apiShare: 0.3 };

/** How long the API stays quiet after a 429 that named no Retry-After. */
export const DEFAULT_BACKOFF_MS = 60_000;

export interface QuoteBudget {
  /** Names this caller may still send in the current window (0 while backing off). */
  room(caller: QuoteCaller, now?: number): number;
  /** Record names sent. */
  spend(caller: QuoteCaller, domains: number, now?: number): void;
  /** Stop this caller from asking for `ms`. */
  backOff(caller: QuoteCaller, ms: number, now?: number): void;
}

export function createQuoteBudget(limits: QuoteBudgetLimits = DEFAULT_QUOTE_LIMITS): QuoteBudget {
  let ledger: Array<{ at: number; cost: number; caller: QuoteCaller }> = [];
  const quietUntil: Record<QuoteCaller, number> = { site: 0, api: 0 };
  const apiMax = Math.floor(limits.maxDomains * limits.apiShare);

  const spentIn = (now: number) => {
    ledger = ledger.filter((e) => now - e.at < limits.windowMs);
    let total = 0;
    let api = 0;
    for (const e of ledger) {
      total += e.cost;
      if (e.caller === "api") api += e.cost;
    }
    return { total, api };
  };

  return {
    room(caller, now = Date.now()) {
      if (quietUntil[caller] > now) return 0;
      const { total, api } = spentIn(now);
      const left = Math.max(0, limits.maxDomains - total);
      return caller === "api" ? Math.max(0, Math.min(apiMax - api, left)) : left;
    },
    spend(caller, domains, now = Date.now()) {
      const cost = Math.max(0, Math.floor(domains));
      if (cost > 0) ledger.push({ at: now, cost, caller });
    },
    backOff(caller, ms, now = Date.now()) {
      quietUntil[caller] = Math.max(quietUntil[caller], now + Math.max(0, ms));
    },
  };
}

/** `Retry-After` (seconds, or an HTTP date) → milliseconds; the default when absent or unreadable. */
export function retryAfterMs(header: string | null | undefined, now = Date.now()): number {
  const v = (header ?? "").trim();
  if (!v) return DEFAULT_BACKOFF_MS;
  if (/^\d+$/.test(v)) return Math.min(Number(v) * 1000, 15 * 60_000);
  const at = Date.parse(v);
  return Number.isFinite(at) && at > now ? Math.min(at - now, 15 * 60_000) : DEFAULT_BACKOFF_MS;
}
