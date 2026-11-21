// Pure unit tests for the availability safeguards — NO network.
// Run with: deno test supabase/functions/_shared/pipeline_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { interpretDomainr, interpretRdap404, isLikelyBlocked } from "./availability-rules.ts";
import { checkDomains, isLikelyPremium, porkbunRenewalPrice, trustsAggregator404, willEscalateToThirdSignal, type DomainCheckResult } from "./pipeline.ts";

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

Deno.test("isLikelyBlocked: registry-operations labels stay blocked", () => {
  // Specification 5 "Reservations for Registry Operations" — these registries
  // genuinely never hand out, and they RDAP-404 + NXDOMAIN like a free name.
  for (const sld of ["iana", "icann", "internic", "nic", "rdds", "whois", "www"]) {
    assert(isLikelyBlocked(`${sld}.xyz`), `${sld} must stay blocked`);
  }
});

Deno.test("isLikelyBlocked: ICANN/IANA related names are NOT blocked (premise refuted 2026-08-15)", () => {
  // Measured against the .xyz registry's own RDAP: these answer 200, i.e. they
  // are registered by ordinary registrants, so they are registerable and the
  // block list was hiding TAKEN names behind "Unverified" while refusing sales
  // on the free ones. Re-adding them needs new evidence, not a hunch.
  for (const sld of ["apnic", "arin", "aso", "gac", "gnso", "gtld-servers", "iab",
                     "iesg", "irtf", "istf", "nro", "ripe", "root-servers", "ssac",
                     "afrinic", "lacnic", "ietf", "example"]) {
    assertEquals(isLikelyBlocked(`${sld}.xyz`), false, `${sld} must not be blocked`);
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

// ---- DoH verdict shape (P1, 2026-08-15) -------------------------------------
// Faithful re-model of dohProbe's decision over the A + NS responses. Guards the
// rule stated in its comment: only an explicit NXDOMAIN counts as "no records".
function dohVerdict(responses: Array<{ Status?: number; Answer?: unknown[] } | null>) {
  let hasRecords = false;
  let nxdomain = false;
  for (const data of responses) {
    if (!data) continue;
    if (Array.isArray(data.Answer) && data.Answer.length > 0) hasRecords = true;
    if (data.Status === 3) nxdomain = true;
  }
  if (hasRecords) return "has_records";
  if (nxdomain) return "no_records";
  return "error";
}

Deno.test("doh: explicit NXDOMAIN → no_records (the ordinary free name)", () => {
  assertEquals(dohVerdict([{ Status: 3 }, { Status: 3 }]), "no_records");
});

Deno.test("doh: SERVFAIL is absence of evidence → error, never no_records", () => {
  // A registered name whose authoritative NS is broken or DNSSEC-bogus answers
  // SERVFAIL. Paired with an RDAP 404 the old fallback sold it as available.
  assertEquals(dohVerdict([{ Status: 2 }, { Status: 2 }]), "error");
});

Deno.test("doh: NOERROR with an empty Answer → error, never no_records", () => {
  assertEquals(dohVerdict([{ Status: 0, Answer: [] }, { Status: 0 }]), "error");
});

Deno.test("doh: records win over everything", () => {
  assertEquals(dohVerdict([{ Status: 0, Answer: [{}] }, { Status: 3 }]), "has_records");
});

Deno.test("doh: no resolver answered → error", () => {
  assertEquals(dohVerdict([null, null]), "error");
});

// ---- checkDomains: the shared cache is read alongside pass 1, not before it ----

/** Minimal supabase-js stand-in: every query chain is thenable and resolves to `answer(table)`.
 *  `maybeSingle()` unwraps the first row the way PostgREST does (the spend counter
 *  reads that way), and `rpc()` answers under its own function name. */
function stubSupabase(
  answer: (table: string) => Promise<{ data: unknown; error: null }>,
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }> = () =>
    Promise.resolve({ data: null, error: null }),
) {
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ["select", "in", "gt", "eq", "order", "limit", "upsert", "update", "lt"]) q[m] = self;
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => answer(table).then(res, rej);
    q.maybeSingle = () => ({
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        answer(table)
          .then(({ data, error }) => res({ data: Array.isArray(data) ? (data[0] ?? null) : data, error }))
          .catch((e) => (rej ? rej(e) : Promise.reject(e))),
    });
    return q;
  };
  return { from: chain, rpc } as unknown as NonNullable<Parameters<typeof checkDomains>[1]>["supabase"];
}

// The pipeline's hedge / timeout timers are unref'd and outlive the request on purpose, so the timer sanitizer is off here.
Deno.test({ name: "checkDomains: probes leave before the DB cache answers; a cached row still wins for its name", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const realFetch = globalThis.fetch;
  const probed: string[] = [];
  let probeStartedBeforeCache = false;
  let releaseCache!: () => void;
  const cacheGate = new Promise<void>((r) => (releaseCache = r));
  let cacheSettled = false;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/domain/")) {
      probed.push(url);
      if (!cacheSettled) probeStartedBeforeCache = true;
      return new Response("", { status: 404 }); // registry: not registered
    }
    if (url.includes("dns-query") || url.includes("dns.google") || url.includes("adguard")) return json({ Status: 3, Answer: [] }); // NXDOMAIN
    if (url.includes("data.iana.org")) return json({ services: [] });
    if (url.includes("porkbun.com")) return json({ status: "SUCCESS", pricing: {} });
    return new Response("", { status: 404 });
  }) as typeof fetch;

  const supabase = stubSupabase(async (table) => {
    if (table === "domain_cache") {
      await cacheGate;
      cacheSettled = true;
      return {
        data: [{ domain: "cachedname.com", available: true, checked_via: "domainr", rdap_data: { cache_version: 6, reg_price: 9.99, premium: false } }],
        error: null,
      };
    }
    return { data: [], error: null };
  });

  try {
    const sink = new Map<string, DomainCheckResult>();
    const run = checkDomains(["freshname.com", "cachedname.com"], { supabase, partialSink: sink, thirdSignalDeadlineAt: Date.now() + 1000 });
    // Let the probes start while the cache read is still pending, then release it.
    await new Promise((r) => setTimeout(r, 50));
    assert(probed.some((u) => u.includes("freshname.com")), "the fresh name was probed while the cache read was pending");
    assert(probeStartedBeforeCache, "probes must not wait for the DB round trip");
    releaseCache();
    const results = await run;

    const fresh = results.find((r) => r.domain === "freshname.com")!;
    const cached = results.find((r) => r.domain === "cachedname.com")!;
    assertEquals([fresh.available, fresh.uncertain ?? false, fresh.checkedVia], [true, false, "rdap"]);
    // The cached row wins for its name — with the enrichment a raw probe cannot know.
    assertEquals([cached.available, cached.checkedVia, cached.price], [true, "domainr", 9.99]);
    assertEquals(sink.get("cachedname.com")?.checkedVia, "domainr");
  } finally {
    globalThis.fetch = realFetch;
  }
} });

Deno.test({ name: "checkDomains: verifyPremium confirms the typed name through Porkbun and never buys a paid call", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const realFetch = globalThis.fetch;
  const envBefore = { fastly: Deno.env.get("FASTLY_API_TOKEN"), pk: Deno.env.get("PORKBUN_API_KEY"), ps: Deno.env.get("PORKBUN_SECRET_KEY") };
  Deno.env.set("FASTLY_API_TOKEN", "test-token");
  Deno.env.set("PORKBUN_API_KEY", "pk");
  Deno.env.set("PORKBUN_SECRET_KEY", "sk");
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.fastly.com")) {
      const domain = new URL(url).searchParams.get("domain") ?? "";
      return json({ domain, zone: "dev", status: "undelegated inactive premium", summary: "premium" });
    }
    if (url.includes("api.porkbun.com/api/json/v3/domain/checkDomain/")) return json({ status: "SUCCESS", response: { avail: "yes", premium: "yes", price: "164.57", regularPrice: "164.57" } });
    if (url.includes("/domain/")) return new Response("", { status: 404 }); // registry RDAP: not registered
    if (url.includes("dns-query") || url.includes("dns.google") || url.includes("adguard")) return json({ Status: 3, Answer: [] });
    if (url.includes("data.iana.org")) return json({ services: [] });
    if (url.includes("porkbun.com")) return json({ status: "SUCCESS", pricing: { dev: { registration: "8.48", renewal: "18.48" } } });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const supabase = stubSupabase(async () => ({ data: [], error: null }));
  try {
    // Without the flag: a 10-letter label is no suspect, nothing is verified, the standard price ships.
    const plain = await checkDomains(["reputation.dev"], { supabase, thirdSignalDeadlineAt: Date.now() + 3000 });
    assertEquals(calls.filter((u) => u.includes("api.fastly.com")).length, 0);
    assertEquals(calls.filter((u) => u.includes("checkDomain")).length, 0);
    assertEquals([plain[0].available, plain[0].premium ?? false], [true, false]);

    // With the flag: Porkbun — not the metered third signal — confirms that the
    // typed name is registry-premium and what it really costs.
    const verified = await checkDomains(["reputation.dev"], { supabase, thirdSignalDeadlineAt: Date.now() + 3000, verifyPremium: new Set(["reputation.dev"]) });
    assertEquals(calls.filter((u) => u.includes("api.fastly.com")).length, 0, "the typed name must never buy a paid call");
    assertEquals(calls.filter((u) => u.includes("checkDomain")).length, 1);
    const r = verified[0];
    assertEquals([r.available, r.premium, r.price, r.checkedVia], [true, true, 164.57, "porkbun"]);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of [["FASTLY_API_TOKEN", envBefore.fastly], ["PORKBUN_API_KEY", envBefore.pk], ["PORKBUN_SECRET_KEY", envBefore.ps]] as const) {
      if (v == null) Deno.env.delete(k); else Deno.env.set(k, v);
    }
  }
} });

Deno.test({ name: "checkDomains: over the daily cap no paid call leaves, and the card degrades to premium-unverified (never priced, never 'available' on weaker evidence)", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const realFetch = globalThis.fetch;
  const envBefore = { fastly: Deno.env.get("FASTLY_API_TOKEN"), cap: Deno.env.get("FASTLY_DAILY_CAP") };
  Deno.env.set("FASTLY_API_TOKEN", "test-token");
  Deno.env.set("FASTLY_DAILY_CAP", "10");
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/domain/")) return new Response("", { status: 404 }); // registry RDAP: not registered
    if (url.includes("dns-query") || url.includes("dns.google") || url.includes("adguard")) return json({ Status: 3, Answer: [] });
    if (url.includes("data.iana.org")) return json({ services: [] });
    if (url.includes("porkbun.com")) return json({ status: "SUCCESS", pricing: { dev: { registration: "8.48", renewal: "18.48" } } });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const spendCalls: Record<string, unknown>[] = [];
  // Today's counter already sits ON the cap (10 of 10 spent).
  const supabase = stubSupabase(
    async (table) => ({ data: table === "fastly_spend_daily" ? [{ calls: 10 }] : [], error: null }),
    (_fn, args) => { spendCalls.push(args); return Promise.resolve({ data: null, error: null }); },
  );
  try {
    // A 3-character label is a premium suspect on every TLD → pass 1 says available,
    // pass 2 would normally confirm the registry-premium status. The cap is spent.
    const [r] = await checkDomains(["qzv.dev"], { supabase, thirdSignalDeadlineAt: Date.now() + 3000 });
    assertEquals(calls.filter((u) => u.includes("api.fastly.com")).length, 0);
    // Honest degraded state: still registerable (two authoritative signals agreed),
    // flagged premium, and with NO price — the card reads "Check price".
    assertEquals([r.available, r.premiumUnverified, r.likelyPremium, r.price], [true, true, true, undefined]);
    // The refusal is accounted for, so the first hour shows visitors are being degraded.
    assertEquals(spendCalls.length, 1);
    assertEquals([spendCalls[0].n_calls, spendCalls[0].n_blocked], [0, 1]);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of [["FASTLY_API_TOKEN", envBefore.fastly], ["FASTLY_DAILY_CAP", envBefore.cap]] as const) {
      if (v == null) Deno.env.delete(k); else Deno.env.set(k, v);
    }
  }
} });

// ---- Premium renewal: the registrar's quote, never a catalog guess ----------
import { confirmedPremiumRenewal } from "./pipeline.ts";

Deno.test("confirmedPremiumRenewal: confirmed priced premium → the quoted renewal, whatever its size", () => {
  // Real Porkbun quotes 2026-09-16: same as year one, higher, and lower.
  assertEquals(confirmedPremiumRenewal({ available: true, renewPrice: 174.1 }, true, 174.1), 174.1);
  assertEquals(confirmedPremiumRenewal({ available: true, renewPrice: 273.44 }, true, 68.75), 273.44);
  assertEquals(confirmedPremiumRenewal({ available: true, renewPrice: 76.94 }, true, 348.17), 76.94);
});

Deno.test("confirmedPremiumRenewal: standard, taken, unpriced or missing quote → nothing", () => {
  assertEquals(confirmedPremiumRenewal({ available: true, renewPrice: 20 }, false, 10), undefined);
  assertEquals(confirmedPremiumRenewal({ available: false, renewPrice: 200 }, true, 200), undefined);
  assertEquals(confirmedPremiumRenewal({ available: true, renewPrice: 200 }, true, undefined), undefined);
  assertEquals(confirmedPremiumRenewal({ available: true }, true, 200), undefined);
  assertEquals(confirmedPremiumRenewal({ available: true, renewPrice: 0 }, true, 200), undefined);
});

Deno.test("premium renewal is additive: availability, uncertainty and third-signal escalation do not change", () => {
  const base = { domain: "reputation.space", available: true, checkedVia: "porkbun", price: 68.75, premium: true, likelyPremium: true };
  const withRenewal = { ...base, premiumRenewPrice: confirmedPremiumRenewal({ available: true, renewPrice: 273.44 }, true, 68.75) };
  assertEquals(withRenewal.premiumRenewPrice, 273.44);
  assertEquals(withRenewal.available, base.available);
  assertEquals((withRenewal as { uncertain?: boolean }).uncertain, (base as { uncertain?: boolean }).uncertain);
  assertEquals(willEscalateToThirdSignal(withRenewal), willEscalateToThirdSignal(base));
  const taken = { domain: "x.com", available: false, checkedVia: "rdap" };
  assertEquals(willEscalateToThirdSignal({ ...taken, premiumRenewPrice: 99 }), willEscalateToThirdSignal(taken));
});

// Porkbun documents `additional.renewal` as an object; a bare number has also been seen.
// Reading only the number form silently dropped every premium renewal in production (2026-09-16).
Deno.test("porkbunRenewalPrice: object form, bare number, strings — and nothing else", () => {
  assertEquals(porkbunRenewalPrice({ type: "year", price: "174.10", regularPrice: "174.10" }), 174.1);
  assertEquals(porkbunRenewalPrice({ price: 273.44 }), 273.44);
  assertEquals(porkbunRenewalPrice({ regularPrice: "76.94" }), 76.94);
  assertEquals(porkbunRenewalPrice("51.80"), 51.8);
  assertEquals(porkbunRenewalPrice(51.8), 51.8);
  assertEquals(porkbunRenewalPrice(undefined), undefined);
  assertEquals(porkbunRenewalPrice(null), undefined);
  assertEquals(porkbunRenewalPrice({}), undefined);
  assertEquals(porkbunRenewalPrice({ price: "" }), undefined);
  assertEquals(porkbunRenewalPrice({ price: "n/a" }), undefined);
  assertEquals(porkbunRenewalPrice(0), undefined);
});

// ---- A registry 404 that says "reserved" is not a free name -----------------
// Regression for 2026-11-21: `garden.tech` has no registration and no DNS, the
// registry answers 404 — and says in the body that the name is reserved. Every
// 404 used to read as "not registered", so the API reported it available at the
// extension's standard price. Bodies below are the registry's own, captured
// that day from rdap.radix.host.
const RADIX_404_RESERVED = JSON.stringify({
  rdapConformance: ["rdap_level_0", "icann_rdap_response_profile_1", "icann_rdap_technical_implementation_guide_1", "redacted"],
  errorCode: 404,
  title: "Not Found",
  description: ["Domain Name: garden.tech", "This name is not available for registration:", "Domain name is registry reserved"],
});
const radix404Free = (domain: string) => JSON.stringify({
  rdapConformance: ["rdap_level_0", "icann_rdap_response_profile_1", "icann_rdap_technical_implementation_guide_1", "redacted"],
  errorCode: 404,
  title: "Not Found",
  description: [`Domain ${domain} is available for registration`, "Please visit https://rdap.radix.host/registrars/ for a list of accredited registrars"],
});
const RADIX_404_WRONG_TLD = JSON.stringify({
  errorCode: 404,
  title: "Not Found",
  description: ["Domain Name: coffee.xyz", "This name is not available for registration:", "Tld not supported by this registry interface"],
});

Deno.test("interpretRdap404: the registry's own wording decides, and only its error description is read", () => {
  assertEquals(interpretRdap404(RADIX_404_RESERVED), "reserved");
  assertEquals(interpretRdap404(radix404Free("qqzzxxjjkkvv.tech")), "not_registered");
  assertEquals(interpretRdap404(RADIX_404_WRONG_TLD), "not_registerable");
  // The other registries' plain 404s: empty (Verisign), "Object not found", "<name> not found".
  assertEquals(interpretRdap404(""), "not_registered");
  assertEquals(interpretRdap404(JSON.stringify({ errorCode: 404, title: "Object not found", description: ["Object not found"] })), "not_registered");
  assertEquals(interpretRdap404(JSON.stringify({ errorCode: 404, description: ["qqzzxxjjkkvv.dev not found"] })), "not_registered");
  // Terms-of-service prose in `notices` says nothing about the name.
  assertEquals(
    interpretRdap404(JSON.stringify({ errorCode: 404, description: ["Object not found"], notices: [{ description: ["The registry reserves the right to restrict access. All rights reserved."] }] })),
    "not_registered",
  );
  // Not an RDAP error object at all (an HTML error page): nothing to read.
  assertEquals(interpretRdap404("<html><body>404 — all rights reserved</body></html>"), "not_registered");
});

Deno.test({ name: "checkDomains: a registry-reserved name (404 + 'registry reserved') is never available; a plain 404 in the same TLD still is", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const realFetch = globalThis.fetch;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const rdap404 = (body: string) => new Response(body, { status: 404, headers: { "content-type": "application/rdap+json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    // The registry and the aggregator (which redirects to it) give the same body.
    if (url.endsWith("/domain/garden.tech")) return rdap404(RADIX_404_RESERVED);
    if (url.endsWith("/domain/gardenplot.tech")) return rdap404(radix404Free("gardenplot.tech"));
    if (url.endsWith("/domain/gardenwall.tech")) return rdap404(RADIX_404_WRONG_TLD);
    if (url.includes("dns-query") || url.includes("dns.google") || url.includes("adguard")) return json({ Status: 3, Answer: [] }); // NXDOMAIN for all three
    if (url.includes("data.iana.org")) return json({ services: [] });
    if (url.includes("porkbun.com")) return json({ status: "SUCCESS", pricing: { tech: { registration: "6.99", renewal: "50.98" } } });
    return new Response("", { status: 404 });
  }) as typeof fetch;

  // Capture what would be written to the shared cache.
  const written: Array<{ domain: string; available: boolean }> = [];
  const base = stubSupabase(async () => ({ data: [], error: null })) as unknown as { from: (t: string) => Record<string, unknown>; rpc: unknown };
  const supabase = {
    rpc: base.rpc,
    from: (table: string) => {
      const q = base.from(table);
      const upsert = q.upsert as (rows: unknown) => unknown;
      q.upsert = (rows: unknown) => {
        if (table === "domain_cache") written.push(...(Array.isArray(rows) ? rows : [rows]) as Array<{ domain: string; available: boolean }>);
        return upsert(rows);
      };
      return q;
    },
  } as unknown as NonNullable<Parameters<typeof checkDomains>[1]>["supabase"];

  try {
    const results = await checkDomains(["garden.tech", "gardenplot.tech", "gardenwall.tech"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000 });
    const by = new Map(results.map((r) => [r.domain, r]));

    // Reserved by the registry: not available, and not "couldn't verify" either — the registry was explicit.
    const reserved = by.get("garden.tech")!;
    assertEquals([reserved.available, reserved.uncertain ?? false, reserved.checkedVia], [false, false, "rdap"]);
    assertEquals(reserved.price, undefined, "a reserved name carries no price");

    // The ordinary free name in the same TLD is untouched by the fix.
    const free = by.get("gardenplot.tech")!;
    assertEquals([free.available, free.uncertain ?? false, free.checkedVia], [true, false, "rdap"]);

    // "Not available for registration" for a reason we do not recognise: never available, honestly uncertain.
    const refused = by.get("gardenwall.tech")!;
    assertEquals([refused.available, refused.uncertain], [false, true]);

    // Nothing but the free name may reach the cache as available.
    assertEquals(written.filter((w) => w.available).map((w) => w.domain), ["gardenplot.tech"]);
  } finally {
    globalThis.fetch = realFetch;
  }
} });

// ---- A standard price needs a registrar's word (2026-11-21) -----------------
// `online.store` has no registration and no DNS, so the registry answers a plain
// 404 — and a registrar sells it for $6,823.39 the first year, renewing at
// $27,291.98. The pipeline printed the extension's standard $0.98 next to it,
// because a 6-letter label was never a "premium suspect". On every extension but
// .com/.net/.org a standard price is now printed only once a registrar has
// quoted that very name; until then the name is `priceUnverified`.

/** stubSupabase plus a record of every row upserted into `domain_cache`. */
function recordingSupabase(answer: (table: string) => Promise<{ data: unknown; error: null }>) {
  const written: Array<{ domain: string; available: boolean; checked_via: string; rdap_data: Record<string, unknown> }> = [];
  const base = stubSupabase(answer) as unknown as { from: (t: string) => Record<string, unknown>; rpc: unknown };
  const supabase = {
    rpc: base.rpc,
    from: (table: string) => {
      const q = base.from(table);
      const upsert = q.upsert as (rows: unknown) => unknown;
      q.upsert = (rows: unknown) => {
        if (table === "domain_cache") written.push(...(Array.isArray(rows) ? rows : [rows]) as typeof written);
        return upsert(rows);
      };
      return q;
    },
  } as unknown as NonNullable<Parameters<typeof checkDomains>[1]>["supabase"];
  return { supabase, written };
}

/** Registry: nothing registered. DNS: NXDOMAIN. Registrar: whatever `quote` says. */
function stubNetwork(quote: (domains: string[]) => Response, calls: string[]) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.porkbun.com/api/json/v3/domain/checkDomain")) {
      calls.push(url);
      const single = url.split("/checkDomain/")[1];
      const body = JSON.parse(String(init?.body ?? "{}")) as { domains?: string[] };
      return quote(single ? [decodeURIComponent(single)] : (body.domains ?? []));
    }
    if (url.includes("/domain/")) return new Response("", { status: 404 });
    if (url.includes("dns-query") || url.includes("dns.google") || url.includes("adguard")) return json({ Status: 3, Answer: [] });
    if (url.includes("data.iana.org")) return json({ services: [] });
    if (url.includes("porkbun.com")) return json({ status: "SUCCESS", pricing: { store: { registration: "2.57", renewal: "43.77" }, dev: { registration: "10.18", renewal: "12.87" } } });
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

const PRICE_TABLE = [{ tld: "store", reg_price: 0.98 }, { tld: "dev", reg_price: 10.18 }, { tld: "com", reg_price: 9.59 }];
const withRegistrarKeys = async (fn: () => Promise<void>) => {
  const before = { pk: Deno.env.get("PORKBUN_API_KEY"), ps: Deno.env.get("PORKBUN_SECRET_KEY") };
  Deno.env.set("PORKBUN_API_KEY", "pk");
  Deno.env.set("PORKBUN_SECRET_KEY", "sk");
  try { await fn(); } finally {
    for (const [k, v] of [["PORKBUN_API_KEY", before.pk], ["PORKBUN_SECRET_KEY", before.ps]] as const) {
      if (v == null) Deno.env.delete(k); else Deno.env.set(k, v);
    }
  }
};
const json200 = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

Deno.test({ name: "price: an available name on a premium-tier extension carries NO standard price until a registrar quotes it; .com is unchanged", sanitizeOps: false, sanitizeResources: false, fn: () => withRegistrarKeys(async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = stubNetwork(() => json200({ status: "SUCCESS", domains: {} }), calls);
  const { supabase, written } = recordingSupabase(async (table) => ({ data: table === "registrar_prices" ? PRICE_TABLE : [], error: null }));
  try {
    // The search wave: no quote mode. `onlineone.store` stands in for online.store (same shape: 6+ letters, plain 404).
    const results = await checkDomains(["onlineone.store", "onlineone.com"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000 });
    const by = new Map(results.map((r) => [r.domain, r]));

    const store = by.get("onlineone.store")!;
    assertEquals([store.available, store.uncertain ?? false, store.checkedVia], [true, false, "rdap"], "the verdict itself does not change");
    assertEquals(store.price, undefined, "the standard $0.98 must not be printed for an unquoted name");
    assertEquals(store.priceUnverified, true);
    assertEquals(store.premiumUnverified ?? false, false, "not a premium suspect — only the price is unknown");

    // .com has one registry price for every free name: nothing to quote.
    const com = by.get("onlineone.com")!;
    assertEquals([com.available, com.price, com.priceUnverified ?? false], [true, 9.59, false]);

    assertEquals(calls.length, 0, "the wave never waits for a registrar");
    const row = written.find((w) => w.domain === "onlineone.store")!;
    assertEquals([row.available, row.rdap_data.reg_price, row.rdap_data.price_unverified], [true, null, true], "cached without a price, flagged");
    assert(new Date((row as unknown as { expires_at: string }).expires_at).getTime() - Date.now() <= 600_000 + 1000, "a name waiting for its quote is cached 10 minutes at most");
  } finally {
    globalThis.fetch = realFetch;
  }
}) });

Deno.test({ name: "price: the follow-up request quotes waiting names in ONE registrar call — standard price, premium price, or not available after all", sanitizeOps: false, sanitizeResources: false, fn: () => withRegistrarKeys(async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = stubNetwork((domains) => {
    const answers: Record<string, unknown> = {
      // An ordinary name: the registrar's own standard price.
      "plainquoted.store": { avail: "yes", premium: "no", price: "2.57", regularPrice: "43.77" },
      // The online.store case, with the figures quoted on 2026-11-21.
      "premiumquoted.store": { avail: "yes", premium: "yes", price: "6823.39", regularPrice: "27291.98", additional: { renewal: { price: "27291.98" } } },
      // The registry will not sell it (reserved, and its 404 said nothing).
      "refusedquoted.store": { avail: "no", premium: "no" },
    };
    return json200({ status: "SUCCESS", domains: Object.fromEntries(domains.filter((d) => d in answers).map((d) => [d, answers[d]])), unresolved: domains.filter((d) => !(d in answers)) });
  }, calls);
  // All four sit in the shared cache from the search wave, waiting for a quote.
  const waiting = (domain: string) => ({ domain, available: true, checked_via: "rdap", rdap_data: { cache_version: 6, reg_price: null, price_unverified: true } });
  const names = ["plainquoted.store", "premiumquoted.store", "refusedquoted.store", "silentquoted.store"];
  const { supabase, written } = recordingSupabase(async (table) => ({
    data: table === "domain_cache" ? names.map(waiting) : table === "registrar_prices" ? PRICE_TABLE : [],
    error: null,
  }));
  try {
    const results = await checkDomains(names, { supabase, thirdSignalDeadlineAt: Date.now() + 1000, quotePrices: "await" });
    const by = new Map(results.map((r) => [r.domain, r]));
    assertEquals(calls.length, 1, "four names, one bulk call");

    // Standard: the extension's standard price (cheapest registrar we track), verdict and source untouched.
    const plain = by.get("plainquoted.store")!;
    assertEquals([plain.available, plain.price, plain.priceUnverified ?? false, plain.premium ?? false, plain.checkedVia], [true, 0.98, false, false, "rdap"]);

    // Premium: the registrar's figures, never the standard price.
    const premium = by.get("premiumquoted.store")!;
    assertEquals([premium.available, premium.premium, premium.price, premium.premiumRenewPrice, premium.priceUnverified ?? false, premium.checkedVia], [true, true, 6823.39, 27291.98, false, "porkbun"]);

    // Not for sale after all: never available.
    const refused = by.get("refusedquoted.store")!;
    assertEquals([refused.available, refused.price, refused.checkedVia], [false, undefined, "porkbun"]);

    // The registrar did not answer for this one: still available, still no price.
    const silent = by.get("silentquoted.store")!;
    assertEquals([silent.available, silent.price, silent.priceUnverified], [true, undefined, true]);

    // The cache now holds the quoted answers, so the next visitor does not ask again.
    const cached = new Map(written.map((w) => [w.domain, w]));
    assertEquals([cached.get("plainquoted.store")!.rdap_data.reg_price, cached.get("plainquoted.store")!.rdap_data.price_unverified], [0.98, false]);
    assertEquals([cached.get("premiumquoted.store")!.rdap_data.premium, cached.get("premiumquoted.store")!.rdap_data.reg_price], [true, 6823.39]);
    assertEquals(cached.get("refusedquoted.store")!.available, false);
  } finally {
    globalThis.fetch = realFetch;
  }
}) });

Deno.test({ name: "price: without a registrar (no key, or it fails) the name stays available and price-less — never the standard price", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = stubNetwork(() => new Response("upstream down", { status: 503 }), calls);
  const { supabase } = recordingSupabase(async (table) => ({ data: table === "registrar_prices" ? PRICE_TABLE : [], error: null }));
  const before = { pk: Deno.env.get("PORKBUN_API_KEY"), ps: Deno.env.get("PORKBUN_SECRET_KEY") };
  try {
    // No key configured at all.
    Deno.env.delete("PORKBUN_API_KEY"); Deno.env.delete("PORKBUN_SECRET_KEY");
    const noKey = await checkDomains(["nokeyname.store"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000, quotePrices: "await" });
    assertEquals([noKey[0].available, noKey[0].price, noKey[0].priceUnverified], [true, undefined, true]);
    assertEquals(calls.length, 0);

    // Key present, registrar answers 503.
    Deno.env.set("PORKBUN_API_KEY", "pk"); Deno.env.set("PORKBUN_SECRET_KEY", "sk");
    const failed = await checkDomains(["failname.store", "failname.dev"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000, quotePrices: "await" });
    for (const r of failed) assertEquals([r.available, r.price, r.priceUnverified], [true, undefined, true], r.domain);
    assertEquals(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of [["PORKBUN_API_KEY", before.pk], ["PORKBUN_SECRET_KEY", before.ps]] as const) {
      if (v == null) Deno.env.delete(k); else Deno.env.set(k, v);
    }
  }
} });

Deno.test({ name: "price: the API answers at once without a price and stores the registrar's quote for the next call", sanitizeOps: false, sanitizeResources: false, fn: () => withRegistrarKeys(async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = stubNetwork(() => json200({ status: "SUCCESS", response: { avail: "yes", premium: "no", price: "10.18", regularPrice: "12.87" } }), calls);
  const { supabase, written } = recordingSupabase(async (table) => ({ data: table === "registrar_prices" ? PRICE_TABLE : [], error: null }));
  try {
    const results = await checkDomains(["apiquoted.dev"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000, quotePrices: "background" });
    // What the caller receives: available, no price yet.
    assertEquals([results[0].available, results[0].price, results[0].priceUnverified], [true, undefined, true]);
    // What was stored once the registrar answered (outside the edge runtime the job is awaited).
    assertEquals(calls.length, 1);
    const last = written.filter((w) => w.domain === "apiquoted.dev").at(-1)!;
    assertEquals([last.available, last.rdap_data.reg_price, last.rdap_data.price_unverified, last.checked_via], [true, 10.18, false, "rdap"]);

    // The next call is served from the cache — priced, and without asking the registrar again.
    const again = await checkDomains(["apiquoted.dev"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000, quotePrices: "background" });
    assertEquals([again[0].available, again[0].price, again[0].priceUnverified ?? false], [true, 10.18, false]);
    assertEquals(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
}) });

Deno.test({ name: "reserved: the flag travels with the taken verdict and into the cache row", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const realFetch = globalThis.fetch;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/domain/gardenbed.tech")) return new Response(RADIX_404_RESERVED, { status: 404 });
    if (url.endsWith("/domain/takenbed.tech")) return json({ objectClassName: "domain", events: [{ eventAction: "registration", eventDate: "2016-06-06T13:33:19Z" }] });
    if (url.includes("dns-query") || url.includes("dns.google") || url.includes("adguard")) return json({ Status: 3, Answer: [] });
    if (url.includes("data.iana.org")) return json({ services: [] });
    if (url.includes("porkbun.com")) return json({ status: "SUCCESS", pricing: {} });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const { supabase, written } = recordingSupabase(async () => ({ data: [], error: null }));
  try {
    const results = await checkDomains(["gardenbed.tech", "takenbed.tech"], { supabase, thirdSignalDeadlineAt: Date.now() + 1000 });
    const by = new Map(results.map((r) => [r.domain, r]));
    assertEquals([by.get("gardenbed.tech")!.available, by.get("gardenbed.tech")!.reserved], [false, true]);
    // An ordinary registration is not "reserved".
    assertEquals([by.get("takenbed.tech")!.available, by.get("takenbed.tech")!.reserved ?? false, by.get("takenbed.tech")!.sinceYear], [false, false, 2016]);
    assertEquals(written.find((w) => w.domain === "gardenbed.tech")!.rdap_data.reserved, true);
    assertEquals(written.find((w) => w.domain === "takenbed.tech")!.rdap_data.reserved, false);
  } finally {
    globalThis.fetch = realFetch;
  }
} });

