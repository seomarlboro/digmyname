// Smoke tests: verify trust hierarchy via live edge function call.
// Loads .env so VITE_SUPABASE_URL / KEY are available.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyAftermarket, interpretDomainr, isValidDomain, loadTldPricing } from "./index.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/check-domains`;

async function check(domains: string[]) {
  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ domains }),
  });
  const json = await resp.json();
  return { status: resp.status, results: json.results as Array<Record<string, unknown>> };
}

Deno.test("known-taken short .com is never reported as available", async () => {
  // google.com is registered → must be available:false.
  const { status, results } = await check(["google.com"]);
  assertEquals(status, 200);
  const r = results[0];
  assertEquals(r.available, false, `google.com should be taken, got ${JSON.stringify(r)}`);
});

Deno.test("invalid domain is rejected", async () => {
  const { status } = await check(["not a domain!!"]);
  assertEquals(status, 400);
});

Deno.test("short SLD on .com gets premium/uncertain treatment when available", async () => {
  // 3-letter .com that is registered must be reported as taken; if any signal
  // marked it available it would carry likelyPremium=true.
  const { results } = await check(["abc.com"]);
  const r = results[0];
  if (r.available === true) {
    assert(r.likelyPremium === true, "available short .com must be flagged likelyPremium");
  } else {
    assertEquals(r.available, false);
  }
});

Deno.test("clearly-available random domain returns true", async () => {
  const rand = `lvbl-${crypto.randomUUID().slice(0, 8)}.com`;
  const { results } = await check([rand]);
  const r = results[0];
  // Should be available; if uncertain, must NOT claim available=true.
  if (r.uncertain) {
    assertEquals(r.available, false);
  } else {
    assertEquals(r.available, true);
  }
});

Deno.test("uncertain results never claim available:true", async () => {
  // Mix of real domains — none should ever be both uncertain and available.
  const probes = ["google.com", `lvbl-${crypto.randomUUID().slice(0, 8)}.com`];
  const { results } = await check(probes);
  for (const r of (results ?? [])) {
    if (r?.uncertain === true) {
      assertEquals(r.available, false, `uncertain must imply available:false, got ${JSON.stringify(r)}`);
    }
  }
});

Deno.test("IANA RDAP bootstrap file maps major TLDs to authoritative servers", async () => {
  // Validate the exact upstream the edge function relies on (IANA dns.json).
  // If this ever fails, our RDAP lookups will silently fall back to rdap.org.
  const resp = await fetch("https://data.iana.org/rdap/dns.json", {
    signal: AbortSignal.timeout(8000),
  });
  assertEquals(resp.status, 200, "IANA dns.json must be reachable");
  const data = await resp.json() as { services: Array<[string[], string[]]> };
  assert(Array.isArray(data.services) && data.services.length > 0, "services array must exist");

  const map = new Map<string, string[]>();
  for (const [tlds, bases] of data.services) {
    for (const tld of tlds) map.set(tld.toLowerCase(), bases);
  }
  assert(map.size > 100, `expected >100 TLDs mapped, got ${map.size}`);
  for (const tld of ["com", "net", "org", "app", "dev"]) {
    const bases = map.get(tld);
    assert(bases && bases.length > 0, `TLD ${tld} should have an RDAP base URL`);
    for (const base of bases) {
      assert(base.startsWith("https://"), `RDAP base for ${tld} should be https, got ${base}`);
    }
  }
});

// ---- Aftermarket NS classifier (pure unit tests, no network) ----------------

Deno.test("classifyAftermarket: Sedo parking NS → Sedo", () => {
  const hit = classifyAftermarket(["ns1.sedoparking.com.", "ns2.sedoparking.com."]);
  assert(hit, "expected aftermarket hit");
  assertEquals(hit!.marketplace, "Sedo");
  assert(hit!.buildUrl("example.com").startsWith("https://sedo.com/"));
});

Deno.test("classifyAftermarket: Dan.com NS → Dan.com", () => {
  const hit = classifyAftermarket(["ns1.dan.com", "ns2.dan.com"]);
  assert(hit);
  assertEquals(hit!.marketplace, "Dan.com");
  assertEquals(hit!.buildUrl("example.io"), "https://dan.com/buy-domain/example.io");
});

Deno.test("classifyAftermarket: Afternic / dnsowl NS → Afternic", () => {
  const a = classifyAftermarket(["ns1.afternic.com"]);
  const b = classifyAftermarket(["ns01.dnsowl.com"]);
  assertEquals(a?.marketplace, "Afternic");
  assertEquals(b?.marketplace, "Afternic");
});

Deno.test("classifyAftermarket: HugeDomains NS → HugeDomains", () => {
  const hit = classifyAftermarket(["ns1.hugedomains.com"]);
  assertEquals(hit?.marketplace, "HugeDomains");
  assert(hit!.buildUrl("foo.com").includes("d=foo"));
});

Deno.test("classifyAftermarket: regular nameservers → null", () => {
  assertEquals(classifyAftermarket(["ns1.google.com", "ns2.google.com"]), null);
  assertEquals(classifyAftermarket(["dns1.p01.nsone.net"]), null);
  assertEquals(classifyAftermarket([]), null);
});

Deno.test("classifyAftermarket: case-insensitive + trailing dot tolerated", () => {
  const hit = classifyAftermarket(["NS1.SedoParking.com."]);
  assertEquals(hit?.marketplace, "Sedo");
});

Deno.test("classifyAftermarket: anti-spoof — sedoparking-as-subdomain on other root is ignored", () => {
  // attacker.com using "sedoparking.com.attacker.example" must NOT match.
  assertEquals(classifyAftermarket(["ns1.sedoparking.com.attacker.example"]), null);
});

// ---- Domainr status interpretation (pure unit tests) ------------------------

Deno.test("interpretDomainr: undelegated transferable → AVAILABLE (not premium)", () => {
  const v = interpretDomainr({ domain: "x.com", status: "undelegated transferable" });
  assertEquals(v.kind, "available");
  assertEquals(v.kind === "available" && v.premium, false);
});

Deno.test("interpretDomainr: inactive priced premium → AVAILABLE + premium", () => {
  const v = interpretDomainr({ domain: "x.io", status: "inactive priced premium transferable" });
  assertEquals(v.kind, "available");
  assertEquals(v.kind === "available" && v.premium, true);
});

Deno.test("interpretDomainr: active marketed → TAKEN + marketed", () => {
  const v = interpretDomainr({ domain: "x.com", status: "active marketed transferable" });
  assertEquals(v.kind, "taken");
  assertEquals(v.kind === "taken" && v.marketed, true);
});

Deno.test("interpretDomainr: parked/reserved/suffix → TAKEN", () => {
  for (const s of ["parked", "reserved", "disallowed", "suffix", "deleting"]) {
    assertEquals(interpretDomainr({ domain: "x.com", status: s }).kind, "taken", s);
  }
});

Deno.test("interpretDomainr: empty / unknown status → unknown", () => {
  assertEquals(interpretDomainr(undefined).kind, "unknown");
  assertEquals(interpretDomainr({ domain: "x.com", status: "" }).kind, "unknown");
  assertEquals(interpretDomainr({ domain: "x.com", status: "transferable" }).kind, "unknown");
});

// ---- Domain validation ------------------------------------------------------

Deno.test("isValidDomain: punycode IDN is accepted", () => {
  assert(isValidDomain("xn--80ak6aa92e.com"));
  assert(isValidDomain("xn--e1afmkfd.xn--p1ai"));
});

Deno.test("isValidDomain: rejects malformed input", () => {
  for (const d of ["", "not a domain!!", "foo..com", "-foo.com", "foo-.com", "foo"]) {
    assertEquals(isValidDomain(d), false, d);
  }
});

Deno.test("porkbun pricing catalog returns a real .com price", async () => {
  const map = await loadTldPricing();
  const com = map.get("com");
  assert(com?.registration && com.registration > 0, `expected .com price, got ${JSON.stringify(com)}`);
});
