// Tests for the three spend brakes on the paid third signal.
// No network, no Deno globals beyond what the module itself guards.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allowedCalls,
  DEFAULT_DAILY_CAP,
  headlinePremiumCheckEnabled,
  isMissingAccounting,
  MAX_VERIFY_NAMES,
  parseDailyCap,
  readSpentToday,
  recordSpend,
  thirdSignalEnabled,
  utcDay,
  verifySetFor,
} from "./third-signal-budget.ts";
import { splitByReason } from "./pipeline.ts";

// ---------------------------------------------------------------------------
// Brake 1 — HEADLINE_PREMIUM_CHECK (the per-search verify call)
// ---------------------------------------------------------------------------

Deno.test("HEADLINE_PREMIUM_CHECK: only the exact string 'off' disables the verify call", () => {
  assertEquals(headlinePremiumCheckEnabled("off"), false);
  assertEquals(headlinePremiumCheckEnabled("on"), true);
  assertEquals(headlinePremiumCheckEnabled(undefined), true);
  assertEquals(headlinePremiumCheckEnabled(""), true);
});

Deno.test("verifySetFor: the switch off means no name is ever forced past the cache", () => {
  assertEquals(verifySetFor(["acmeforge.com"], true, false), undefined);
});

Deno.test("verifySetFor: a request that did not ask for it is never forced", () => {
  assertEquals(verifySetFor(["acmeforge.com"], undefined, true), undefined);
  assertEquals(verifySetFor(["acmeforge.com"], false, true), undefined);
});

Deno.test("verifySetFor: forces exactly the requested names, and only up to the cap", () => {
  const one = verifySetFor(["acmeforge.com"], true, true);
  assertEquals([...one!], ["acmeforge.com"]);

  const three = Array.from({ length: MAX_VERIFY_NAMES }, (_, i) => `n${i}.com`);
  assertEquals(verifySetFor(three, true, true)?.size, MAX_VERIFY_NAMES);
  // One over the cap → nothing is forced (a caller cannot buy a batch of calls).
  assertEquals(verifySetFor([...three, "n9.com"], true, true), undefined);
  assertEquals(verifySetFor([], true, true), undefined);
});

// ---------------------------------------------------------------------------
// Brake 2 — FASTLY_DAILY_CAP
// ---------------------------------------------------------------------------

Deno.test("parseDailyCap: unset falls back to the documented default", () => {
  assertEquals(parseDailyCap(undefined), DEFAULT_DAILY_CAP);
  assertEquals(parseDailyCap(""), DEFAULT_DAILY_CAP);
});

Deno.test("parseDailyCap: a number caps, 'off' removes the ceiling, 0 spends nothing", () => {
  assertEquals(parseDailyCap("1200"), 1200);
  assertEquals(parseDailyCap("1200.7"), 1200);
  assertEquals(parseDailyCap("off"), Number.POSITIVE_INFINITY);
  assertEquals(parseDailyCap("OFF"), Number.POSITIVE_INFINITY);
  assertEquals(parseDailyCap("0"), 0);
  // Garbage must never silently become a tight cap that switches the signal off.
  assertEquals(parseDailyCap("banana"), Number.POSITIVE_INFINITY);
  assertEquals(parseDailyCap("-5"), Number.POSITIVE_INFINITY);
});

Deno.test("allowedCalls: spends up to the ceiling, then nothing", () => {
  assertEquals(allowedCalls(0, 100, 20), 20);
  assertEquals(allowedCalls(90, 100, 20), 10); // partial batch — the remainder degrades honestly
  assertEquals(allowedCalls(100, 100, 20), 0);
  assertEquals(allowedCalls(500, 100, 20), 0);
  assertEquals(allowedCalls(0, 0, 20), 0); // cap 0 = spend nothing
  assertEquals(allowedCalls(0, Number.POSITIVE_INFINITY, 20), 20);
  assertEquals(allowedCalls(10, 100, 0), 0);
});

Deno.test("allowedCalls: an unreadable counter (Infinity spent) refuses every paid call", () => {
  assertEquals(allowedCalls(Number.POSITIVE_INFINITY, DEFAULT_DAILY_CAP, 20), 0);
});

// ---------------------------------------------------------------------------
// The counter read: fail closed, except when accounting simply isn't deployed
// ---------------------------------------------------------------------------

function fakeClient(outcome: { data?: unknown; error?: { code?: string; message?: string } | null } | Error) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  if (outcome instanceof Error) return Promise.reject(outcome);
                  return Promise.resolve({ data: outcome.data ?? null, error: outcome.error ?? null });
                },
              };
            },
          };
        },
      };
    },
    rpc(_fn: string, _args: unknown) {
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve({ data: null, error: outcome.error ?? null });
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("readSpentToday: returns today's count", async () => {
  assertEquals(await readSpentToday(fakeClient({ data: { calls: 742 } })), 742);
});

Deno.test("readSpentToday: no row yet today means nothing spent", async () => {
  assertEquals(await readSpentToday(fakeClient({ data: null })), 0);
});

Deno.test("readSpentToday: a missing table does NOT brake the pipeline (deploy ordering)", async () => {
  const spent = await readSpentToday(
    fakeClient({ error: { code: "PGRST205", message: "Could not find the table 'public.fastly_spend_daily' in the schema cache" } }),
  );
  assertEquals(spent, 0);
});

Deno.test("readSpentToday: any other failure fails CLOSED — we cannot count, so we do not spend", async () => {
  const spent = await readSpentToday(fakeClient({ error: { code: "57014", message: "canceling statement due to statement timeout" } }));
  assertEquals(spent, Number.POSITIVE_INFINITY);
  assertEquals(allowedCalls(spent, DEFAULT_DAILY_CAP, 5), 0);

  const threw = await readSpentToday(fakeClient(new Error("fetch failed")));
  assertEquals(threw, Number.POSITIVE_INFINITY);
});

Deno.test("isMissingAccounting: recognises the missing table / function, not a real error", () => {
  assert(isMissingAccounting({ code: "42P01", message: 'relation "fastly_spend_daily" does not exist' }));
  assert(isMissingAccounting({ code: "PGRST202", message: "Could not find the function public.fastly_spend_add" }));
  assert(!isMissingAccounting({ code: "57014", message: "statement timeout" }));
  assert(!isMissingAccounting(null));
});

Deno.test("recordSpend: never throws, and writes nothing when there is nothing to record", async () => {
  await recordSpend(fakeClient(new Error("down")), 3, { co_me: 3, premium: 0, brand: 0, other: 0 });
  await recordSpend(fakeClient({ error: { code: "57014", message: "statement timeout" } }), 3, { co_me: 3, premium: 0, brand: 0, other: 0 });
  await recordSpend(fakeClient({}), 0, { co_me: 0, premium: 0, brand: 0, other: 0 });
});

// ---------------------------------------------------------------------------
// Brake 3 — THIRD_SIGNAL, and the accounting split
// ---------------------------------------------------------------------------

Deno.test("THIRD_SIGNAL: only the exact string 'off' kills the paid signal", () => {
  assertEquals(thirdSignalEnabled("off"), false);
  assertEquals(thirdSignalEnabled(undefined), true);
  assertEquals(thirdSignalEnabled("on"), true);
});

Deno.test("splitByReason: the four buckets add up and match the escalation reasons", () => {
  const split = splitByReason(["acmeforge.co", "acmeforge.me", "apple.studio", "qzv.xyz", "acmeforge.com"]);
  assertEquals(split.co_me, 2);
  assertEquals(split.brand, 1); // apple → brand-blocked SLD
  assertEquals(split.premium, 1); // 3-char SLD → premium suspect
  assertEquals(split.other, 1);
  assertEquals(split.co_me + split.brand + split.premium + split.other, 5);
});

Deno.test("utcDay: the cap's day boundary is UTC, matching the table's primary key", () => {
  assertEquals(utcDay(new Date("2026-09-16T23:59:59Z")), "2026-09-16");
  assertEquals(utcDay(new Date("2026-09-17T00:00:01Z")), "2026-09-17");
});
