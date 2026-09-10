import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mergePrices,
  parseGodaddyTldPage,
  parseNamecheapTldList,
  parseOvhTldPage,
  parseTldSpyMarkdown,
  stripTags,
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
