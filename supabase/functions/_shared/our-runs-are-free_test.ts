/**
 * Our own runs never spend money (docs/DIGMYNAME_ARCHITECTURE.md §14).
 *
 * The August 2026 Fastly invoice ($45.05) was almost entirely OUR traffic —
 * benchmark runs, QA sessions and a prewarm list that bought its own warm cache.
 * Visitors were a rounding error. So the rule is a rule, and this is its
 * tripwire: every name a repo script sends through the real pipeline must be one
 * the escalation rules cannot route to the paid third signal.
 *
 * What makes a name free, per `willEscalateToThirdSignal` + `isLikelyPremium`:
 *   • a label of 6+ characters (5 or fewer is a premium suspect on 31 of our
 *     TLDs, 3 or fewer on every TLD), and
 *   • not an SLD on the brand block list, and
 *   • a zone whose registry actually answers us — `.shop` does not (its RDAP
 *     rate-limits our egress IP), so a fresh `.shop` name escalates by itself.
 * A registered name is never `available` and so can never escalate, whatever its
 * shape — which is why the fixed reference domains may be short.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isLikelyPremium } from "./pipeline.ts";
import { isLikelyBlocked } from "./availability-rules.ts";

const repo = new URL("../../../", import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, repo));

/** Zones our own probes must not touch with a fresh name. */
const PAID_ZONES = ["shop"];

const bench = read("scripts/bench/first-answer.mjs");
const monitor = read("scripts/monitor/site-health.mjs");
const scripts = [["bench", bench], ["monitor", monitor]] as const;

Deno.test("our runs: both scripts generate fresh labels of at least 6 characters", () => {
  for (const [name, src] of scripts) {
    // Matches both spellings in the repo: `const freshLabel = () => "qz" + ...`
    // and `function freshLabel() { return "qz" + ... }`.
    const gen = src.match(/freshLabel[\s\S]{0,80}?"([a-z]+)"\s*\+[\s\S]{0,80}?length:\s*(\d+)/);
    assert(gen, `${name}: freshLabel() is not in its expected shape any more`);
    const length = gen[1].length + Number(gen[2]);
    assert(length >= 6, `${name}: fresh labels must be 6+ characters, got ${length}`);
  }
});

Deno.test("our runs: no script probes a zone whose registry cannot answer us for free", () => {
  for (const [name, src] of scripts) {
    for (const zone of PAID_ZONES) {
      assert(
        !new RegExp(`\\.${zone}\\b|["']${zone}["']`).test(src),
        `${name}: must not probe .${zone} — a fresh name there reaches the paid signal`,
      );
    }
  }
});

Deno.test("our runs: a fresh benchmark name is free on every TLD the benchmark types", () => {
  const list = bench.match(/const TYPED_TLDS = \[([^\]]*)\]/);
  assert(list, "bench: TYPED_TLDS not found");
  const tlds = [...list[1].matchAll(/"([a-z]*)"/g)].map((m) => m[1]).filter(Boolean);
  assert(tlds.length > 0, "bench: TYPED_TLDS is empty");
  const label = "qzabcdefghi"; // the shape both scripts generate
  for (const tld of tlds) {
    assertEquals(isLikelyPremium(`${label}.${tld}`), false, `${label}.${tld} is a premium suspect`);
    assert(!PAID_ZONES.includes(tld), `bench types .${tld}, which cannot answer for free`);
  }
});

Deno.test("our runs: the monitor's fixed reference names are registered ones, never brand suspects", () => {
  // example.com/.org/.net are reserved by RFC 2606 and permanently registered:
  // never `available`, therefore never escalated.
  const fixed = [...monitor.matchAll(/["'`](example\.[a-z]+)["'`]/g)].map((m) => m[1]);
  assert(fixed.length > 0, "monitor: expected the example.* reference names");
  for (const domain of fixed) {
    assertEquals(isLikelyBlocked(domain), false, `${domain} is on the brand block list`);
  }
});
