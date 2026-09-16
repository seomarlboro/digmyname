#!/usr/bin/env node
/**
 * How many PAID third-signal calls does one search cost?
 *
 * The third signal (Fastly Domain Research) is the only metered dependency we
 * have — 10,000 requests/month free, then $0.001 each. Which names reach it is
 * decided by `willEscalateToThirdSignal()` on a pass-1 verdict, so the cost of a
 * search is not a guess: replay pass 1 (registry RDAP + DNS-over-HTTPS, both
 * free) for a label across every searchable TLD and apply the same rules.
 *
 * This calls NO paid API. It reads the live rule tables out of the repo
 * (`searchableTlds.ts`, `FAST_RDAP`, `isLikelyPremium`, `BLOCKED_SLDS`) rather
 * than copying them, so it cannot drift from the edge silently.
 *
 *   node scripts/bench/escalation-cost.mjs acme quixo brandforge
 *
 * Not counted here, because it does not depend on the label's TLD fan-out: the
 * site's headline verify (+1 paid call per settled search whose headline card is
 * available and longer than 5 characters — it bypasses both caches by design).
 * See docs/DIGMYNAME_ARCHITECTURE.md §14.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ---- rule tables, read from the source of truth ---------------------------
const TLDS = [
  ...read("src/lib/searchableTlds.ts")
    .match(/SEARCHABLE_TLDS: string\[\] = \[([\s\S]*?)\n\];/)[1]
    .matchAll(/^\s*"([a-z0-9-]+)",/gm),
].map((m) => m[1]);

const pipeline = read("supabase/functions/_shared/pipeline.ts");
const FAST_RDAP = Object.fromEntries(
  [...pipeline.match(/export const FAST_RDAP[\s\S]*?\n\};/)[0].matchAll(/^\s*([a-z0-9]+): "([^"]+)",/gm)].map((m) => [m[1], m[2]]),
);
const PREMIUM_TLDS = new Set(
  [...pipeline.match(/const PREMIUM_TLDS = new Set\(\[([\s\S]*?)\n\]\);/)[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]),
);
const BLOCKED_SLDS = new Set(
  [
    ...read("supabase/functions/_shared/availability-rules.ts")
      .match(/const BLOCKED_SLDS = new Set<string>\(\[([\s\S]*?)\n\]\);/)[1]
      .matchAll(/"([a-z0-9-]+)"/g),
  ].map((m) => m[1]),
);
const FAST_RDAP_EXCEPTIONS = new Set(["io", "us"]);
const AGGREGATOR_UNRELIABLE_TLDS = new Set(["co", "me"]);
const COMMON_WORDS_RE = /^(?:[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]?|[aeiou][bcdfghjklmnpqrstvwxz]{1,2})$/i;

// ---- the two pure rules the edge applies ----------------------------------
function isLikelyPremium(domain) {
  const [sld, ...rest] = domain.split(".");
  const tld = rest.join(".");
  if (!sld || !tld) return false;
  if (sld.length <= 3) return true;
  if (sld.length === 4 && PREMIUM_TLDS.has(tld)) return true;
  if (sld.length <= 5 && /^[a-z]+$/i.test(sld) && (PREMIUM_TLDS.has(tld) || ["com", "io", "ai", "co"].includes(tld))) return true;
  if (sld.length <= 5 && PREMIUM_TLDS.has(tld) && COMMON_WORDS_RE.test(sld)) return true;
  if (tld === "com" && sld.length <= 4 && COMMON_WORDS_RE.test(sld)) return true;
  return false;
}
const isLikelyBlocked = (domain) => BLOCKED_SLDS.has(domain.split(".")[0].toLowerCase());

// ---- pass 1, replayed -----------------------------------------------------
let bootstrap = null;
async function rdapBases(tld) {
  if (FAST_RDAP[tld]) return [FAST_RDAP[tld], true];
  if (!bootstrap) {
    const j = await (await fetch("https://data.iana.org/rdap/dns.json")).json();
    bootstrap = new Map();
    for (const [tlds, bases] of j.services) for (const t of tlds) bootstrap.set(t, bases);
  }
  const base = (bootstrap.get(tld) ?? [])[0];
  return base ? [base.replace(/\/$/, ""), true] : [null, false];
}

async function rdap(domain) {
  const tld = domain.split(".").pop();
  const [base, routable] = await rdapBases(tld);
  // No registry endpoint and no bootstrap entry → only the public aggregator is
  // left, and `trustsAggregator404` refuses its 404 on unroutable zones.
  if (!base) return "unknown";
  if (FAST_RDAP_EXCEPTIONS.has(tld) && !routable) return "unknown";
  try {
    const r = await fetch(`${base}/domain/${domain}`, { headers: { accept: "application/rdap+json" }, signal: AbortSignal.timeout(6000) });
    if (r.status === 200) return "taken";
    if (r.status === 404) return AGGREGATOR_UNRELIABLE_TLDS.has(tld) ? "unknown" : "available";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function dns(domain) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    });
    const j = await r.json();
    if (j.Status === 3) return "no_records";
    if (j.Status === 0) return j.Answer?.length ? "has_records" : "no_records";
    return "error";
  } catch {
    return "error";
  }
}

async function pass1(domain) {
  const tld = domain.split(".").pop();
  const [d, r] = await Promise.all([dns(domain), rdap(domain)]);
  if (r === "taken" || d === "has_records") return { available: false, uncertain: false };
  if (r === "available" && d === "no_records") return { available: true, uncertain: false };
  if (r === "unknown" && d === "no_records" && AGGREGATOR_UNRELIABLE_TLDS.has(tld)) return { available: false, uncertain: true };
  if (r === "available" && d === "error") return { available: false, uncertain: true };
  return { available: false, uncertain: true };
}

// ---- report ---------------------------------------------------------------
const labels = process.argv.slice(2);
if (labels.length === 0) {
  console.error("usage: node scripts/bench/escalation-cost.mjs <label> [label...]");
  process.exit(1);
}

for (const label of labels) {
  const rows = [];
  for (let i = 0; i < TLDS.length; i += 12) {
    rows.push(
      ...(await Promise.all(
        TLDS.slice(i, i + 12).map(async (tld) => {
          const domain = `${label}.${tld}`;
          const r = await pass1(domain);
          // willEscalateToThirdSignal(), plus the caller's brand-block rule.
          const escalate = r.uncertain || (r.available && (isLikelyPremium(domain) || isLikelyBlocked(domain)));
          return { domain, tld, ...r, escalate };
        }),
      )),
    );
  }
  const esc = rows.filter((r) => r.escalate);
  const bucket = { "co/me": 0, brand: 0, premium: 0, other: 0 };
  for (const r of esc) {
    if (AGGREGATOR_UNRELIABLE_TLDS.has(r.tld)) bucket["co/me"]++;
    else if (isLikelyBlocked(r.domain)) bucket.brand++;
    else if (isLikelyPremium(r.domain)) bucket.premium++;
    else bucket.other++;
  }
  const money = (n) => `$${(n * 0.001).toFixed(3)}`;
  console.log(
    `\n${label} (${label.length} chars) — ${esc.length}/${TLDS.length} paid calls, ${money(esc.length)} past the free tier` +
      `\n  reasons: ${Object.entries(bucket).map(([k, v]) => `${k} ${v}`).join(", ")}` +
      `\n  pass 1: available ${rows.filter((r) => r.available).length}, taken ${rows.filter((r) => !r.available && !r.uncertain).length}, uncertain ${rows.filter((r) => r.uncertain).length}` +
      `\n  escalated: ${esc.map((r) => r.domain).join(" ") || "—"}`,
  );
}
