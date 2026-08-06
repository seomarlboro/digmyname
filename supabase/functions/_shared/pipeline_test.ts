// Pure unit tests for the availability safeguards — NO network.
// Run with: deno test supabase/functions/_shared/pipeline_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { interpretDomainr, isLikelyBlocked } from "./availability-rules.ts";

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
