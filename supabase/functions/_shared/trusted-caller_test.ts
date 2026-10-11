// Tests for caller attribution (docs/DIGMYNAME_ARCHITECTURE.md §15).
// No network, no database. Keys here are test values; the real ones exist only
// as digests in `trusted-caller.ts`.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EDGE_CLIENT_IP_HEADER,
  EDGE_KEY_HEADER,
  EDGE_KEY_SHA256,
  INTERNAL_KEY_HEADER,
  INTERNAL_KEY_SHA256,
  ipv6Groups,
  isIpLiteral,
  resolveCaller,
  sameDigest,
  sha256Hex,
  trustedDigests,
} from "./trusted-caller.ts";
import { callerId, INTERNAL_CALLER, quotaSubject, recordInternal, spendQuota } from "./api-quota.ts";

const EDGE_KEY = "test-edge-key";
const INTERNAL_KEY = "test-internal-key";
const digests = { edge: await sha256Hex(EDGE_KEY), internal: await sha256Hex(INTERNAL_KEY) };

/** What the platform reports for a Worker subrequest: the Worker's own egress. */
const WORKER_EGRESS = "2a06:98c0:3600::103";

function request(headers: Record<string, string>): Request {
  return new Request("https://origin.example/functions/v1/public-api/check?domain=example.com", { headers });
}

// ---------------------------------------------------------------------------
// The regression: every visitor behind the edge shared one bucket
// ---------------------------------------------------------------------------

Deno.test("two visitors behind the edge are charged to their own addresses, not the Worker's", async () => {
  const a = await resolveCaller(
    request({ "x-forwarded-for": WORKER_EGRESS, [EDGE_KEY_HEADER]: EDGE_KEY, [EDGE_CLIENT_IP_HEADER]: "203.0.113.9" }),
    "anon",
    digests,
  );
  const b = await resolveCaller(
    request({ "x-forwarded-for": WORKER_EGRESS, [EDGE_KEY_HEADER]: EDGE_KEY, [EDGE_CLIENT_IP_HEADER]: "198.51.100.4" }),
    "anon",
    digests,
  );
  assertEquals(a, { ip: "203.0.113.9", via: "edge", internal: false });
  assertEquals(b.ip, "198.51.100.4");
  assertNotEquals(
    await callerId(quotaSubject(a.ip), "2026-10-11", "salt"),
    await callerId(quotaSubject(b.ip), "2026-10-11", "salt"),
  );
});

Deno.test("an edge request without the key falls back to what the platform reports", async () => {
  const c = await resolveCaller(request({ "x-forwarded-for": WORKER_EGRESS }), "anon", digests);
  assertEquals(c, { ip: WORKER_EGRESS, via: "direct", internal: false });
});

// ---------------------------------------------------------------------------
// A caller must not be able to choose its own bucket
// ---------------------------------------------------------------------------

Deno.test("a claimed address without the key is ignored", async () => {
  const c = await resolveCaller(
    request({ "x-forwarded-for": "192.0.2.50", [EDGE_CLIENT_IP_HEADER]: "203.0.113.9" }),
    "anon",
    digests,
  );
  assertEquals(c, { ip: "192.0.2.50", via: "direct", internal: false });
});

Deno.test("a claimed address with a wrong key is ignored", async () => {
  for (const key of ["nope", EDGE_KEY + "x", digests.edge, "x".repeat(5000)]) {
    const c = await resolveCaller(
      request({ "x-forwarded-for": "192.0.2.50", [EDGE_KEY_HEADER]: key, [EDGE_CLIENT_IP_HEADER]: "203.0.113.9" }),
      "anon",
      digests,
    );
    assertEquals(c.ip, "192.0.2.50", `key ${key.slice(0, 12)}… must not be trusted`);
    assertEquals(c.via, "direct");
  }
});

Deno.test("the right key with something that is not an address is ignored", async () => {
  for (const claimed of ["", "banana", "203.0.113.999", "1.2.3", "203.0.113.9, 198.51.100.4", "gggg::1", ":::"]) {
    const c = await resolveCaller(
      request({ "x-forwarded-for": "192.0.2.50", [EDGE_KEY_HEADER]: EDGE_KEY, [EDGE_CLIENT_IP_HEADER]: claimed }),
      "anon",
      digests,
    );
    assertEquals(c.ip, "192.0.2.50", `"${claimed}" must not be charged to`);
  }
});

Deno.test("no headers at all: the fallback, as before", async () => {
  assertEquals(await resolveCaller(request({}), "anon", digests), { ip: "anon", via: "direct", internal: false });
});

// ---------------------------------------------------------------------------
// Our own scheduled traffic
// ---------------------------------------------------------------------------

Deno.test("the internal key marks our own traffic, through the edge or direct", async () => {
  const viaEdge = await resolveCaller(
    request({
      "x-forwarded-for": WORKER_EGRESS,
      [EDGE_KEY_HEADER]: EDGE_KEY,
      [EDGE_CLIENT_IP_HEADER]: "192.0.2.77",
      [INTERNAL_KEY_HEADER]: INTERNAL_KEY,
    }),
    "anon",
    digests,
  );
  assertEquals(viaEdge, { ip: "192.0.2.77", via: "edge", internal: true });

  const direct = await resolveCaller(request({ "x-forwarded-for": "192.0.2.77", [INTERNAL_KEY_HEADER]: INTERNAL_KEY }), "anon", digests);
  assertEquals(direct.internal, true);
});

Deno.test("a wrong internal key is an ordinary caller, and the edge key is not the internal key", async () => {
  for (const key of ["nope", EDGE_KEY, digests.internal]) {
    const c = await resolveCaller(request({ "x-forwarded-for": "192.0.2.77", [INTERNAL_KEY_HEADER]: key }), "anon", digests);
    assertEquals(c.internal, false);
  }
});

Deno.test("internal traffic is counted in its own row and never asks the cap", async () => {
  const calls: Array<Record<string, unknown>> = [];
  // deno-lint-ignore no-explicit-any
  const client = { rpc: (_fn: string, args: Record<string, unknown>) => { calls.push(args); return Promise.resolve({ data: null, error: null }); } } as any;
  await recordInternal(client, 25);
  assertEquals(calls, [{ p_caller: INTERNAL_CALLER, n_domains: 25, n_requests: 1, n_blocked: 0 }]);
  // …and a failing counter is not an outage of the prewarm.
  // deno-lint-ignore no-explicit-any
  await recordInternal({ rpc: () => { throw new Error("down"); } } as any, 1);
});

// ---------------------------------------------------------------------------
// Keys are held as digests
// ---------------------------------------------------------------------------

Deno.test("the shipped digests are SHA-256 hex and differ from each other", () => {
  for (const d of [EDGE_KEY_SHA256, INTERNAL_KEY_SHA256]) assert(/^[0-9a-f]{64}$/.test(d));
  assertNotEquals(EDGE_KEY_SHA256, INTERNAL_KEY_SHA256);
});

Deno.test("the environment can rotate a digest; a malformed override is ignored", () => {
  const good = "a".repeat(64);
  assertEquals(trustedDigests((n) => (n === "EDGE_KEY_SHA256" ? good.toUpperCase() : undefined)), {
    edge: good,
    internal: INTERNAL_KEY_SHA256,
  });
  assertEquals(trustedDigests(() => "not-a-digest"), { edge: EDGE_KEY_SHA256, internal: INTERNAL_KEY_SHA256 });
  assertEquals(trustedDigests(() => ""), { edge: EDGE_KEY_SHA256, internal: INTERNAL_KEY_SHA256 });
});

Deno.test("sha256Hex matches a known vector; sameDigest is exact", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert(sameDigest("abc", "abc"));
  assert(!sameDigest("abc", "abd"));
  assert(!sameDigest("abc", "abcd"));
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

Deno.test("ipv6Groups reads the spellings a proxy header can carry", () => {
  assertEquals(ipv6Groups("2a06:98c0:3600::103"), [0x2a06, 0x98c0, 0x3600, 0, 0, 0, 0, 0x103]);
  assertEquals(ipv6Groups("2001:DB8:0:0:0:0:0:1"), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  assertEquals(ipv6Groups("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  assertEquals(ipv6Groups("::"), [0, 0, 0, 0, 0, 0, 0, 0]);
  assertEquals(ipv6Groups("[2001:db8::1]"), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  assertEquals(ipv6Groups("fe80::1%eth0"), [0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  assertEquals(ipv6Groups("::ffff:203.0.113.9"), [0, 0, 0, 0, 0, 0xffff, 0xcb00, 0x7109]);
  for (const bad of ["203.0.113.9", "banana", "", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1::2::3", "12345::1", "::ffff:1.2.3.999", "g::1"]) {
    assertEquals(ipv6Groups(bad), null, `"${bad}" is not an IPv6 literal`);
  }
});

Deno.test("isIpLiteral accepts addresses and nothing else", () => {
  for (const ok of ["203.0.113.9", "0.0.0.0", "255.255.255.255", "2001:db8::1", "::ffff:203.0.113.9"]) assert(isIpLiteral(ok), ok);
  for (const bad of ["", "anon", "unknown", "256.1.1.1", "1.2.3.4.5", "1.2.3.4 ; drop", "http://203.0.113.9", "203.0.113.9,198.51.100.4"]) {
    assert(!isIpLiteral(bad), bad);
  }
});

Deno.test("an IPv6 caller is counted by its /64, an IPv4 caller by its address", async () => {
  assertEquals(quotaSubject("2001:db8:aa:bb:1:2:3:4"), "2001:db8:aa:bb::/64");
  assertEquals(quotaSubject("2001:db8:aa:bb::ffff"), "2001:db8:aa:bb::/64");
  assertNotEquals(quotaSubject("2001:db8:aa:bb::1"), quotaSubject("2001:db8:aa:bc::1"));
  assertEquals(quotaSubject("203.0.113.9"), "203.0.113.9");
  assertEquals(quotaSubject("::ffff:203.0.113.9"), "203.0.113.9");
  assertEquals(quotaSubject("anon"), "anon");

  // Stepping through addresses inside one /64 spends one allowance, not many.
  const seen: string[] = [];
  // deno-lint-ignore no-explicit-any
  const client = { rpc: (_fn: string, args: { p_caller: string }) => { seen.push(args.p_caller); return Promise.resolve({ data: [{ domains: 1, requests: 1 }], error: null }); } } as any;
  const now = new Date("2026-10-11T12:00:00Z");
  await spendQuota(client, "2001:db8:aa:bb::1", 1, 5000, now);
  await spendQuota(client, "2001:db8:aa:bb:ffff:ffff:ffff:ffff", 1, 5000, now);
  await spendQuota(client, "2001:db8:aa:bc::1", 1, 5000, now);
  assertEquals(seen[0], seen[1]);
  assertNotEquals(seen[0], seen[2]);
});
