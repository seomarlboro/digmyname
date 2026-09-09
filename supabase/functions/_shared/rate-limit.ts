// ============================================================================
// PER-KEY SLIDING-WINDOW BUDGET
//
// In-memory, per isolate. Isolates are not reused today (measured 2026-09-08:
// 66+ check-domains requests from one IP inside a minute, zero 429s), so a
// limiter here only bites if the platform starts reusing them — and then it
// must never bite the website's own traffic. That traffic is many SMALL
// requests: one check-domains request per top TLD plus batches of 8 (16
// requests for a 53-TLD search, 318 domains with AI variations on), and six
// /fast requests per keystroke wave. A budget counted in requests failed that
// on the second search. This one is counted in COST UNITS (domains), with a
// request cap on top so a flood of 1-domain requests (each a paid invocation)
// stays bounded.
//
// No Deno globals, no remote imports — unit-tested by `rate-limit_test.ts`.
// ============================================================================

export interface BudgetLimits {
  windowMs: number;
  /** Requests allowed per key per window. */
  maxRequests: number;
  /** Cost units (domains) allowed per key per window. `Infinity` = requests only. */
  maxCost: number;
}

export interface BudgetVerdict {
  ok: boolean;
  /** Requests still allowed in the window; 0 when refused. */
  remainingRequests: number;
  /** Cost units still allowed in the window; 0 when refused. */
  remainingCost: number;
  /** Seconds until the oldest entry leaves the window; 0 when allowed. */
  retryAfterSec: number;
}

interface Entry {
  at: number;
  cost: number;
}

/** Build a budget. The returned `spend(key, cost, now?)` either records the
 *  request and returns `ok:true`, or refuses it (nothing recorded) with a
 *  Retry-After hint. A request always costs at least 1 unit. */
export function createBudget(limits: BudgetLimits, maxKeys = 5000) {
  const buckets = new Map<string, Entry[]>();

  return function spend(key: string, cost: number, now = Date.now()): BudgetVerdict {
    const unit = Math.max(1, Math.floor(cost));
    const recent = (buckets.get(key) ?? []).filter((e) => now - e.at < limits.windowMs);
    const spent = recent.reduce((sum, e) => sum + e.cost, 0);

    if (recent.length >= limits.maxRequests || spent + unit > limits.maxCost) {
      buckets.set(key, recent);
      const oldest = recent[0]?.at ?? now;
      return {
        ok: false,
        remainingRequests: 0,
        remainingCost: 0,
        retryAfterSec: Math.max(1, Math.ceil((limits.windowMs - (now - oldest)) / 1000)),
      };
    }

    recent.push({ at: now, cost: unit });
    buckets.set(key, recent);

    // Best-effort GC so the map cannot grow without bound.
    if (buckets.size > maxKeys) {
      for (const [k, v] of buckets) {
        if (v.every((e) => now - e.at >= limits.windowMs)) buckets.delete(k);
      }
    }

    return {
      ok: true,
      remainingRequests: limits.maxRequests - recent.length,
      remainingCost: Number.isFinite(limits.maxCost) ? limits.maxCost - spent - unit : Number.POSITIVE_INFINITY,
      retryAfterSec: 0,
    };
  };
}

/** First hop of X-Forwarded-For, else the CDN/proxy client-IP headers. */
export function clientIpOf(req: Request, fallback = "unknown"): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? fallback;
}
