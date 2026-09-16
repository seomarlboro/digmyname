#!/usr/bin/env node
/**
 * Refresh the IANA half of src/data/tldFacts.json.
 *
 * Source: the IANA Root Zone Database delegation record for each extension,
 * https://www.iana.org/domains/root/db/<tld>.html — the authoritative record of
 * who runs a TLD, what kind of TLD it is, and when it was delegated.
 *
 * Only the `iana` block of each record is written. The `registry` block holds
 * facts read off the registry's own policy pages by a human (or an agent doing
 * the same reading) and is never touched here, because nothing on the IANA page
 * states who may register a name.
 *
 * Every value lands with the URL it came from and the date it was read, which is
 * what src/test/tld-facts.test.ts enforces. Anything the parser cannot find is
 * left out rather than guessed: a missing fact renders as nothing on the page.
 *
 *   node scripts/tld-facts/fetch-iana.mjs            # every TLD in the facts file
 *   node scripts/tld-facts/fetch-iana.mjs org io     # just these
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTS_PATH = join(HERE, "../../src/data/tldFacts.json");
const SNAPSHOT_PATH = join(HERE, "../../src/generated/tld-prices.json");
const UA = "DigMyName-facts/1.0 (+https://digmyname.com/tld; one request per extension)";
const PAUSE_MS = 700;

const ianaUrl = (tld) => `https://www.iana.org/domains/root/db/${tld}.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** Collapse the entity-encoded, <br/>-separated blocks IANA uses into plain lines. */
function lines(fragment) {
  return fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** The block between one <h2> and the next, or the end of <main>. */
function section(html, heading) {
  const start = html.search(new RegExp(`<h2>\\s*${heading}\\s*</h2>`, "i"));
  if (start === -1) return null;
  const rest = html.slice(start);
  const end = rest.slice(1).search(/<h2>|<\/main>/i);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

export function parseIana(html) {
  const out = {};

  const type = html.match(/<p>\s*\(([^)]*top-level domain)\)\s*<\/p>/i);
  if (type) out.type = type[1].trim().replace(/^Country-code/i, "Country-code");

  // "Sponsoring Organisation" for gTLDs, "ccTLD Manager" for country codes.
  const managerBlock = section(html, "Sponsoring Organisation") ?? section(html, "ccTLD Manager");
  if (managerBlock) {
    const bold = managerBlock.match(/<b>([^<]+)<\/b>/);
    if (bold) out.manager = bold[1].replace(/\s+/g, " ").trim();
    // IANA prints the postal address and ends the block with the country name.
    const body = lines(managerBlock.replace(/<h2>[\s\S]*?<\/h2>/i, ""));
    const country = body.at(-1);
    // IANA writes "United States of America (the)" — the marker says the name
    // needs a definite article, which is exactly what the prose needs.
    if (country && country !== out.manager) {
      out.managerCountry = /\(the\)$/.test(country) ? `the ${country.replace(/\s*\(the\)$/, "")}` : country;
    }
  }

  const regUrl = html.match(/URL for registration services:\s*<\/b>\s*<a[^>]*href="([^"]+)"/i)
    ?? html.match(/URL for registration services:[\s\S]{0,200}?href="(https?:\/\/[^"]+)"/i);
  if (regUrl) out.registrationServicesUrl = regUrl[1].trim();

  const delegated = html.match(/Registration date\s*(\d{4})-(\d{2})-(\d{2})/i);
  if (delegated) {
    out.delegatedYear = Number(delegated[1]);
    out.delegatedDate = `${delegated[1]}-${delegated[2]}-${delegated[3]}`;
  }

  const updated = html.match(/Record last updated\s*(\d{4}-\d{2}-\d{2})/i);
  if (updated) out.recordUpdated = updated[1];

  return out;
}

async function main() {
  const facts = JSON.parse(readFileSync(FACTS_PATH, "utf8"));
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const tlds = wanted.length ? wanted : snapshot.tlds.map((t) => t.tld);

  const checkedAt = today();
  let ok = 0;
  const failures = [];

  for (const tld of tlds) {
    const url = ianaUrl(tld);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseIana(await res.text());
      if (!parsed.type || !parsed.manager) throw new Error("type or manager not found in the page");
      facts.tlds[tld] = { ...(facts.tlds[tld] ?? {}), iana: { ...parsed, sourceUrl: url, checkedAt } };
      ok++;
      process.stdout.write(`  ${tld.padEnd(10)} ${parsed.manager}\n`);
    } catch (err) {
      failures.push(`${tld}: ${err.message}`);
      process.stdout.write(`  ${tld.padEnd(10)} FAILED — ${err.message}\n`);
    }
    await sleep(PAUSE_MS);
  }

  facts.ianaCollectedAt = checkedAt;
  facts.tlds = Object.fromEntries(Object.entries(facts.tlds).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(FACTS_PATH, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`\niana: ${ok}/${tlds.length} records written to src/data/tldFacts.json (checkedAt ${checkedAt})`);
  if (failures.length) {
    console.error(`failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("fetch-iana.mjs")) await main();
