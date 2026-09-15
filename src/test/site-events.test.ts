import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import migrationSql from "../../supabase/migrations/20260915120000_site_events.sql?raw";
import retentionSql from "../../supabase/migrations/20260916090000_retention_ctr_mcp_events.sql?raw";
import {
  buildSiteEventRow,
  flushSiteEvents,
  resetSiteEventsForTests,
  sourceOf,
  trackSiteEvent,
  SITE_EVENT_COLUMNS,
  type SiteEventName,
  type SiteEventProps,
} from "@/lib/siteEvents";
import { cardClickProps, shownOffers } from "@/lib/cardClickEvent";
import type { CheapestRegistrar } from "@/lib/cardFacts";
import type { DomainResult } from "@/lib/domainData";

const EVENTS: SiteEventName[] = [
  "search_started",
  "first_answer",
  "buy_click",
  "aftermarket_click",
  "whois_click",
  "visit_click",
  "favorite_add",
  "api_copy",
  "mcp_copy",
  "pricing_tld_view",
  "results_shown",
  "mcp_page_view",
  "mcp_click",
  "waitlist_signup",
];

/** Everything a careless caller might hand over. None of it may reach a row. */
const LEAKY = {
  domain: "acmeforge.com",
  query: "acmeforge",
  q: "acmeforge",
  url: "https://digmyname.com/?q=acmeforge.com",
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) acmeforge",
  referrer: "https://digmyname.com/?q=acmeforge.com",
  tld: "acmeforge.com",
  target: "acmeforge.com",
  marketplace: "acmeforge.com",
  registrar: "acmeforge.com",
  lane: "acmeforge",
  offer: "acmeforge",
  layout: "acmeforge",
  queryLength: "acmeforge",
  shownTlds: ["acmeforge.com"],
  shownRegistrars: ["acmeforge.com"],
  source: "https://acmeforge.com/",
} as unknown as SiteEventProps;

const FORBIDDEN_COLUMNS = ["domain", "name", "query", "q", "url", "ip", "ip_address", "user_agent", "referrer", "user_id", "email"];

const row = (domain: string, extra: Partial<DomainResult> = {}): DomainResult => ({
  domain,
  tld: { extension: domain.slice(domain.indexOf(".") + 1) },
  available: true,
  checking: false,
  ...extra,
});
const price = (registrar: string, regPrice: number): CheapestRegistrar => ({
  registrar,
  regPrice,
  renewPrice: regPrice,
  affiliateUrl: null,
  promoCode: null,
  whoisPrivacy: false,
});

describe("site events — what a row may contain", () => {
  beforeEach(() => resetSiteEventsForTests());

  it("never carries a domain name, the query, an IP, a user agent or a referrer, whatever the caller passes", () => {
    Object.defineProperty(document, "referrer", { configurable: true, get: () => "https://github.com/acmeforge/repo?q=acmeforge.com" });
    for (const event of EVENTS) {
      const r = buildSiteEventRow(event, LEAKY)!;
      const json = JSON.stringify(r);
      expect(json).not.toContain("acmeforge");
      expect(json).not.toContain("203.0.113.7");
      expect(json).not.toContain("Mozilla");
      expect(Object.keys(r).sort()).toEqual([...SITE_EVENT_COLUMNS].sort());
    }
    expect(buildSiteEventRow("mcp_page_view")!.source).toBe("github");
    Object.defineProperty(document, "referrer", { configurable: true, get: () => "" });
  });

  it("records the referrer only as a category from a fixed list, and only on mcp_page_view", () => {
    expect(sourceOf("")).toBe("direct");
    expect(sourceOf("https://glama.ai/mcp/servers/abc")).toBe("glama");
    expect(sourceOf("https://www.google.co.uk/search?q=acmeforge")).toBe("google");
    expect(sourceOf("https://registry.modelcontextprotocol.io/")).toBe("mcp_registry");
    expect(sourceOf("https://notgithub.com/")).toBe("other");
    expect(sourceOf("https://acmeforge.com/")).toBe("other");
    expect(sourceOf("not a url")).toBe("other");
    expect(buildSiteEventRow("mcp_click", { target: "github_hero" })).toMatchObject({ target: "github_hero", source: null });
    expect(buildSiteEventRow("mcp_click", { target: "https://acmeforge.com" })!.target).toBe("other");
  });

  it("keeps an impression list only when both lists are aligned and well-formed", () => {
    const ok = buildSiteEventRow("results_shown", { shownTlds: ["com", "io"], shownRegistrars: ["Porkbun", "Spaceship"] })!;
    expect(ok).toMatchObject({ shown_tlds: ["com", "io"], shown_registrars: ["Porkbun", "Spaceship"] });
    expect(buildSiteEventRow("results_shown", { shownTlds: [], shownRegistrars: [] })!.shown_tlds).toEqual([]);
    for (const bad of [
      { shownTlds: ["com"], shownRegistrars: [] },
      { shownTlds: ["acmeforge.com"], shownRegistrars: ["Porkbun"] },
      { shownTlds: ["com"], shownRegistrars: ["Acme Registrar"] },
    ]) {
      const r = buildSiteEventRow("results_shown", bad)!;
      expect(r.shown_tlds).toBeNull();
      expect(r.shown_registrars).toBeNull();
    }
    // Only results_shown may carry the lists.
    expect(buildSiteEventRow("buy_click", { shownTlds: ["com"], shownRegistrars: ["Porkbun"] })!.shown_tlds).toBeNull();
  });

  it("keeps only the fields that belong to the event", () => {
    const r = buildSiteEventRow("buy_click", { registrar: "Porkbun", tld: "com", position: 2, cheapest: true, offer: "available", ms: 300, queryLength: 9 })!;
    expect(r).toMatchObject({ event: "buy_click", registrar: "Porkbun", tld: "com", position: 2, cheapest: true, offer: "available" });
    expect(r.ms).toBeNull();
    expect(r.query_length).toBeNull();
    const s = buildSiteEventRow("search_started", { queryLength: 13, tldTyped: true, tldCount: 53, registrar: "Porkbun" })!;
    expect(s).toMatchObject({ query_length: 13, tld_typed: true, tld_count: 53, registrar: null });
  });

  it("maps copy targets and marketplaces to fixed lists", () => {
    expect(buildSiteEventRow("api_copy", { target: "cURL" })!.target).toBe("curl");
    expect(buildSiteEventRow("mcp_copy", { target: "claude_desktop_config.json" })!.target).toBe("claude_desktop_config_json");
    expect(buildSiteEventRow("mcp_copy", { target: "something new" })!.target).toBe("other");
    expect(buildSiteEventRow("aftermarket_click", { marketplace: "Dan.com" })!.marketplace).toBe("dan");
  });

  it("the migration grants INSERT on exactly these columns, and no column can hold a name", () => {
    const sqls = [migrationSql, retentionSql];
    const granted = sqls.flatMap((sql) =>
      [...sql.matchAll(/GRANT INSERT \(([\s\S]*?)\) ON public\.site_events TO anon, authenticated;/g)].flatMap((m) =>
        m[1].split(",").map((c) => c.trim()),
      ),
    );
    expect(granted.sort()).toEqual([...SITE_EVENT_COLUMNS].sort());

    const table = migrationSql.match(/CREATE TABLE IF NOT EXISTS public\.site_events \(([\s\S]*?)\n\);/)![1];
    const columns = [
      ...[...table.matchAll(/^ {2}([a-z_]+) [A-Z]/gm)].map((m) => m[1]),
      ...[...retentionSql.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]),
    ];
    expect(columns).toContain("session_id");
    expect(columns).toContain("shown_tlds");
    for (const bad of FORBIDDEN_COLUMNS) expect(columns).not.toContain(bad);
    for (const sql of sqls) {
      expect(sql).not.toMatch(/GRANT (SELECT|ALL)[^;]*TO (anon|authenticated)/);
      expect(sql).not.toMatch(/FOR SELECT/);
    }
  });
});

describe("site events — sending", () => {
  const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 201 }));

  beforeEach(() => {
    resetSiteEventsForTests();
    vi.useFakeTimers();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "eyJtest");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    resetSiteEventsForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("queues without touching the network, then sends one keepalive batch with no referrer and no cookie", () => {
    trackSiteEvent("search_started", { queryLength: 9, tldTyped: false, tldCount: 53 });
    trackSiteEvent("first_answer", { ms: 312, lane: "browser" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1999);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://example.supabase.co/rest/v1/site_events");
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit", referrerPolicy: "no-referrer" });
    expect(init.headers.apikey).toBe("eyJtest");
    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(2);
    expect(body[0].session_id).toBe(body[1].session_id);
    expect(body[0].session_id).toBe(window.sessionStorage.getItem("dmn_sid"));
    expect(body[1]).toMatchObject({ event: "first_answer", ms: 312, lane: "browser", env: "dev" });
  });

  it("flushes at once when the tab is hidden (a buy link opening a new tab)", () => {
    trackSiteEvent("buy_click", { registrar: "Porkbun", tld: "com", position: 1, offer: "available" });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("does not throw when the network rejects, fetch throws, fetch is missing or storage is blocked", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(() => trackSiteEvent("whois_click", { tld: "com", position: 1 })).not.toThrow();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    await Promise.resolve();

    fetchMock.mockImplementationOnce(() => {
      throw new Error("sync failure");
    });
    trackSiteEvent("visit_click", { tld: "com", position: 1 });
    expect(() => flushSiteEvents()).not.toThrow();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    resetSiteEventsForTests();
    expect(buildSiteEventRow("favorite_add", { tld: "io" })!.session_id).toMatch(/^[0-9a-f-]{36}$/);

    vi.stubGlobal("fetch", undefined);
    expect(() => trackSiteEvent("pricing_tld_view", { tld: "io" })).not.toThrow();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });

  it("sends nothing when the Supabase env is not configured", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    trackSiteEvent("api_copy", { target: "cURL" });
    vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cardClickProps", () => {
  const prices = new Map([
    ["com", price("Spaceship", 9.08)],
    ["xyz", price("Porkbun", 1.98)],
  ]);
  const cheapestFor = (r: DomainResult) => prices.get(r.tld.extension);

  it("describes a buy click by registrar, TLD, position, cheapest and offer — never the name", () => {
    const section = [row("acmeforge.com"), row("acmeforge.xyz"), row("acmeforge.io")];
    const props = cardClickProps("buy", section[1], section, cheapestFor, "cards");
    expect(props).toEqual({ tld: "xyz", position: 2, layout: "cards", registrar: "Porkbun", offer: "available", cheapest: true });
    expect(cardClickProps("buy", section[0], section, cheapestFor, "compact")).toMatchObject({ registrar: "Spaceship", cheapest: false, position: 1 });
    // No price known: the button reads "Check price" and goes to Spaceship; "cheapest" is not claimed.
    const unpriced = cardClickProps("buy", section[2], section, cheapestFor, "cards");
    expect(unpriced).toMatchObject({ registrar: "Spaceship", offer: "check_price" });
    expect(unpriced.cheapest).toBeUndefined();
    expect(JSON.stringify(buildSiteEventRow("buy_click", props))).not.toContain("acmeforge");
  });

  it("impressions list every Available card with its Buy destination, in order, without names", () => {
    const section = [row("acmeforge.com"), row("acmeforge.xyz"), row("acmeforge.io")];
    const props = shownOffers(section, cheapestFor);
    expect(props).toEqual({ shownTlds: ["com", "xyz", "io"], shownRegistrars: ["Spaceship", "Porkbun", "Spaceship"] });
    expect(JSON.stringify(buildSiteEventRow("results_shown", props))).not.toContain("acmeforge");
  });

  it("a confirmed premium is Porkbun's premium offer", () => {
    const premium = row("reputation.com", { premium: true, gdPrice: 174 });
    expect(cardClickProps("buy", premium, [premium], cheapestFor, "cards")).toMatchObject({ registrar: "Porkbun", offer: "premium", cheapest: true });
  });

  it("a marketplace click carries the marketplace, not the listing URL", () => {
    const taken = row("acmeforge.com", { available: false, forSale: true, forSaleVia: "Sedo", listingUrl: "https://sedo.com/search/?keyword=acmeforge.com" });
    const props = cardClickProps("aftermarket", taken, [taken], cheapestFor, "cards");
    expect(props).toEqual({ tld: "com", position: 1, layout: "cards", marketplace: "Sedo" });
    expect(buildSiteEventRow("aftermarket_click", props)!.marketplace).toBe("sedo");
  });
});
