// Pure tests for the quote allowance — no network, no clock.
// Run with: deno test supabase/functions/_shared/registrar-budget_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createQuoteBudget, DEFAULT_BACKOFF_MS, retryAfterMs } from "./registrar-budget.ts";

const LIMITS = { windowMs: 60_000, maxDomains: 200, apiShare: 0.3 };

Deno.test("quote budget: the API may use 30 % of a window at most — 70 % is always the site's", () => {
  const b = createQuoteBudget(LIMITS);
  assertEquals([b.room("site", 0), b.room("api", 0)], [200, 60]);
  b.spend("api", 60, 0);
  assertEquals(b.room("api", 1), 0, "the API's share is spent");
  assertEquals(b.room("site", 1), 140, "the site still has its 70 %");
});

Deno.test("quote budget: the API never takes what the site has already used", () => {
  const b = createQuoteBudget(LIMITS);
  b.spend("site", 180, 0);
  assertEquals(b.room("api", 1), 20, "only what is left of the window, not its full 30 %");
  b.spend("site", 20, 2);
  assertEquals([b.room("api", 3), b.room("site", 3)], [0, 0]);
});

Deno.test("quote budget: the site may use the whole window when the API is idle", () => {
  const b = createQuoteBudget(LIMITS);
  b.spend("site", 200, 0);
  assertEquals(b.room("site", 1), 0);
  assertEquals(b.room("site", 60_001), 200, "the window slides");
});

Deno.test("quote budget: a backed-off API asks for nothing until its time is up; the site is not held back with it", () => {
  const b = createQuoteBudget(LIMITS);
  b.backOff("api", 30_000, 0);
  assertEquals([b.room("api", 29_999), b.room("site", 29_999)], [0, 200]);
  assertEquals(b.room("api", 30_001), 60);
  // A shorter back-off never shortens a longer one.
  b.backOff("api", 60_000, 30_001);
  b.backOff("api", 1_000, 30_002);
  assertEquals(b.room("api", 80_000), 0);
});

Deno.test("retryAfterMs: seconds, an HTTP date, or the default — capped at 15 minutes", () => {
  assertEquals(retryAfterMs("10"), 10_000);
  assertEquals(retryAfterMs(null), DEFAULT_BACKOFF_MS);
  assertEquals(retryAfterMs("soon"), DEFAULT_BACKOFF_MS);
  assertEquals(retryAfterMs("7200"), 15 * 60_000);
  assertEquals(retryAfterMs(new Date(120_000).toUTCString(), 0), 120_000);
});
