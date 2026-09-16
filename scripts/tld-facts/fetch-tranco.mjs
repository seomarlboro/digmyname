#!/usr/bin/env node
/**
 * Refresh the usage half of src/data/tldFacts.json: how much each extension is
 * actually used, measured rather than asserted.
 *
 * Source: a dated Tranco list (https://tranco-list.eu) — a ranking of the top
 * million sites built from five crawlers' data over a 30-day window, published
 * with a permanent list id so the exact list we counted stays downloadable and
 * anyone can redo the arithmetic.
 *
 * Why this and not the registries' own numbers: a registry's "millions of names
 * registered" counts parked and dormant domains, and every registry words it to
 * flatter itself. Presence in a traffic ranking is the same question asked of
 * every extension in the same way — and the split between the top million and
 * the top ten thousand says something a total never does: .shop has 4,725 names
 * in the million and 5 in the top ten thousand.
 *
 * Examples are the highest-ranked names on the extension, minus adult and
 * piracy-looking labels (SKIP below) — the page says "include", never "the top
 * three", because the list is filtered.
 *
 *   node scripts/tld-facts/fetch-tranco.mjs             # newest available list
 *   node scripts/tld-facts/fetch-tranco.mjs --list=N2PYW --date=2026-09-15
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTS_PATH = join(HERE, "../../src/data/tldFacts.json");
const SNAPSHOT_PATH = join(HERE, "../../src/generated/tld-prices.json");
const UA = "DigMyName-facts/1.0 (+https://digmyname.com/tld)";

/** Labels we do not print as examples. The counts still include them — this is
 *  about what goes on the page, not about massaging the measurement. */
const SKIP = new RegExp(
  [
    // Adult, anywhere in the label. The lookbehind keeps Essex/Sussex/Middlesex.
    "(?<!es|us|id)sex",
    "porn|erotic|hentai|nude|escort|xhamster|boobs|tits|\\bnsfw\\b",
    "tranny|shemale|rule34|camsite|cam[0-9]|[0-9]{2}videos?|doppio|avtub|hotpic|fap|xpvid|pvid",
    "(^|[-.])(xxx|adult|18\\+?|fuck)",
    // Streaming/piracy brands seen at the top of these zones.
    "filmyzilla|movieswood|isaidub|tamilprint|tamildhool|redecanais|hdhub|9xmovie|lk21|dramacool",
    "manga18|myreadingmanga|bokep|pirate|torrent|streamtape|putlocker|123movie|doodstream",
    "vidoyu|videy|notube|sulasokvid|igram|xlecx|mintmanga|fast-dl|manga|comic|anime-?dl|savefrom",
    "moviesda|moviesflix|filmywap|hindilinks|movies4u|netfilm|litlife|doramy|xbanxia|yomovies",
    // Punycode renders as gibberish on the page; the count still includes it.
    "^xn--",
    // Gambling/betting brands.
    "togel|krikya|casino|\\bbet[0-9]|betting|\\bslot[0-9]",
  ].join("|"),
  "i",
);
const EXAMPLES = 4;
const TOP_10K = 10_000;
const TOP_100K = 100_000;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tranco rate-limits the lookup endpoint; a 429 means wait, not "no list". */
async function listForDate(date) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://tranco-list.eu/api/lists/date/${date}`, { headers: { "user-agent": UA } });
    if (res.status === 429) {
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.available && body.list_id ? body.list_id : null;
  }
  throw new Error(`Tranco kept rate-limiting the lookup for ${date}`);
}

async function newestList() {
  const explicit = arg("list");
  if (explicit) return { listId: explicit, listDate: arg("date") ?? today() };
  // Walk back from today: the day's list is published late and can be missing.
  for (let back = 0; back < 10; back++) {
    const listDate = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    const listId = await listForDate(listDate);
    if (listId) return { listId, listDate };
    await sleep(2_000);
  }
  throw new Error("no Tranco list available in the last 10 days");
}

/** rank,domain per line. Returns Map<tld, {inMillion, in100k, in10k, examples}>. */
export function tallyRanking(lines, wanted) {
  const want = new Set(wanted);
  const out = new Map(wanted.map((t) => [t, { inMillion: 0, in100k: 0, in10k: 0, examples: [] }]));
  for (const line of lines) {
    const comma = line.indexOf(",");
    if (comma < 1) continue;
    const rank = Number(line.slice(0, comma));
    const domain = line.slice(comma + 1).trim().toLowerCase();
    const tld = domain.slice(domain.lastIndexOf(".") + 1);
    if (!want.has(tld) || !Number.isFinite(rank)) continue;
    const row = out.get(tld);
    row.inMillion++;
    if (rank <= TOP_100K) row.in100k++;
    if (rank <= TOP_10K) row.in10k++;
    if (row.examples.length < EXAMPLES && !SKIP.test(domain)) row.examples.push({ domain, rank });
  }
  return out;
}

async function main() {
  const facts = JSON.parse(readFileSync(FACTS_PATH, "utf8"));
  const tlds = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")).tlds.map((t) => t.tld);
  const { listId, listDate } = await newestList();
  const download = `https://tranco-list.eu/list/${listId}/1000000`;

  process.stdout.write(`tranco list ${listId} (${listDate}) — downloading 1,000,000 rows…\n`);
  const res = await fetch(`https://tranco-list.eu/download/${listId}/1000000`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const lines = (await res.text()).split("\n");
  const total = lines.filter((l) => l.includes(",")).length;
  if (total < 900_000) throw new Error(`list looks truncated: ${total} rows`);

  const tally = tallyRanking(lines, tlds);
  const checkedAt = today();
  for (const [tld, row] of tally) {
    facts.tlds[tld] = {
      ...facts.tlds[tld],
      usage: { ...row, listId, listDate, rankedTotal: total, sourceUrl: download, checkedAt },
    };
    process.stdout.write(`  ${tld.padEnd(10)} ${String(row.inMillion).padStart(6)} in 1M · ${String(row.in10k).padStart(4)} in 10k\n`);
  }

  facts.trancoCollectedAt = checkedAt;
  writeFileSync(FACTS_PATH, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`\ntranco: ${tally.size} extensions counted against list ${listId} (${listDate}), ${total} ranked sites`);
}

if (process.argv[1] && process.argv[1].endsWith("fetch-tranco.mjs")) await main();
