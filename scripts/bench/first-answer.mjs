// First-answer benchmark: what a COLD visitor sees on the stopwatch.
//
// Every query is a new browser context (fresh connections, no cache): load the
// home page, pause like a reader would, type a name nobody has checked before,
// stop when the on-page stopwatch stops. Records the stopwatch value, which
// lane produced the first visible verdict (browser RDAP/DoH vs. the edge) and
// the headline card's state. Then a few raw probes from the same machine, for
// the pieces: registry RDAP, DoH, and the edge's check-domains.
//
// Run anywhere with Playwright: `node first-answer.mjs` (see the
// bench-first-answer workflow for the US run). Env:
//   BENCH_N      cold visitors (default 150)
//   BENCH_RAW_N  raw probes per host (default 60)
//   BENCH_URL    site under test (default https://digmyname.com)
//   BENCH_OUT    JSON output path (default bench-results.json)
//   BENCH_EDGE_URL  edge-only probe endpoint taking ?domain= (default: public API /check)
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const N = Number(process.env.BENCH_N || 150);
const RAW_N = Number(process.env.BENCH_RAW_N || 60);
const SITE = (process.env.BENCH_URL || "https://digmyname.com").replace(/\/$/, "");
const OUT = process.env.BENCH_OUT || "bench-results.json";
const READ_PAUSE_MS = 1500;
const STOPWATCH_TIMEOUT_MS = 8000;
// Half the visitors type a bare word (headline .com), the rest a name with a
// TLD, including the two the browser lane cannot answer (.co / .me).
const TYPED_TLDS = ["", "org", "", "io", "", "ai", "", "xyz", "", "app", "", "net", "", "dev", "", "co", "", "me", "", "tech"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const letters = "abcdefghijklmnopqrstuvwxyz";
const freshLabel = () => "qz" + Array.from({ length: 9 }, () => letters[Math.floor(Math.random() * 26)]).join("");
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const stats = (arr) => ({ n: arr.length, p50: pct(arr, 50), p90: pct(arr, 90), p95: pct(arr, 95), max: arr.length ? Math.max(...arr) : null });

async function where() {
  try {
    const t = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
    const g = (k) => (t.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1];
    return { colo: g("colo"), country: g("loc") };
  } catch {
    return { colo: "?", country: "?" };
  }
}

async function coldVisitor(browser, i) {
  const tld = TYPED_TLDS[i % TYPED_TLDS.length];
  const label = freshLabel();
  const typed = tld ? `${label}.${tld}` : label;
  const headline = tld ? typed : `${label}.com`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const rec = { i, typed, headline, tld: tld || "com", pill: null, state: "timeout", from: "none", headRdapMs: null, edgeMs: null, pageLoadMs: null };
  try {
    const t0 = Date.now();
    await page.goto(`${SITE}/?bench=${i}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector('input[aria-label="Search domain name"]', { state: "visible", timeout: 15000 });
    rec.pageLoadMs = Date.now() - t0;
    await sleep(READ_PAUSE_MS);
    await page.click('input[aria-label="Search domain name"]');
    await page.evaluate(() => performance.clearResourceTimings());
    await page.keyboard.type(typed, { delay: 60 });
    const stopped = await page
      .waitForFunction(() => document.querySelector('a[title^="How we measure"]')?.getAttribute("aria-live") === "polite", undefined, { timeout: STOPWATCH_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    await sleep(400);
    const r = await page.evaluate((h) => {
      const pill = document.querySelector('a[title^="How we measure"]');
      const ms = Number((pill?.textContent || "").replace(/[^\d]/g, ""));
      const h3 = [...document.querySelectorAll("h3")].find((x) => x.textContent === h);
      const card = h3?.closest(".card-hover");
      const txt = card?.textContent?.replace(/\s+/g, " ") ?? "";
      const state = !card ? "no-card" : card.querySelector(".animate-spin") ? "checking" : /Buy Now|Check price/.test(txt) ? "available" : /Whois|Taken|offer|For sale/i.test(txt) ? "taken" : /verify|Still checking|Retry/.test(txt) ? "unverified" : "other";
      const res = performance.getEntriesByType("resource");
      const head = res.filter((e) => e.name.includes(`/domain/${h}`) || e.name.includes(`dns-query?name=${h}&`));
      const headEnd = head.length ? Math.max(...head.map((e) => e.startTime + e.duration)) : null;
      const rdap = res.find((e) => e.name.includes(`/domain/${h}`));
      const edge = res.filter((e) => e.name.includes("/check-domains")).map((e) => e.startTime + e.duration);
      const edgeEnd = edge.length ? Math.min(...edge) : null;
      return { ms, state, headEnd, edgeEnd, headRdapMs: rdap ? Math.round(rdap.duration) : null, edgeMs: edge.length ? Math.round(Math.min(...res.filter((e) => e.name.includes("/check-domains")).map((e) => e.duration))) : null };
    }, headline);
    rec.state = r.state;
    rec.headRdapMs = r.headRdapMs;
    rec.edgeMs = r.edgeMs;
    if (stopped && Number.isFinite(r.ms) && r.ms > 0) {
      rec.pill = r.ms;
      rec.from = r.headEnd != null && (r.edgeEnd == null || r.headEnd < r.edgeEnd) ? "browser" : "edge";
    }
  } catch (e) {
    rec.error = String(e && e.message ? e.message : e).slice(0, 120);
  } finally {
    await context.close();
  }
  return rec;
}

async function rawProbe(label, urlFor, init, n) {
  const times = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      const r = await fetch(urlFor(freshLabel()), { ...init, signal: AbortSignal.timeout(8000) });
      await r.text();
      if (r.status !== 200 && r.status !== 404) errors++;
      else times.push(Math.round(performance.now() - t0));
    } catch {
      errors++;
    }
    await sleep(150);
  }
  return { label, errors, ...stats(times) };
}

const loc = await where();
console.log(`# First-answer benchmark — ${loc.country}/${loc.colo}, ${new Date().toISOString()}, cold visitors n=${N}`);
const browser = await chromium.launch();
const records = [];
for (let i = 0; i < N; i++) {
  const rec = await coldVisitor(browser, i);
  records.push(rec);
  if ((i + 1) % 10 === 0) console.error(`  ${i + 1}/${N} … last: ${rec.typed} → ${rec.pill ?? "timeout"} ms (${rec.from}, ${rec.state})`);
}
await browser.close();

const answered = records.filter((r) => r.pill != null);
const all = stats(answered.map((r) => r.pill));
const byLane = { browser: stats(answered.filter((r) => r.from === "browser").map((r) => r.pill)), edge: stats(answered.filter((r) => r.from === "edge").map((r) => r.pill)) };
const byTld = {};
for (const r of answered) (byTld[r.tld] ||= []).push(r.pill);
const timeouts = records.filter((r) => r.pill == null).length;
const under1s = answered.filter((r) => r.pill <= 1000).length;

console.log(`\n## Stopwatch (first visible verdict), cold visitor\n`);
console.log(`| group | n | p50 | p90 | p95 | max |\n|---|---|---|---|---|---|`);
const row = (name, s) => console.log(`| ${name} | ${s.n} | ${s.p50 ?? "—"} | ${s.p90 ?? "—"} | ${s.p95 ?? "—"} | ${s.max ?? "—"} |`);
row("all", all);
row("first verdict from the browser lane", byLane.browser);
row("first verdict from the edge", byLane.edge);
for (const [tld, arr] of Object.entries(byTld).sort()) row(`.${tld}`, stats(arr));
console.log(`\nAnswered ${answered.length}/${records.length} (timeouts > ${STOPWATCH_TIMEOUT_MS} ms: ${timeouts}); ≤ 1000 ms: ${under1s}/${answered.length} (${((100 * under1s) / Math.max(1, answered.length)).toFixed(1)} %).`);
console.log(`Page load to usable input: p50 ${pct(records.map((r) => r.pageLoadMs).filter(Boolean), 50)} ms, p95 ${pct(records.map((r) => r.pageLoadMs).filter(Boolean), 95)} ms.`);
const states = {};
for (const r of records) states[r.state] = (states[r.state] || 0) + 1;
console.log(`Headline card at read time: ${JSON.stringify(states)}`);

console.log(`\n## Raw probes from this machine (sequential, fresh names)\n`);
const raw = [];
raw.push(await rawProbe("RDAP Verisign .com", (l) => `https://rdap.verisign.com/com/v1/domain/${l}.com`, { headers: { accept: "application/rdap+json" } }, RAW_N));
raw.push(await rawProbe("RDAP PIR .org", (l) => `https://rdap.publicinterestregistry.org/rdap/domain/${l}.org`, { headers: { accept: "application/rdap+json" } }, Math.ceil(RAW_N / 2)));
raw.push(await rawProbe("RDAP Identity Digital .io", (l) => `https://rdap.identitydigital.services/rdap/domain/${l}.io`, { headers: { accept: "application/rdap+json" } }, Math.ceil(RAW_N / 2)));
raw.push(await rawProbe("DoH Cloudflare NS", (l) => `https://cloudflare-dns.com/dns-query?name=${l}.com&type=NS`, { headers: { accept: "application/dns-json" } }, Math.ceil(RAW_N / 2)));
// The edge on its own: the public API's /check for a fresh .com (a cache miss
// every time). BENCH_EDGE_URL may point at another endpoint that takes ?domain=.
const EDGE_URL = process.env.BENCH_EDGE_URL || "https://api.digmyname.com/functions/v1/public-api/check?domain=";
raw.push(await rawProbe("edge only: public API /check, fresh .com", (l) => `${EDGE_URL}${l}.com`, { headers: { accept: "application/json" } }, Math.ceil(RAW_N / 2)));
console.log(`| probe | n | p50 | p90 | p95 | max | errors |\n|---|---|---|---|---|---|---|`);
for (const s of raw) console.log(`| ${s.label} | ${s.n} | ${s.p50 ?? "—"} | ${s.p90 ?? "—"} | ${s.p95 ?? "—"} | ${s.max ?? "—"} | ${s.errors} |`);

writeFileSync(OUT, JSON.stringify({ location: loc, site: SITE, startedAt: new Date().toISOString(), n: N, summary: { all, byLane, byTld: Object.fromEntries(Object.entries(byTld).map(([k, v]) => [k, stats(v)])), timeouts, under1s }, raw, records }, null, 1));
console.error(`\nwrote ${OUT}`);
