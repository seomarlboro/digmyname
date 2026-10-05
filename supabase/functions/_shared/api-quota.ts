// ============================================================================
// PER-CALLER DAILY QUOTA FOR THE PUBLIC API
//
// The documented limit — 60 requests / minute / IP — lives in `rate-limit.ts`
// and counts inside one edge isolate. Supabase almost never reuses an isolate
// (0–6 % warm, measured three ways 2026-08-12), so that counter is, in
// practice, a counter of one request. Measured consequence, 2026-10-04: a
// script walked the keyless API and added 84,425 fresh names to `domain_cache`
// in a day (21,347 four-letter `.ca` labels — plain enumeration), 42,527 more
// by 08:00 the next morning, against ~10 human visitors a day. It exhausted the
// Cloudflare account's free Workers allowance in front of `api.digmyname.com`,
// which took the API and its edge cache down for everyone.
//
// This module adds the piece that was missing: ONE shared counter, in Postgres,
// per caller per UTC day, counted in DOMAINS (the real cost — each domain can
// mean an RDAP call, a DoH query, a WHOIS connection and a cache row).
//
// Deliberate properties:
//   • Counts only. The caller id is sha256(utc-day + salt + ip) truncated, so
//     it rotates at midnight and is not linkable across days or back to an
//     address. No domain, no query, no raw IP — the shape rule the other
//     operational tables follow.
//   • One atomic upsert per request that both records and reports the running
//     total, so two isolates serving the same scraper cannot lose a count.
//   • FAIL-OPEN. If the counter is unreachable the request is served. A limiter
//     outage must not look like an outage of the product; the Cloudflare rate
//     limiting rule in front of `api.digmyname.com` is the second layer, and
//     the money brake (§14) is separate and fails closed on its own.
//   • Tunable without a deploy: `API_DAILY_DOMAIN_CAP` is an edge environment
//     variable, applied to the next invocation (a git push deploys nothing in
//     this project — only a Lovable build does, so an env var is the only knob
//     reachable in seconds). `off` removes the ceiling.
//
// What a blocked caller sees: HTTP 429 with `error: "daily_quota"`, the cap,
// the UTC reset time and how to ask for more. Honest and specific — never a
// generic failure, and never a wrong availability verdict.
// ============================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Domains one caller may ask about per UTC day when the env var is unset.
 *  5,000 is ~100× a heavy human day on the site (a full search is 51 domains)
 *  and ~6 % of what the 2026-10-04 scraper took. */
export const DEFAULT_DAILY_DOMAIN_CAP = 5000;

/** `API_DAILY_DOMAIN_CAP` → domains per day. `off`/`unlimited` (or an
 *  unparsable value) means no ceiling; `0` means the API answers nothing, which
 *  is a valid emergency setting. */
export function parseDomainCap(raw = safeEnv("API_DAILY_DOMAIN_CAP")): number {
  if (raw === undefined || raw === "") return DEFAULT_DAILY_DOMAIN_CAP;
  const v = raw.trim().toLowerCase();
  if (v === "off" || v === "unlimited") return Number.POSITIVE_INFINITY;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return Number.POSITIVE_INFINITY;
  return Math.floor(n);
}

/** Today's date in UTC as `YYYY-MM-DD` — the table's partition key and part of
 *  the caller hash, which is what makes the identifier rotate daily. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Seconds until the quota resets (UTC midnight), for `Retry-After`. */
export function secondsUntilReset(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Stable, non-reversible caller id: sha256(day + salt + ip), first 16 hex
 * chars. The day is inside the hash on purpose — yesterday's id for the same
 * address is a different string, so the table cannot become a visit history.
 * The salt comes from `IP_HASH_SALT` when set; without one the hash is still
 * day-scoped, which is the property that matters here.
 */
export async function callerId(ip: string, day = utcDay(), salt = safeEnv("IP_HASH_SALT") ?? ""): Promise<string> {
  const bytes = new TextEncoder().encode(`${day}|${salt}|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The verdict for one request. `over` is true once the caller has spent more
 *  than the cap allows; `spent` is their running total for the day (−1 when the
 *  counter could not be read, which is always served). */
export interface QuotaVerdict {
  over: boolean;
  spent: number;
  cap: number;
  remaining: number;
  retryAfterSec: number;
}

/** Pure decision, so the policy is testable without a database. The caller is
 *  refused only once the total AFTER this request exceeds the cap — a single
 *  request is never refused for being large on its own. */
export function decide(spent: number, cap: number, now = new Date()): QuotaVerdict {
  if (!Number.isFinite(cap)) {
    return { over: false, spent, cap, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 };
  }
  const over = spent > cap;
  return {
    over,
    spent,
    cap,
    remaining: Math.max(0, cap - spent),
    retryAfterSec: over ? secondsUntilReset(now) : 0,
  };
}

/** A PostgREST error meaning "the quota table/function is not deployed yet".
 *  The edge function can reach production one build before its migration does;
 *  that must not 429 anyone, and must not be silent either. */
export function isMissingAccounting(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205" ||
    msg.includes("does not exist") || msg.includes("could not find the table") ||
    msg.includes("could not find the function") || msg.includes("schema cache")
  );
}

/**
 * Record this request's domains and report whether the caller is over budget.
 * Never throws. On any failure it returns a serving verdict with `spent: -1`
 * (fail-open, see the header), because a limiter that cannot count must not
 * become an outage.
 */
export async function spendQuota(
  supabase: SupabaseClient,
  ip: string,
  domains: number,
  cap = parseDomainCap(),
  now = new Date(),
): Promise<QuotaVerdict> {
  if (!Number.isFinite(cap)) return decide(0, cap, now);
  const n = Math.max(1, Math.floor(domains));
  try {
    const caller = await callerId(ip, utcDay(now));
    const { data, error } = await supabase.rpc("api_quota_add", {
      p_caller: caller,
      n_domains: n,
      n_requests: 1,
      n_blocked: 0,
    });
    if (error) {
      if (!isMissingAccounting(error)) console.warn(`api quota: count failed (${error.message}) — serving anyway`);
      else console.warn("api quota: table not deployed yet — cap not enforced");
      return { over: false, spent: -1, cap, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    const spent = typeof row?.domains === "number" ? row.domains : 0;
    return decide(spent, cap, now);
  } catch (e) {
    console.warn(`api quota: count threw (${e instanceof Error ? e.message : String(e)}) — serving anyway`);
    return { over: false, spent: -1, cap, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 };
  }
}

/** Count domains the cap refused, so a row shows how much was turned away.
 *  Best effort: a lost count only loses a statistic. */
export async function recordBlocked(
  supabase: SupabaseClient,
  ip: string,
  domains: number,
  now = new Date(),
): Promise<void> {
  try {
    const caller = await callerId(ip, utcDay(now));
    await supabase.rpc("api_quota_add", {
      p_caller: caller,
      n_domains: 0,
      n_requests: 0,
      n_blocked: Math.max(1, Math.floor(domains)),
    });
  } catch {
    // statistics only
  }
}

/** `Deno.env.get` without requiring the permission (tests, node tooling). */
function safeEnv(name: string): string | undefined {
  try {
    return (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}
