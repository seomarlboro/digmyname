// ============================================================================
// THIRD-SIGNAL SPEND BRAKES
//
// The third signal (Fastly Domain Research, "Status-Precise") is the only
// METERED dependency in the pipeline: 10,000 requests/month are free, then
// $0.001 per request (fastly.com/pricing, read 2026-09-16). RDAP,
// DNS-over-HTTPS and the registrar catalogs cost nothing, so this is the only
// place where traffic turns into a bill.
//
// Three brakes, narrowest first. All three are edge ENVIRONMENT VARIABLES, and
// Supabase applies a secret change to the next invocation without a deploy
// ("You don't need to re-deploy after setting your secrets" —
// supabase.com/docs/guides/functions/secrets). That matters here: in this
// project a git push deploys nothing and only a Lovable build ships an edge
// function, so an env var is the ONLY brake reachable in seconds.
//
//   HEADLINE_PREMIUM_CHECK=off   drops the one verifying call the site makes
//                                per settled search (the largest per-visitor
//                                cost — it deliberately bypasses the cache).
//   FASTLY_DAILY_CAP=<n>         hard ceiling on paid calls per UTC day,
//                                default DEFAULT_DAILY_CAP; `off` = no ceiling,
//                                `0` = spend nothing.
//   THIRD_SIGNAL=off             kills every paid call, all four escalation
//                                reasons at once.
//
// What a visitor sees when a call does NOT happen is unchanged and already
// honest — the pipeline's existing no-verdict branches: a premium suspect keeps
// `available:true` with `premiumUnverified` (card shows the premium mark and
// "Check price", never a $ figure), a brand-blocked name and a .co/.me with no
// registry RDAP stay `uncertain`. No new UI state, no new copy, and nothing is
// ever presented as available on weaker evidence than before.
//
// Accounting lives in `public.fastly_spend_daily` (counts only, never a domain
// name) — see migration 20260916160000_fastly_spend_daily.sql.
// ============================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Paid calls allowed per UTC day when FASTLY_DAILY_CAP is not set.
 *  300/day keeps us inside Fastly's 10,000 free requests/month (333/day) on the
 *  owner's instruction (2026-09-16, after an unpaid $45.05 August invoice).
 *  The environment variable overrides it either way. */
export const DEFAULT_DAILY_CAP = 300;

/** Names accepted in one `verifyPremium` request (one paid call each). */
export const MAX_VERIFY_NAMES = 3;

/** Escalation reasons, counted. Filled by `splitByReason` in pipeline.ts. */
export interface SpendSplit {
  co_me: number;
  premium: number;
  brand: number;
  other: number;
}

/** Whether the paid third signal may run at all. `THIRD_SIGNAL=off` kills it. */
export function thirdSignalEnabled(raw = safeEnv("THIRD_SIGNAL")): boolean {
  return raw !== "off";
}

/** Whether the site's per-search headline verification may run.
 *  `HEADLINE_PREMIUM_CHECK=off` kills it. */
export function headlinePremiumCheckEnabled(raw = safeEnv("HEADLINE_PREMIUM_CHECK")): boolean {
  return raw !== "off";
}

/**
 * The set of names whose registry-premium status the caller asked to verify, or
 * undefined when nothing should be forced. Pure so the kill switch is testable:
 * the HTTP wrapper passes the env value in.
 */
export function verifySetFor(
  order: readonly string[],
  requested: boolean | undefined,
  on: boolean,
): Set<string> | undefined {
  if (requested !== true || !on) return undefined;
  if (order.length === 0 || order.length > MAX_VERIFY_NAMES) return undefined;
  return new Set(order);
}

/** `FASTLY_DAILY_CAP` → a number of calls. `off` (or a negative / unparsable
 *  value) means no ceiling; `0` means spend nothing. */
export function parseDailyCap(raw = safeEnv("FASTLY_DAILY_CAP")): number {
  if (raw === undefined || raw === "") return DEFAULT_DAILY_CAP;
  if (raw.toLowerCase() === "off" || raw.toLowerCase() === "unlimited") return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return Number.POSITIVE_INFINITY;
  return Math.floor(n);
}

/** How many of `wanted` calls today's remaining budget allows. */
export function allowedCalls(spentToday: number, cap: number, wanted: number): number {
  if (wanted <= 0) return 0;
  if (!Number.isFinite(cap)) return wanted;
  return Math.max(0, Math.min(wanted, cap - spentToday));
}

/** A PostgREST error that means "the spend table/function isn't there yet".
 *  Deploy ordering: the edge function can reach production one build before its
 *  migration does, and a missing table must NOT silently disable the third
 *  signal for every visitor — that failure mode is invisible. Every OTHER read
 *  failure fails closed (see `readSpentToday`). */
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
 * Calls already paid for today (UTC), or:
 *   • `Number.POSITIVE_INFINITY` — the read failed for an unknown reason. The
 *     caller treats that as "no budget left" (fail closed): the one moment we
 *     cannot count is also the moment we cannot afford to keep spending.
 *   • `0` — no row yet today, or accounting is not deployed yet
 *     (`isMissingAccounting`), which must not brake the pipeline.
 */
export async function readSpentToday(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("fastly_spend_daily")
      .select("calls")
      .eq("day", utcDay())
      .maybeSingle();
    if (error) {
      if (isMissingAccounting(error)) {
        console.warn("third-signal budget: spend table not deployed yet — cap not enforced");
        return 0;
      }
      console.error(`third-signal budget: read failed (${error.message}) — refusing paid calls`);
      return Number.POSITIVE_INFINITY;
    }
    return typeof data?.calls === "number" ? data.calls : 0;
  } catch (e) {
    console.error(
      `third-signal budget: read threw (${e instanceof Error ? e.message : String(e)}) — refusing paid calls`,
    );
    return Number.POSITIVE_INFINITY;
  }
}

/** Add today's spend (and the calls the cap refused). Counts only — this never
 *  sees a domain name. Never throws; a failed write only loses accounting. */
export async function recordSpend(
  supabase: SupabaseClient,
  calls: number,
  split: SpendSplit,
  blocked = 0,
): Promise<void> {
  if (calls <= 0 && blocked <= 0) return;
  try {
    const { error } = await supabase.rpc("fastly_spend_add", {
      n_calls: calls,
      n_co_me: split.co_me,
      n_premium: split.premium,
      n_brand: split.brand,
      n_other: split.other,
      n_blocked: blocked,
    });
    if (error && !isMissingAccounting(error)) {
      console.warn(`third-signal budget: write failed (${error.message})`);
    }
  } catch (e) {
    console.warn(`third-signal budget: write threw (${e instanceof Error ? e.message : String(e)})`);
  }
}

/** Today's date in UTC as `YYYY-MM-DD` — the table's primary key. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** `Deno.env.get` without requiring the permission (tests, node tooling). */
function safeEnv(name: string): string | undefined {
  try {
    return (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}
