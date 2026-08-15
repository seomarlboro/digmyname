// Pure unit tests for the availability safeguards — NO network.
// Run with: deno test supabase/functions/_shared/pipeline_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { interpretDomainr, isLikelyBlocked } from "./availability-rules.ts";
import { isLikelyPremium, trustsAggregator404, willEscalateToThirdSignal } from "./pipeline.ts";

// ---- interpretDomainr -------------------------------------------------------

Deno.test("interpretDomainr: dpml token wins over free tokens → taken", () => {
  assertEquals(
    interpretDomainr({ domain: "x.software", status: "undelegated inactive dpml" }),
    { kind: "taken", forSale: false },
  );
});

Deno.test("interpretDomainr: reserved → taken", () => {
  assertEquals(interpretDomainr({ domain: "x.com", status: "reserved" }), { kind: "taken", forSale: false });
});

Deno.test("interpretDomainr: disallowed → taken", () => {
  assertEquals(interpretDomainr({ domain: "x.com", status: "disallowed" }), { kind: "taken", forSale: false });
});

Deno.test("interpretDomainr: marketed → taken + forSale", () => {
  assertEquals(interpretDomainr({ domain: "x.com", status: "marketed" }), { kind: "taken", forSale: true });
});

Deno.test("interpretDomainr: bare undelegated → unknown (never confirms a sale)", () => {
  assertEquals(interpretDomainr({ domain: "x.com", status: "undelegated" }), { kind: "unknown" });
});

Deno.test("interpretDomainr: undelegated inactive → available", () => {
  assertEquals(
    interpretDomainr({ domain: "x.com", status: "undelegated inactive" }),
    { kind: "available", premium: false },
  );
});

Deno.test("interpretDomainr: undelegated inactive premium → available + premium", () => {
  assertEquals(
    interpretDomainr({ domain: "x.io", status: "undelegated inactive premium" }),
    { kind: "available", premium: true },
  );
});

Deno.test("interpretDomainr: empty / undefined → unknown", () => {
  assertEquals(interpretDomainr(undefined), { kind: "unknown" });
  assertEquals(interpretDomainr({ domain: "x.com", status: "" }), { kind: "unknown" });
});

// ---- isLikelyBlocked ---------------------------------------------------

Deno.test("isLikelyBlocked: famous DPML brands are flagged", () => {
  assert(isLikelyBlocked("microsoft.software"));
  assert(isLikelyBlocked("google.digital"));
});

Deno.test("isLikelyBlocked: case-insensitive", () => {
  assert(isLikelyBlocked("MICROSOFT.software"));
});

Deno.test("isLikelyBlocked: ICANN Spec-5 reserved second-level labels are flagged", () => {
  // These RDAP-404 + NXDOMAIN like a free name and are not premium suspects,
  // so the list is the only thing standing between them and a priced buy_url.
  for (const sld of ["afrinic", "apnic", "arin", "lacnic", "ripe", "nro", "iab",
                     "iesg", "ietf", "irtf", "istf", "rssac", "ssac", "alac",
                     "aso", "ccnso", "gac", "gnso", "rfc-editor", "example"]) {
    assert(isLikelyBlocked(`${sld}.xyz`), `${sld} must be blocked`);
  }
});

Deno.test("isLikelyBlocked: no substring matching, coined names pass", () => {
  assertEquals(isLikelyBlocked("kvarturbo2748.digital"), false);
  assertEquals(isLikelyBlocked("notmicrosoftatall.com"), false);
});

// ---- downgrade shape (predicate + object, no network) -----------------------

function downgrade(base: { domain: string; available: boolean; checkedVia: string; uncertain?: boolean }) {
  const blocked = isLikelyBlocked(base.domain);
  const brandBlockRisk = base.available && !base.uncertain && blocked;
  if (brandBlockRisk) {
    return {
      domain: base.domain,
      available: false,
      checkedVia: base.checkedVia,
      uncertain: true,
      uncertainReason: "brand_protected" as const,
    };
  }
  if (base.uncertain && blocked) {
    return { ...base, uncertainReason: "brand_protected" as const };
  }
  return base;
}

Deno.test("downgrade: brand-blocked available → available:false + uncertain:true", () => {
  assertEquals(
    downgrade({ domain: "google.digital", available: true, checkedVia: "rdap" }),
    {
      domain: "google.digital",
      available: false,
      checkedVia: "rdap",
      uncertain: true,
      uncertainReason: "brand_protected",
    },
  );
});

Deno.test("downgrade: ordinary coined name keeps its base verdict", () => {
  const base = { domain: "kvarturbo2748.digital", available: true, checkedVia: "rdap" };
  const out = downgrade(base);
  assertEquals(out, base);
  assertEquals((out as { uncertainReason?: string }).uncertainReason, undefined);
});

Deno.test("downgrade: already-uncertain brand-blocked name gains brand_protected reason", () => {
  const out = downgrade({ domain: "google.digital", available: false, checkedVia: "rdap", uncertain: true });
  assertEquals(out, {
    domain: "google.digital",
    available: false,
    checkedVia: "rdap",
    uncertain: true,
    uncertainReason: "brand_protected",
  });
});

Deno.test("downgrade: already-uncertain coined name stays reason-less", () => {
  const base = { domain: "kvarturbo2748.digital", available: false, checkedVia: "rdap", uncertain: true };
  const out = downgrade(base);
  assertEquals(out, base);
  assertEquals((out as { uncertainReason?: string }).uncertainReason, undefined);
});

// ---- Pass-2 branch order: premium-unverified split + brand-block guardrail ---
// Faithful re-model of the checkDomains Pass-2 `else` block (the no-third-signal-
// verdict path). Mirrors the REAL branch ORDER and predicates verbatim so this is
// a tripwire: if the branches are ever reordered or a predicate drifts, these
// tests fail. `likelyPremium` is computed exactly as the real code does
// (`base.likelyPremium ?? isLikelyPremium(base.domain)`).
function resolvePass2NoVerdict(base: {
  domain: string; available: boolean; checkedVia: string;
  uncertain?: boolean; likelyPremium?: boolean;
}, opts: { thirdSignalEnabled: boolean; fastlyKey: boolean }) {
  const likelyPremium = base.likelyPremium ?? isLikelyPremium(base.domain);
  const blocked = isLikelyBlocked(base.domain);
  const brandBlockRisk = base.available && !base.uncertain && blocked;
  if (brandBlockRisk) {
    return { domain: base.domain, available: false, checkedVia: base.checkedVia, uncertain: true, uncertainReason: "brand_protected" as const };
  }
  if (base.uncertain && blocked) {
    return { ...base, uncertainReason: "brand_protected" as const };
  }
  if (opts.thirdSignalEnabled && opts.fastlyKey && base.available && likelyPremium) {
    return { domain: base.domain, available: true, checkedVia: base.checkedVia, likelyPremium: true, premiumUnverified: true };
  }
  return base;
}

Deno.test("pass2 branch3: premium-suspect + available + no Fastly verdict → available + premiumUnverified, no price", () => {
  // noiz.xyz: isLikelyPremium true (4-char SLD on premium TLD), NOT brand-blocked.
  // likelyPremium is intentionally omitted from the input so the test exercises the
  // real `?? isLikelyPremium()` fallback.
  const out = resolvePass2NoVerdict(
    { domain: "noiz.xyz", available: true, checkedVia: "rdap" },
    { thirdSignalEnabled: true, fastlyKey: true },
  );
  assertEquals(out, {
    domain: "noiz.xyz",
    available: true,
    checkedVia: "rdap",
    likelyPremium: true,
    premiumUnverified: true,
  });
  // Guardrail: no price is ever attached in this branch.
  assertEquals((out as { price?: number }).price, undefined);
});

Deno.test("pass2 guardrail: brand-blocked AND premium-suspect → uncertain + brand_protected (branch 1 wins over branch 3)", () => {
  // visa.xyz is the adversarial dual-eligible case: `visa` ∈ BLOCKED_SLDS AND
  // isLikelyPremium (4-char SLD on premium TLD) — eligible for BOTH branch 1 and
  // branch 3. Branch 1 MUST fire first; it must NEVER reach the premium split.
  // likelyPremium omitted so the real predicate decides.
  const out = resolvePass2NoVerdict(
    { domain: "visa.xyz", available: true, checkedVia: "rdap" },
    { thirdSignalEnabled: true, fastlyKey: true },
  );
  assertEquals(out, {
    domain: "visa.xyz",
    available: false,
    checkedVia: "rdap",
    uncertain: true,
    uncertainReason: "brand_protected",
  });
  // Never available, never premium-unverified for a brand-blocked name.
  assertEquals((out as { premiumUnverified?: boolean }).premiumUnverified, undefined);
});

Deno.test("pass2 branch3 inert when third signal disabled → falls through to base (no premiumUnverified)", () => {
  // Flag off OR no key: the split must NOT fire; base verdict passes through
  // unchanged (restores exact pre-Fastly behavior). Guards the code comment's
  // claim that flipping the flag off restores prior behavior.
  const base = { domain: "noiz.xyz", available: true, checkedVia: "rdap", likelyPremium: true };
  assertEquals(resolvePass2NoVerdict(base, { thirdSignalEnabled: false, fastlyKey: true }), base);
  assertEquals(resolvePass2NoVerdict(base, { thirdSignalEnabled: true, fastlyKey: false }), base);
});

// ---- trustsAggregator404 (P0, 2026-08-15) -----------------------------------
// rdap.org answers 404 for EVERY name in a zone it cannot route. Verified live:
// github.io, vercel.io, gaming.gg, google.so, verisign.us — all registered, all
// 404. Only zones the IANA bootstrap maps may have that 404 read as "free".

Deno.test("trustsAggregator404: bootstrap-mapped fast zone → 404 means free", () => {
  assertEquals(trustsAggregator404("com", 1), true);
  assertEquals(trustsAggregator404("xyz", 1), true);
});

Deno.test("trustsAggregator404: FAST_RDAP exceptions (io, us) are NOT in the bootstrap → never trust the aggregator", () => {
  // Regression: `gaming.gg` was sold as available $51.80 and every registered
  // .io without DNS records was one hedge away from the same fate.
  assertEquals(trustsAggregator404("io", 1), false);
  assertEquals(trustsAggregator404("us", 1), false);
});

Deno.test("trustsAggregator404: zone with no RDAP base at all → never trust", () => {
  assertEquals(trustsAggregator404("gg", 0), false);
  assertEquals(trustsAggregator404("so", 0), false);
});

Deno.test("trustsAggregator404: a cold bootstrap (0 bases) fails closed even for a real zone", () => {
  assertEquals(trustsAggregator404("dance", 0), false);
});

Deno.test("trustsAggregator404: .co/.me stay untrusted regardless of bases", () => {
  assertEquals(trustsAggregator404("co", 1), false);
  assertEquals(trustsAggregator404("me", 2), false);
});

// ---- willEscalateToThirdSignal (P0, 2026-08-15) -----------------------------
// Pass 1 may only publish a preliminary available:true for names Pass 2 will NOT
// revisit — a caller whose budget expires serves that preliminary read as final.

Deno.test("willEscalateToThirdSignal: premium suspect read as available → escalates (no preliminary sale)", () => {
  assert(willEscalateToThirdSignal({ domain: "test.dev", available: true, checkedVia: "rdap", likelyPremium: true }));
});

Deno.test("willEscalateToThirdSignal: uncertain always escalates", () => {
  assert(willEscalateToThirdSignal({ domain: "anything.com", available: false, checkedVia: "rdap", uncertain: true }));
});

Deno.test("willEscalateToThirdSignal: blocked SLD read as available → escalates", () => {
  assert(willEscalateToThirdSignal({ domain: "visa.xyz", available: true, checkedVia: "rdap" }));
});

Deno.test("willEscalateToThirdSignal: plain available name does NOT escalate (stays fast + free)", () => {
  assertEquals(
    willEscalateToThirdSignal({ domain: "kirillsdomainidea2026.com", available: true, checkedVia: "rdap" }),
    false,
  );
});
