import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mergePrices,
  parseGodaddyTldPage,
  parseNamecheapMarkdown,
  parseNamecheapTldList,
  parseOvhTldPage,
  parseTldListExtensions,
  parseTldSpyMarkdown,
  rotationSlice,
  stripTags,
  weekIndex,
} from "./parsers.ts";

const fixture = (name: string) => Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url));

Deno.test("stripTags drops tags, comments and entities", () => {
  assertEquals(stripTags('<a class="x">.<!-- -->com<sup>*</sup></a> &nbsp; <span>$</span>11.28'), ".com * $ 11.28");
});

Deno.test("Namecheap: first-year sale price, renewal, transfer and ICANN fee per tracked TLD", async () => {
  const html = await fixture("namecheap-full-tld-list.table.html");
  const rows = parseNamecheapTldList(html, new Set(["com", "io", "co", "dev", "me", "agency"]));
  assertEquals(rows.map((r) => r.tld).sort(), ["co", "com", "dev", "io", "me"]);
  const com = rows.find((r) => r.tld === "com")!;
  assertEquals(com, { registrar: "Namecheap", tld: "com", reg_price: 11.28, renew_price: 18.48, transfer_price: 11.48, icann_fee: 0.2 });
  const io = rows.find((r) => r.tld === "io")!;
  assertEquals([io.reg_price, io.renew_price, io.transfer_price, io.icann_fee], [34.98, 75.98, 65.98, null]);
});

Deno.test("Namecheap: untracked TLDs are ignored, garbage is skipped", () => {
  assertEquals(parseNamecheapTldList("<table><tr><td>no tld here</td></tr></table>", new Set(["com"])), []);
});

Deno.test("OVH: installation / renewal / transfer from the embedded tldPrices blob", async () => {
  const agency = parseOvhTldPage(await fixture("ovh-agency.props.txt"), "agency");
  assertEquals(agency, { registrar: "OVHcloud", tld: "agency", reg_price: 6.92, renew_price: 30.09, transfer_price: 29.49 });
  const io = parseOvhTldPage(await fixture("ovh-io.props.txt"), "io");
  assertEquals(io, { registrar: "OVHcloud", tld: "io", reg_price: 35.82, renew_price: 62.69, transfer_price: 50.69 });
});

Deno.test("OVH: a page for another TLD (or a redirect) yields nothing", async () => {
  assertStrictEquals(parseOvhTldPage(await fixture("ovh-io.props.txt"), "agency"), null);
  assertStrictEquals(parseOvhTldPage("<html>Just a moment</html>", "io"), null);
});

Deno.test("GoDaddy: promo first year when it stands alone, regular price for renewals", async () => {
  const agency = parseGodaddyTldPage(await fixture("godaddy-agency.fragment.html"), "agency");
  assertEquals(agency, { registrar: "GoDaddy", tld: "agency", reg_price: 3.99, renew_price: 47.99, transfer_price: null });
});

Deno.test("GoDaddy: a promo that needs a multi-year term is not a first-year price", async () => {
  const art = parseGodaddyTldPage(await fixture("godaddy-art.fragment.html"), "art");
  assertEquals(art, { registrar: "GoDaddy", tld: "art", reg_price: 39.99, renew_price: 39.99, transfer_price: null });
});

Deno.test("GoDaddy: the eyebrow must name the requested TLD (guards against redirects to other pages)", async () => {
  assertStrictEquals(parseGodaddyTldPage(await fixture("godaddy-art.fragment.html"), "agency"), null);
  assertStrictEquals(parseGodaddyTldPage("<html><h1 data-cy=\"eyebrow\">Not found</h1></html>", "art"), null);
});

Deno.test("Namecheap markdown (Firecrawl) uses the fixed column order", () => {
  const md = [
    "| TLD | Type | Country | Description | Register | Renew | Transfer | ICANN Fee | Features |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| .com\\* | gTLD | — | The King of domains | $11.28 Sale 25% off 1st year $14.98 | $18.48 | $11.48 Sale 23% OFF $14.98 | $0.20 | Domain Privacy |",
    "| .io | ccTLD | British Indian Ocean Territory | The tech-friendly TLD | $34.98 Sale 47% off 1st year $65.98 | $75.98 | $65.98 |  | Domain Privacy |",
    "| .zzz | gTLD | — | untracked | $1.00 | $2.00 | $3.00 | $0.20 | x |",
  ].join("\n");
  assertEquals(parseNamecheapMarkdown(md, new Set(["com", "io"])), [
    { registrar: "Namecheap", tld: "com", reg_price: 11.28, renew_price: 18.48, transfer_price: 11.48, icann_fee: 0.2 },
    { registrar: "Namecheap", tld: "io", reg_price: 34.98, renew_price: 75.98, transfer_price: 65.98, icann_fee: null },
  ]);
});

Deno.test("rotationSlice spreads a list over N runs and covers everything", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const parts = [0, 1, 2].map((i) => rotationSlice(items, i, 3));
  assertEquals(parts, [["a", "d", "g"], ["b", "e"], ["c", "f"]]);
  assertEquals(parts.flat().sort(), items);
  assertEquals(rotationSlice(items, 5, 3), rotationSlice(items, 2, 3));
  assertEquals(rotationSlice(items, 9, 1), items);
  assertEquals(weekIndex(new Date("2026-09-10T00:00:00Z")) - weekIndex(new Date("2026-09-03T00:00:00Z")), 1);
});

Deno.test("tldspy markdown rows keep working", () => {
  const md = "| TLD | Register | Renew | Transfer |\n| .com | $10.46 | $10.46 | $10.46 |\n| .zzz | $1 | $2 | $3 |";
  assertEquals(parseTldSpyMarkdown(md, "Cloudflare", new Set(["com"])), [
    { registrar: "Cloudflare", tld: "com", reg_price: 10.46, renew_price: 10.46, transfer_price: 10.46 },
  ]);
});

Deno.test("mergePrices: the registrar's own page overrides the aggregator, ICANN fee survives", () => {
  const merged = mergePrices(
    [{ registrar: "Namecheap", tld: "com", reg_price: 1, renew_price: 2, transfer_price: null, icann_fee: 0.2 }],
    [{ registrar: "Namecheap", tld: "com", reg_price: 11.28, renew_price: 18.48, transfer_price: 11.48 }],
    [{ registrar: "OVHcloud", tld: "com", reg_price: 9.2, renew_price: 14.69, transfer_price: 9.2 }],
  );
  assertEquals(merged.length, 2);
  assertEquals(merged.find((p) => p.registrar === "Namecheap"), {
    registrar: "Namecheap", tld: "com", reg_price: 11.28, renew_price: 18.48, transfer_price: 11.48, icann_fee: 0.2,
  });
});

/* ── tld-list.com API ──────────────────────────────────────────────────── */

// The fixture's `.com` block is the response example from https://tld-list.com/docs-api
// (extension/get); `.agency` adds the documented edge cases (multi-year promo,
// ICANN fee added to the final price, a registrar we don't track, a registrar
// without a renewal price).
const tldListFixture = async () => JSON.parse(await fixture("tld-list-extension-get.json")).data;

Deno.test("tld-list: one row per tracked registrar, promo price with its code, ICANN fee taken back out", async () => {
  const rows = parseTldListExtensions(await tldListFixture(), new Set(["com"]));
  assertEquals(rows.map((r) => r.registrar), ["GoDaddy", "Porkbun"]); // Epik is not a registrar we track
  assertEquals(rows[0], {
    registrar: "GoDaddy", tld: "com", reg_price: 2.99, renew_price: 19.99, transfer_price: 7.99,
    icann_fee: 0.18, promo_code: "GDD2dom", whois_privacy: true,
  });
  assertEquals(rows[1], {
    registrar: "Porkbun", tld: "com", reg_price: 8.73, renew_price: 9.73, transfer_price: 9.73,
    icann_fee: 0, promo_code: "AWESOMENESS", whois_privacy: true,
  });
});

Deno.test("tld-list: a promo that needs a multi-year term is not the first-year price", async () => {
  const rows = parseTldListExtensions(await tldListFixture(), new Set(["agency"]));
  const spaceship = rows.find((r) => r.registrar === "Spaceship")!;
  assertEquals([spaceship.reg_price, spaceship.renew_price, spaceship.transfer_price, spaceship.promo_code], [4.34, 25.04, 17.98, null]);
});

Deno.test("tld-list: registrar ids map to our names; no renewal price → no row; untracked extensions ignored", async () => {
  const rows = parseTldListExtensions(await tldListFixture(), new Set(["agency", "com"]));
  const agency = rows.filter((r) => r.tld === "agency");
  assertEquals(agency.map((r) => r.registrar).sort(), ["Namecheap", "OVHcloud", "Spaceship"]); // Cloudflare lacks renewal, Dynadot untracked
  assertEquals(agency.find((r) => r.registrar === "Namecheap"), {
    registrar: "Namecheap", tld: "agency", reg_price: 4.98, renew_price: 38.98, transfer_price: 37.98, icann_fee: 0.2, promo_code: null, whois_privacy: false,
  });
  assertEquals(agency.find((r) => r.registrar === "OVHcloud"), {
    registrar: "OVHcloud", tld: "agency", reg_price: 6.92, renew_price: 30.09, transfer_price: 29.49, icann_fee: 0, promo_code: null, whois_privacy: undefined,
  });
  assertEquals(rows.some((r) => r.tld === "zzz"), false);
});

Deno.test("tld-list: garbage payloads yield nothing", () => {
  assertEquals(parseTldListExtensions(null, new Set(["com"])), []);
  assertEquals(parseTldListExtensions([{ name: "com" }, { name: "com", registrars: [{ id: "godaddy" }] }], new Set(["com"])), []);
});

Deno.test("mergePrices keeps a known promo code and privacy flag when the newer source is silent", () => {
  const merged = mergePrices(
    [{ registrar: "GoDaddy", tld: "com", reg_price: 2.99, renew_price: 19.99, transfer_price: 7.99, icann_fee: 0.18, promo_code: "GDD2dom", whois_privacy: true }],
    [{ registrar: "GoDaddy", tld: "com", reg_price: 3.99, renew_price: 21.99, transfer_price: null }],
  );
  assertEquals(merged, [{ registrar: "GoDaddy", tld: "com", reg_price: 3.99, renew_price: 21.99, transfer_price: null, icann_fee: 0.18, promo_code: "GDD2dom", whois_privacy: true }]);
});
