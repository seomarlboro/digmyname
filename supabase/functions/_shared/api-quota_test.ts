// Tests for the shared daily quota on the public API.
// No network, no database: the policy is pure and the Supabase client is stubbed.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  callerId,
  decide,
  DEFAULT_DAILY_DOMAIN_CAP,
  isMissingAccounting,
  parseDomainCap,
  secondsUntilReset,
  spendQuota,
  utcDay,
} from "./api-quota.ts";

// ---------------------------------------------------------------------------
// The cap
// ---------------------------------------------------------------------------

Deno.test("API_DAILY_DOMAIN_CAP: unset falls back to the default", () => {
  assertEquals(parseDomainCap(undefined), DEFAULT_DAILY_DOMAIN_CAP);
  assertEquals(parseDomainCap(""), DEFAULT_DAILY_DOMAIN_CAP);
});

Deno.test("API_DAILY_DOMAIN_CAP: a number is the ceiling, 'off' removes it, 0 answers nothing", () => {
  assertEquals(parseDomainCap("250"), 250);
  assertEquals(parseDomainCap("off"), Number.POSITIVE_INFINITY);
  assertEquals(parseDomainCap("UNLIMITED"), Number.POSITIVE_INFINITY);
  assertEquals(parseDomainCap("0"), 0);
  // Garbage must not silently become a tight cap that breaks the API.
  assertEquals(parseDomainCap("banana"), Number.POSITIVE_INFINITY);
  assertEquals(parseDomainCap("-5"), Number.POSITIVE_INFINITY);
});

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

Deno.test("a caller under the cap is served, and keeps their remaining count", () => {
  const v = decide(100, 5000);
  assertEquals(v.over, false);
  assertEquals(v.remaining, 4900);
  assertEquals(v.retryAfterSec, 0);
});

Deno.test("the cap itself is still served — only going past it refuses", () => {
  assertEquals(decide(5000, 5000).over, false);
  assertEquals(decide(5001, 5000).over, true);
});

Deno.test("a refusal points at the UTC reset, not at a made-up delay", () => {
  const now = new Date("2026-10-05T23:59:00Z");
  const v = decide(9999, 5000, now);
  assert(v.over);
  assertEquals(v.retryAfterSec, 60);
  assertEquals(secondsUntilReset(new Date("2026-10-05T00:00:00Z")), 86_400);
});

Deno.test("no cap means no refusal and no counting pressure", () => {
  const v = decide(1_000_000, Number.POSITIVE_INFINITY);
  assertEquals(v.over, false);
  assertEquals(v.remaining, Number.POSITIVE_INFINITY);
});

// ---------------------------------------------------------------------------
// The caller id — counts only, and not linkable across days
// ---------------------------------------------------------------------------

Deno.test("the caller id is stable within a day and different the next", async () => {
  const a = await callerId("203.0.113.9", "2026-10-05", "salt");
  const b = await callerId("203.0.113.9", "2026-10-05", "salt");
  const c = await callerId("203.0.113.9", "2026-10-06", "salt");
  assertEquals(a, b);
  assertNotEquals(a, c);
  assertEquals(a.length, 16);
  // The address must not survive in the identifier.
  assert(!a.includes("203"));
});

Deno.test("different addresses get different ids on the same day", async () => {
  const a = await callerId("203.0.113.9", "2026-10-05", "salt");
  const b = await callerId("203.0.113.10", "2026-10-05", "salt");
  assertNotEquals(a, b);
});

Deno.test("utcDay is the table's key shape", () => {
  assertEquals(utcDay(new Date("2026-10-05T23:30:00Z")), "2026-10-05");
});

// ---------------------------------------------------------------------------
// Fail-open: a limiter that cannot count must not become an outage
// ---------------------------------------------------------------------------

function stubClient(impl: () => Promise<unknown> | unknown) {
  // deno-lint-ignore no-explicit-any
  return { rpc: async () => await impl() } as any;
}

Deno.test("a counted request returns the running total", async () => {
  const v = await spendQuota(stubClient(() => ({ data: [{ domains: 120, requests: 9 }], error: null })), "ip", 12, 5000);
  assertEquals(v.spent, 120);
  assertEquals(v.over, false);
});

Deno.test("past the cap the verdict refuses and carries the reset", async () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const v = await spendQuota(
    stubClient(() => ({ data: [{ domains: 5200, requests: 400 }], error: null })),
    "ip",
    51,
    5000,
    now,
  );
  assert(v.over);
  assertEquals(v.retryAfterSec, 43_200);
});

Deno.test("a database error serves the request instead of 429-ing it", async () => {
  const v = await spendQuota(stubClient(() => ({ data: null, error: { code: "57014", message: "canceling statement" } })), "ip", 1, 5000);
  assertEquals(v.over, false);
  assertEquals(v.spent, -1);
});

Deno.test("a throwing client serves the request too", async () => {
  const v = await spendQuota(stubClient(() => { throw new Error("socket hang up"); }), "ip", 1, 5000);
  assertEquals(v.over, false);
  assertEquals(v.spent, -1);
});

Deno.test("a not-yet-deployed table is recognised and never enforces", async () => {
  const err = { code: "PGRST202", message: "Could not find the function public.api_quota_add" };
  assert(isMissingAccounting(err));
  const v = await spendQuota(stubClient(() => ({ data: null, error: err })), "ip", 1, 5000);
  assertEquals(v.over, false);
});

Deno.test("no cap short-circuits before touching the database", async () => {
  let called = false;
  const v = await spendQuota(stubClient(() => { called = true; return { data: null, error: null }; }), "ip", 99, Number.POSITIVE_INFINITY);
  assertEquals(v.over, false);
  assertEquals(called, false);
});
