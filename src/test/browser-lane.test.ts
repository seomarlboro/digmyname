import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyBrowserVerdict,
  BROWSER_RDAP,
  browserLaneEligible,
  checkInBrowser,
  mayShowAvailable,
  REGISTRY_ORIGINS,
  tldOf,
  warmRegistries,
} from "@/lib/browserLane";
import type { DomainResult } from "@/lib/domainData";

type Route = (url: string) => Response | Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NXDOMAIN = { Status: 3, Answer: [] };
const HAS_NS = { Status: 0, Answer: [{ name: "x", type: 2, data: "ns1.example." }] };

/** Route every fetch by URL substring; unmatched URLs fail like a network error. */
function routeFetch(routes: [string, Route][]) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = routes.find(([needle]) => url.includes(needle));
    if (!hit) throw new TypeError("Failed to fetch");
    return hit[1](url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const row = (domain: string, extra: Partial<DomainResult> = {}): DomainResult =>
  ({ domain, tld: { extension: tldOf(domain) }, available: false, checking: true, ...extra }) as DomainResult;

describe("browser lane: eligibility", () => {
  it("asks only registries with verified CORS, never brand-blocked labels", () => {
    expect(browserLaneEligible("acmeforge.com")).toBe(true);
    expect(browserLaneEligible("acmeforge.io")).toBe(true);
    expect(browserLaneEligible("acmeforge.xyz")).toBe(true);
    expect(browserLaneEligible("acmeforge.co")).toBe(false); // no public RDAP for .co
    expect(browserLaneEligible("acmeforge.me")).toBe(false);
    expect(browserLaneEligible("google.com")).toBe(false); // brand-protected: server's call
    expect(browserLaneEligible("acmeforge")).toBe(false);
  });

  it("a premium suspect (1–5 char label) may be shown taken but never available", () => {
    expect(mayShowAvailable("acme.com")).toBe(false);
    expect(mayShowAvailable("acmeforge.com")).toBe(true);
  });

  it("every registry base matches the edge pipeline's FAST_RDAP table (one source of truth)", async () => {
    // Raw import: the pipeline itself cannot run outside Deno, its source can be read.
    const pipeline = (await import("../../supabase/functions/_shared/pipeline.ts?raw")).default as string;
    const block = pipeline.slice(pipeline.indexOf("export const FAST_RDAP"), pipeline.indexOf("FAST_RDAP_EXCEPTIONS"));
    const fast = new Map<string, string>();
    for (const m of block.matchAll(/^\s*([a-z]+):\s*"(https:\/\/[^"]+)"/gm)) fast.set(m[1], m[2]);
    expect(fast.size).toBeGreaterThan(40);
    for (const [tld, base] of Object.entries(BROWSER_RDAP)) {
      expect(fast.get(tld), `${tld} is not in FAST_RDAP or points elsewhere`).toBe(base);
    }
    // Every preconnect origin is an origin of a base above (no stray hints).
    const bases = new Set(Object.values(BROWSER_RDAP).map((b) => new URL(b).origin));
    for (const o of REGISTRY_ORIGINS) expect(bases.has(o) || o === "https://cloudflare-dns.com", o).toBe(true);
  });
});

describe("browser lane: verdicts", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it("RDAP 404 + NXDOMAIN → available (registry signal)", async () => {
    routeFetch([
      ["rdap.verisign.com/com/v1/domain/acmeforge.com", () => new Response("", { status: 404 })],
      ["cloudflare-dns.com", () => json(NXDOMAIN)],
      ["dns.google", () => json(NXDOMAIN)],
    ]);
    expect(await checkInBrowser("acmeforge.com")).toEqual({ domain: "acmeforge.com", state: "available", checkedVia: "rdap" });
  });

  it("RDAP 200 → taken at once, even while DNS is still pending", async () => {
    routeFetch([
      ["rdap.verisign.com", () => json({ objectClassName: "domain" })],
      ["cloudflare-dns.com", () => new Promise<Response>(() => {})],
      ["dns.google", () => new Promise<Response>(() => {})],
    ]);
    expect(await checkInBrowser("acmeforge.com")).toEqual({ domain: "acmeforge.com", state: "taken", checkedVia: "rdap" });
  });

  it("DNS has records → taken via dns, even when the registry is slow", async () => {
    routeFetch([
      ["rdap.identitydigital.services", () => new Promise<Response>(() => {})],
      ["cloudflare-dns.com", () => json(HAS_NS)],
      ["dns.google", () => json(HAS_NS)],
    ]);
    expect(await checkInBrowser("acmeforge.io")).toEqual({ domain: "acmeforge.io", state: "taken", checkedVia: "dns" });
  });

  it("the DoH hedge answers when the primary resolver fails", async () => {
    routeFetch([
      ["rdap.verisign.com", () => new Response("", { status: 404 })],
      ["cloudflare-dns.com", () => new Response("", { status: 500 })],
      ["dns.google", () => json(NXDOMAIN)],
    ]);
    expect((await checkInBrowser("acmeforge.com")).state).toBe("available");
  });

  it("no decisive pair → unknown: RDAP error, DNS error, or a disagreement", async () => {
    routeFetch([["rdap.verisign.com", () => new Response("", { status: 500 })], ["cloudflare-dns.com", () => json(NXDOMAIN)], ["dns.google", () => json(NXDOMAIN)]]);
    expect((await checkInBrowser("acmeforge.com")).state).toBe("unknown");
    routeFetch([["rdap.verisign.com", () => new Response("", { status: 404 })], ["cloudflare-dns.com", () => new Response("", { status: 500 })], ["dns.google", () => new Response("", { status: 500 })]]);
    expect((await checkInBrowser("acmeforge.com")).state).toBe("unknown");
    routeFetch([["rdap.verisign.com", () => new Response("", { status: 404 })], ["cloudflare-dns.com", () => json({ Status: 0, Answer: [] })], ["dns.google", () => json({ Status: 0, Answer: [] })]]);
    expect((await checkInBrowser("acmeforge.com")).state).toBe("unknown");
  });

  it("a premium suspect is never called available by the browser, but taken still counts", async () => {
    routeFetch([["rdap.verisign.com", () => new Response("", { status: 404 })], ["cloudflare-dns.com", () => json(NXDOMAIN)], ["dns.google", () => json(NXDOMAIN)]]);
    expect((await checkInBrowser("acme.com")).state).toBe("unknown");
    routeFetch([["rdap.verisign.com", () => json({})], ["cloudflare-dns.com", () => json(NXDOMAIN)], ["dns.google", () => json(NXDOMAIN)]]);
    expect((await checkInBrowser("acme.com")).state).toBe("taken");
  });

  it("an unsupported TLD asks nothing", async () => {
    const calls = routeFetch([]);
    expect(await checkInBrowser("acmeforge.co")).toEqual({ domain: "acmeforge.co", state: "unknown", checkedVia: "none" });
    expect(calls).toEqual([]);
  });

  it("an aborted search aborts the registry queries", async () => {
    const ctl = new AbortController();
    routeFetch([["rdap.verisign.com", (u) => new Promise<Response>(() => { void u; })], ["cloudflare-dns.com", () => new Promise<Response>(() => {})], ["dns.google", () => new Promise<Response>(() => {})]]);
    const p = checkInBrowser("acmeforge.com", ctl.signal);
    ctl.abort();
    // The lane resolves to unknown instead of hanging once its signals are aborted.
    const timeout = new Promise<string>((r) => setTimeout(() => r("hung"), 3500));
    const outcome = await Promise.race([p.then((v) => v.state), timeout]);
    expect(outcome).toBe("unknown");
  });
});

describe("browser lane: merging into rows", () => {
  it("fills only a row still Checking, marks it provisional, ignores unknown", () => {
    const r = row("acmeforge.com");
    const next = applyBrowserVerdict(r, { domain: "acmeforge.com", state: "available", checkedVia: "rdap" });
    expect(next).not.toBe(r);
    expect(next).toMatchObject({ available: true, checking: false, uncertain: false, provisional: true });
    expect(applyBrowserVerdict(r, { domain: "acmeforge.com", state: "unknown", checkedVia: "none" })).toBe(r);
    const settled = row("acmeforge.com", { checking: false, available: true });
    expect(applyBrowserVerdict(settled, { domain: "acmeforge.com", state: "taken", checkedVia: "dns" })).toBe(settled);
  });

  it("warmRegistries adds one preconnect per registry origin, at most once per 8 s", () => {
    document.head.innerHTML = "";
    expect(warmRegistries(100_000)).toBe(true);
    const links = [...document.head.querySelectorAll('link[rel="preconnect"]')].map((l) => (l as HTMLLinkElement).href.replace(/\/$/, ""));
    expect(links).toEqual([...REGISTRY_ORIGINS]);
    expect(warmRegistries(104_000)).toBe(false);
    expect(warmRegistries(109_000)).toBe(true);
  });
});
