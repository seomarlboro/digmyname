// Pure unit tests for the per-key budget — NO network.
// Run with: deno test supabase/functions/_shared/rate-limit_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createBudget } from "./rate-limit.ts";

// The check-domains budget as configured in check-domains/index.ts.
const SITE = { windowMs: 60_000, maxRequests: 600, maxCost: 4000 };
// The /fast budget as configured in public-api/index.ts.
const FAST = { windowMs: 60_000, maxRequests: 1200, maxCost: 10_000 };

/** One website search over all 53 TLDs: 10 solo top-TLD requests + 6 batches
 *  of 8 (the last one holds 3). 16 requests, 53 domains. */
function siteSearch(spend: ReturnType<typeof createBudget>, key: string, now: number, names = 1): boolean {
  const domains = 53 * names;
  const solo = 10;
  const rest = domains - solo;
  let ok = true;
  for (let i = 0; i < solo; i++) ok = spend(key, 1, now).ok && ok;
  for (let left = rest; left > 0; left -= 8) ok = spend(key, Math.min(8, left), now).ok && ok;
  return ok;
}

Deno.test("site pattern: 20 plain 53-TLD searches in one minute all pass (the old 30-requests cap failed the 2nd)", () => {
  const spend = createBudget(SITE);
  for (let s = 0; s < 20; s++) assert(siteSearch(spend, "1.2.3.4", 1000 + s * 2000));
});

Deno.test("site pattern: 12 searches with AI variations on (318 domains each) pass, the 13th is refused", () => {
  const spend = createBudget(SITE);
  for (let s = 0; s < 12; s++) assert(siteSearch(spend, "1.2.3.4", 1000 + s * 3000, 6), `search ${s + 1}`);
  // 12 x 318 = 3816 domains spent; the next search's batches push past 4000.
  assertEquals(siteSearch(spend, "1.2.3.4", 50_000, 6), false);
});

Deno.test("flood of 50-domain requests is refused once 4000 domains are spent", () => {
  const spend = createBudget(SITE);
  for (let i = 0; i < 80; i++) assert(spend("evil", 50, 1000 + i).ok, `request ${i + 1}`);
  const refused = spend("evil", 50, 2000);
  assertEquals(refused.ok, false);
  assertEquals(refused.remainingCost, 0);
  assert(refused.retryAfterSec >= 1 && refused.retryAfterSec <= 60);
});

Deno.test("flood of 1-domain requests is refused at the request cap", () => {
  const spend = createBudget(SITE);
  for (let i = 0; i < 600; i++) assert(spend("evil", 1, 1000 + i).ok);
  assertEquals(spend("evil", 1, 2000).ok, false);
});

Deno.test("a refused request is not recorded and the window slides", () => {
  const spend = createBudget({ windowMs: 1000, maxRequests: 2, maxCost: 100 });
  assert(spend("k", 1, 0).ok);
  assert(spend("k", 1, 10).ok);
  assertEquals(spend("k", 1, 20).ok, false);
  // The first entry leaves the window at t=1000 → one slot frees up.
  assert(spend("k", 1, 1000).ok);
  assertEquals(spend("k", 1, 1001).ok, false);
});

Deno.test("keys are independent and cost never counts below 1", () => {
  const spend = createBudget({ windowMs: 1000, maxRequests: 10, maxCost: 3 });
  assert(spend("a", 0, 0).ok); // costs 1
  assert(spend("a", 0, 1).ok);
  assert(spend("a", 0, 2).ok);
  assertEquals(spend("a", 0, 3).ok, false);
  assert(spend("b", 3, 3).ok);
});

Deno.test("requests-only budget (maxCost Infinity) never refuses on cost", () => {
  const spend = createBudget({ windowMs: 60_000, maxRequests: 60, maxCost: Number.POSITIVE_INFINITY });
  for (let i = 0; i < 60; i++) assert(spend("api", 50, i).ok);
  assertEquals(spend("api", 1, 100).ok, false);
});

Deno.test("/fast pattern: a fast typist (60 keystroke waves/min, 6 requests each) stays inside its own budget", () => {
  const spend = createBudget(FAST);
  for (let wave = 0; wave < 60; wave++) {
    for (const cost of [10, 10, 10, 10, 10, 3]) assert(spend("typist", cost, wave * 1000).ok, `wave ${wave}`);
  }
});
