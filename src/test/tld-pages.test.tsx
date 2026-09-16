import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DESCRIPTION_MAX,
  MAX_PRICE_AGE_DAYS,
  TITLE_MAX,
  shortRange,
  buildHub,
  buildTldPage,
  footerTlds,
  legacyTldHash,
  parseFastRdap,
  snapshotFromRows,
  type RawPriceRow,
  type SnapshotPrice,
  type SnapshotTld,
} from "@/lib/tldPages";
import { withFacts } from "@/lib/tldFacts";
import { TLD_SNAPSHOT, breadcrumbJsonLd, buildTldRoutes, renderTldStatic } from "@/seo/tldRoutes";
import { ROUTES } from "@/seo/routes";

vi.mock("@/integrations/supabase/client", () => {
  const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (res: (v: unknown) => void) => res({ data: [], error: null }) };
  return { supabase: { from: () => chain } };
});

const NOW = Date.parse("2026-09-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

const price = (registrar: string, reg: number, renew: number, transfer: number | null = null, verifiedAt = daysAgo(2)): SnapshotPrice => ({
  registrar,
  reg,
  renew,
  transfer,
  icannFee: 0.18,
  promo: null,
  whoisPrivacy: true,
  verifiedAt,
});

const tld = (name: string, prices: SnapshotPrice[], extra: Partial<SnapshotTld> = {}): SnapshotTld => ({
  tld: name,
  prices,
  quarantined: [],
  registryHost: null,
  inIanaBootstrap: true,
  ...extra,
});

// Real .io rows from the 13 Sep 2026 snapshot.
const io = tld(
  "io",
  [
    price("Cloudflare", 50, 50, 50),
    price("GoDaddy", 59.99, 89.99, 89.99),
    price("Namecheap", 34.98, 75.98, 65.98),
    price("OVHcloud", 35.82, 62.69, 50.69),
    price("Porkbun", 28.12, 51.8, 51.8),
    price("Spaceship", 31.98, 51.75, 51.75),
  ],
  { registryHost: "rdap.identitydigital.services", inIanaBootstrap: false },
);
const run = tld("run", [price("OVHcloud", 4.61, 25.79, 25.29), price("Porkbun", 4.12, 22.14, 22.14)]);
const build = tld("build", [price("Porkbun", 26.26, 26.26, 26.26)], { quarantined: [{ registrar: "Namecheap", lastVerifiedAt: "2026-02-16T10:00:00Z" }] });

const FORBIDDEN = /cheapest|\bbest\b/i;

describe("page titles and descriptions (numbers from the snapshot)", () => {
  it("six registrars: 'register $X, renew $Y · 6 registrars', date kept in the description", () => {
    const p = buildTldPage(io, NOW);
    expect(p.title).toBe(".io domain price: register $28.12, renew $50 · 6 registrars");
    expect(p.description).toContain("verified 13 Sep 2026");
    expect(p.description).toContain("3-year cost $131.72–$239.97");
    expect(p.description).toContain("2 of 6 renew at over 1.8× year one");
    expect(p.h1).toBe(".io domain prices at 6 registrars");
    expect(p.indexable).toBe(true);
  });

  it("two registrars are still a comparison and indexed; a title over 60 characters drops the registrar count, keeps 'domain price'", () => {
    const p = buildTldPage(run, NOW);
    // ".run domain price: register $4.12, renew $22.14 · 2 registrars" would be 62 characters.
    expect(p.title).toBe(".run domain price: register $4.12, renew $22.14");
    expect(p.description).toContain("at 2 registrars");
    expect(p.indexable).toBe(true);
  });

  it("one registrar: its price, no 'from', never 'comparison' wording, noindex", () => {
    const p = buildTldPage(build, NOW);
    expect(p.title).toBe(".build domain price: $26.26/yr at Porkbun");
    expect(p.description).toContain("verified 13 Sep 2026");
    expect(p.h1).toBe(".build domain price at Porkbun");
    expect(p.indexable).toBe(false);
    const text = [p.title, p.description, p.h1, p.lede, p.trapLine, renderTldStatic(withFacts(p))].join(" ");
    expect(text).not.toMatch(/\bfrom \$/);
    expect(text).not.toMatch(/compared|comparing|side by side/i);
    // "not a comparison" is the one allowed mention: it says what the page is not.
    expect(text.replace(/not a comparison/g, "")).not.toMatch(/comparison/i);
    expect([p.title, p.description, p.h1].join(" ")).not.toMatch(/comparison/i);
  });

  it("no generated route or page text says cheapest or best", () => {
    for (const r of buildTldRoutes(TLD_SNAPSHOT, NOW)) {
      expect(`${r.title} ${r.description} ${r.staticHtml}`, r.path).not.toMatch(FORBIDDEN);
    }
    for (const t of [io, run, build]) {
      const p = buildTldPage(t, NOW);
      expect([p.lede, p.trapLine, ...p.checkLines, ...p.hiddenLines].join(" ")).not.toMatch(FORBIDDEN);
    }
  });
});

describe("search-result lengths", () => {
  it(`every generated title is ≤ ${TITLE_MAX} characters with no brand tail, every description ≤ ${DESCRIPTION_MAX}`, () => {
    for (const r of buildTldRoutes(TLD_SNAPSHOT, NOW)) {
      expect(r.title.length, r.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(r.title, r.path).not.toContain("DigMyName");
      expect(r.description.length, r.description).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  it("still fits in the worst case: long TLD, dates across a year boundary, four-digit prices", () => {
    const now = Date.parse("2026-01-05T00:00:00Z");
    const names = ["Cloudflare", "GoDaddy", "Namecheap", "OVHcloud", "Porkbun", "Spaceship"];
    const many = tld(
      "community",
      names.map((n, i) => price(n, 1234.56 + i, 4321.09 + i, 4321.09, i % 2 ? "2025-12-30T00:00:00Z" : "2026-01-02T00:00:00Z")),
    );
    const one = tld("community", [price("Cloudflare", 1234.56, 4321.09, 4321.09, "2026-01-02T00:00:00Z")]);
    for (const p of [buildTldPage(many, now), buildTldPage(one, now)]) {
      expect(p.title.length, p.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(p.description.length, p.description).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(p.description).toMatch(/2026/);
    }
  });

  it("formats the verification range compactly", () => {
    expect(shortRange("2026-09-13T04:00:00Z", "2026-09-13T20:00:00Z")).toBe("13 Sep 2026");
    expect(shortRange("2026-09-09T04:00:00Z", "2026-09-13T04:00:00Z")).toBe("9–13 Sep 2026");
    expect(shortRange("2026-08-16T04:00:00Z", "2026-09-13T04:00:00Z")).toBe("16 Aug–13 Sep 2026");
    expect(shortRange("2025-12-30T04:00:00Z", "2026-01-02T04:00:00Z")).toBe("30 Dec 2025–2 Jan 2026");
  });
});

describe("prices shown", () => {
  it("orders by 3-year cost and flags renewals above 1.8× (strictly)", () => {
    const p = buildTldPage(io, NOW);
    expect(p.rows.map((r) => r.registrar)).toEqual(["Porkbun", "Spaceship", "Cloudflare", "OVHcloud", "Namecheap", "GoDaddy"]);
    expect(p.traps.map((r) => r.registrar)).toEqual(["Porkbun", "Namecheap"]);
    const exactly = buildTldPage(tld("x", [price("A", 10, 18)]), NOW);
    expect(exactly.traps).toEqual([]);
  });

  it("marks a price older than 14 days as stale and keeps its date", () => {
    const p = buildTldPage(tld("xyz", [price("A", 1, 1, null, daysAgo(15)), price("B", 2, 2, null, daysAgo(13))]), NOW);
    expect(p.rows.find((r) => r.registrar === "A")?.stale).toBe(true);
    expect(p.rows.find((r) => r.registrar === "B")?.stale).toBe(false);
    expect(renderTldStatic(withFacts(p))).toContain("(stale)");
    expect(p.verifiedLine).toMatch(/^Prices verified between \d+ \w+ 2026 and \d+ \w+ 2026\.$/);
  });

  it("never prints a quarantined or too-old price — only the registrar and its last verification date", () => {
    const old = price("GoDaddy", 777.77, 888.88, null, daysAgo(MAX_PRICE_AGE_DAYS + 1));
    const p = buildTldPage(tld("art", [price("Porkbun", 3.6, 21.11), old], { quarantined: [{ registrar: "Namecheap", lastVerifiedAt: "2026-02-16T10:00:00Z" }] }), NOW);
    expect(p.rows.map((r) => r.registrar)).toEqual(["Porkbun"]);
    expect(p.hiddenLines).toContain("Namecheap: price not re-verified since 16 Feb 2026, so it is not shown.");
    expect(p.hiddenLines.some((l) => l.startsWith("GoDaddy: price not re-verified since"))).toBe(true);
    const html = renderTldStatic(withFacts(p));
    expect(html).not.toContain("777.77");
    expect(html).not.toContain("888.88");
  });

  it("a TLD with no fresh price has no route", () => {
    const stale = tld("zz", [price("A", 1, 1, null, daysAgo(MAX_PRICE_AGE_DAYS + 5))]);
    const routes = buildTldRoutes({ tlds: [io, stale] }, NOW);
    expect(routes.map((r) => r.path)).toEqual(["/tld", "/tld/io"]);
  });
});

describe("how availability is checked (facts from the pipeline tables)", () => {
  it("registry RDAP + the browser lane for a CORS-verified registry", () => {
    const lines = buildTldPage(tld("com", [price("A", 1, 1)], { registryHost: "rdap.verisign.com" }), NOW).checkLines.join(" ");
    expect(lines).toContain("rdap.verisign.com");
    expect(lines).toContain("your browser asks that server directly");
  });

  it("no RDAP in IANA's bootstrap: Fastly decides, Unverified otherwise", () => {
    const lines = buildTldPage(tld("co", [price("A", 1, 1)], { inIanaBootstrap: false }), NOW).checkLines.join(" ");
    expect(lines).toContain("RDAP cannot confirm");
    expect(lines).toContain("Unverified");
    expect(lines).not.toContain("your browser");
  });

  it("an extension the search does not offer describes no check, and is never indexed", () => {
    // .gg and .so were dropped from SEARCHABLE_TLDS in August: no bootstrap RDAP
    // server, so a name there cannot be confirmed free. Their price pages used to
    // rank while promising "how availability of .gg is checked".
    for (const ext of ["gg", "so"]) {
      const page = buildTldPage(tld(ext, [price("A", 1, 1), price("B", 2, 2)], { inIanaBootstrap: false }), NOW);
      const lines = page.checkLines.join(" ");
      expect(lines).toContain(`DigMyName does not check availability for .${ext}`);
      expect(lines).not.toContain("your browser");
      expect(page.indexable).toBe(false);
    }
  });

  it("a searchable extension with two registrars is still indexed", () => {
    expect(buildTldPage(tld("io", [price("A", 1, 1), price("B", 2, 2)], { registryHost: "rdap.identitydigital.services" }), NOW).indexable).toBe(true);
  });

  it("snapshot RDAP hosts match the edge pipeline's FAST_RDAP table", async () => {
    const pipeline = (await import("../../supabase/functions/_shared/pipeline.ts?raw")).default as string;
    const fast = parseFastRdap(pipeline);
    expect(fast.get("com")).toBe("rdap.verisign.com");
    for (const t of TLD_SNAPSHOT.tlds) {
      expect(t.registryHost, t.tld).toBe(fast.get(t.tld) ?? null);
    }
  });
});

describe("snapshot", () => {
  const row = (over: Partial<RawPriceRow>): RawPriceRow => ({
    tld: "com",
    registrar: "Porkbun",
    reg_price: "10.00",
    renew_price: "11.00",
    transfer_price: null,
    icann_fee: null,
    promo_code: null,
    whois_privacy: true,
    supported: true,
    verified_at: null,
    updated_at: "2026-09-13T04:00:00Z",
    ...over,
  });
  const facts = () => ({ registryHost: null, inIanaBootstrap: null });

  it("coerces numerics, falls back to updated_at, keeps quarantined rows without their numbers, drops TLDs with no supported row", () => {
    const snap = snapshotFromRows(
      [
        row({ registrar: "Spaceship", reg_price: 9.5 }),
        row({}),
        row({ registrar: "Namecheap", supported: false, reg_price: 2499 }),
        row({ tld: "gone", supported: false }),
      ],
      facts,
    );
    expect(snap.tlds.map((t) => t.tld)).toEqual(["com"]);
    expect(snap.tlds[0].prices.map((p) => [p.registrar, p.reg])).toEqual([["Porkbun", 10], ["Spaceship", 9.5]]);
    expect(snap.tlds[0].prices[0].verifiedAt).toBe("2026-09-13T04:00:00Z");
    expect(snap.tlds[0].quarantined).toEqual([{ registrar: "Namecheap", lastVerifiedAt: "2026-09-13T04:00:00Z" }]);
    expect(JSON.stringify(snap)).not.toContain("2499");
  });

  it("is deterministic: the same rows in any order give the same file", () => {
    const rows = [row({ tld: "io" }), row({ registrar: "A" }), row({})];
    expect(JSON.stringify(snapshotFromRows(rows, facts))).toBe(JSON.stringify(snapshotFromRows([...rows].reverse(), facts)));
  });
});

describe("routes, hub and links", () => {
  const routes = buildTldRoutes(TLD_SNAPSHOT, NOW);

  it("every generated route has head data and crawler content; none collides with a static route", () => {
    const staticPaths = new Set(ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]));
    for (const r of routes) {
      expect(staticPaths.has(r.path), r.path).toBe(false);
      expect(r.title.length, r.path).toBeGreaterThan(10);
      expect(r.description.length, r.path).toBeGreaterThan(40);
      expect(r.staticHtml, r.path).toMatch(/<h1>/);
      expect(r.lastmod, r.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the hub is indexable; single-registrar pages are noindex", () => {
    expect(routes[0].path).toBe("/tld");
    expect(routes[0].noindex).toBeFalsy();
    for (const t of TLD_SNAPSHOT.tlds.filter((x) => x.prices.length === 1)) {
      expect(routes.find((r) => r.path === `/tld/${t.tld}`)?.noindex, t.tld).toBe(true);
    }
  });

  it("the hub lists every extension with a page", () => {
    const hub = buildHub(TLD_SNAPSHOT, NOW);
    expect(hub.entries.length).toBe(routes.length - 1);
    expect(hub.compared + hub.single).toBe(hub.entries.length);
  });

  it("footer links are the extensions tracked at the most registrars", () => {
    expect(footerTlds({ tlds: [io, run, build] })).toEqual(["io"]);
  });

  it("breadcrumb JSON-LD uses absolute URLs", () => {
    const ld = JSON.parse(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Domain prices", path: "/tld" }]));
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement.map((i: { item: string }) => i.item)).toEqual(["https://digmyname.com/", "https://digmyname.com/tld"]);
  });

  it("parses the old /pricing#tld-<tld> anchors", () => {
    expect(legacyTldHash("#tld-io")).toBe("io");
    expect(legacyTldHash("#tld-IO")).toBe("io");
    expect(legacyTldHash("#faq")).toBeNull();
    expect(legacyTldHash("")).toBeNull();
  });
});

describe("/pricing#tld-<tld>", () => {
  it("redirects to /tld/<tld> on load", async () => {
    const { default: Pricing } = await import("@/pages/Pricing");
    const Target = () => <p>tld page {useParams().tld}</p>;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HelmetProvider>
          <MemoryRouter initialEntries={["/pricing#tld-io"]}>
            <Routes>
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/tld/:tld" element={<Target />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("tld page io")).toBeInTheDocument();
  });
});
