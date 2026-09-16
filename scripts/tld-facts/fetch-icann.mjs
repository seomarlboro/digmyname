#!/usr/bin/env node
/**
 * Refresh the ICANN half of src/data/tldFacts.json.
 *
 * Source: ICANN's registry-agreement record for a gTLD,
 * https://www.icann.org/en/registry-agreements/details/<tld> — the binding
 * contract under which the registry operates, and the one place that states,
 * for every gTLD alike, who the operator is, when the agreement was signed and
 * whether the extension carries a sponsoring community.
 *
 * Why it is here at all: most gTLD registries publish marketing, not rules.
 * Where a registry says nothing about who may register, "Base, Non-Sponsored"
 * in its ICANN agreement is a checkable fact, and one a reader can open. It is
 * never a substitute for a registry's own eligibility page — `fetch-iana.mjs`
 * and the hand-read `registry` block still come first.
 *
 * ccTLDs have no ICANN registry agreement; they are skipped, and that is not a
 * failure. Anything the parser cannot find is left out rather than guessed.
 *
 *   node scripts/tld-facts/fetch-icann.mjs            # every gTLD in the facts file
 *   node scripts/tld-facts/fetch-icann.mjs agency io  # just these
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTS_PATH = join(HERE, "../../src/data/tldFacts.json");
const UA = "DigMyName-facts/1.0 (+https://digmyname.com/tld; one request per extension)";
const PAUSE_MS = 700;

const icannUrl = (tld) => `https://www.icann.org/en/registry-agreements/details/${tld}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** Strip Angular's comment markers and tags, then squeeze whitespace. */
const clean = (s) =>
  s
    .replace(/<!---->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The text after a labelled <span>, up to the end of its container div. */
function labelled(html, label) {
  const at = html.indexOf(`>${label}</span>`);
  if (at === -1) return null;
  const rest = html.slice(at + label.length + 8);
  const end = rest.indexOf("</div>");
  const value = clean(end === -1 ? rest.slice(0, 300) : rest.slice(0, end));
  return value || null;
}

export function parseIcann(html) {
  const out = {};
  const operator = labelled(html, "Operator");
  if (operator) out.operator = operator;
  const date = labelled(html, "Agreement Date");
  if (date) out.agreementDate = date;
  const type = labelled(html, "Agreement Type");
  // "Base , Non-Sponsored" → "Base, Non-Sponsored"
  if (type) out.agreementType = type.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
  return out;
}

async function main() {
  const facts = JSON.parse(readFileSync(FACTS_PATH, "utf8"));
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const all = Object.entries(facts.tlds);
  // ccTLDs have no ICANN registry agreement — skip them by what IANA called them.
  const targets = (wanted.length ? all.filter(([t]) => wanted.includes(t)) : all).filter(
    ([, rec]) => !/country-code/i.test(rec.iana?.type ?? ""),
  );

  const checkedAt = today();
  let ok = 0;
  const failures = [];

  for (const [tld] of targets) {
    const url = icannUrl(tld);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseIcann(await res.text());
      if (!parsed.agreementType || !parsed.operator) throw new Error("operator or agreement type not found");
      facts.tlds[tld] = { ...facts.tlds[tld], icann: { ...parsed, sourceUrl: url, checkedAt } };
      ok++;
      process.stdout.write(`  ${tld.padEnd(10)} ${parsed.agreementType} · ${parsed.agreementDate ?? "no date"}\n`);
    } catch (err) {
      failures.push(`${tld}: ${err.message}`);
      process.stdout.write(`  ${tld.padEnd(10)} FAILED — ${err.message}\n`);
    }
    await sleep(PAUSE_MS);
  }

  facts.icannCollectedAt = checkedAt;
  writeFileSync(FACTS_PATH, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`\nicann: ${ok}/${targets.length} gTLD records written (checkedAt ${checkedAt})`);
  if (failures.length) {
    console.error(`failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("fetch-icann.mjs")) await main();
