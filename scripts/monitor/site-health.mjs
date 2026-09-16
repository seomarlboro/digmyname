// Health monitor (docs/DIGMYNAME_ARCHITECTURE.md §13): catches breakage before
// visitors do, especially a false "available" on a name that is actually taken.
// Read-only, no auth needed for the HTTP checks; the two DB checks (price
// freshness, nightly-cleanup heartbeats) are skipped with a warning if the
// optional Supabase anon credentials are not configured (see README below).
//
// Run: node scripts/monitor/site-health.mjs
// Env: SITE_URL (default https://digmyname.com)
//      EDGE_API_URL (default https://api.digmyname.com/functions/v1/public-api)
//      VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (optional, anon key —
//        same two values the frontend and scripts/generate-tld-prices.ts use;
//        only used for anonymous, RLS-scoped SELECTs, never a service key)
//      RESULT_OUT (optional path to write the JSON result to)
import { writeFileSync } from "node:fs";

const SITE_URL = (process.env.SITE_URL || "https://digmyname.com").replace(/\/$/, "");
const EDGE_API_URL = (process.env.EDGE_API_URL || "https://api.digmyname.com/functions/v1/public-api").replace(/\/$/, "");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const RESULT_OUT = process.env.RESULT_OUT || "";

// Mirrors src/lib/pricing.ts STALE_AFTER_DAYS — the threshold at which the site
// itself marks a price row "stale". Keep these two in sync; a test doesn't pin
// this one because it lives in a different repo-internal script, not the app bundle.
const STALE_AFTER_DAYS = 14;

// pg_cron runs both nightly cleanups once every 24h (03:17 / 03:27 UTC). This
// check runs every 15-30 min, so a job missing its heartbeat by more than a day
// plus a generous margin is a real miss, not scheduler jitter.
const HEARTBEAT_MAX_AGE_HOURS = 27;

const HTTP_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Reference domains. Picked so NONE of them can trigger the paid Fastly third
// signal (supabase/functions/_shared/pipeline.ts, willEscalateToThirdSignal):
// escalation only fires for a result that is `uncertain`, or `available` AND
// (isLikelyPremium: SLD <=5 chars on most TLDs, <=3 on any TLD) OR
// (isLikelyBlocked: a curated brand SLD list).
//
//  - "Known taken" names never escalate at all: escalation requires
//    available === true, and a genuinely taken name never is. example.com/
//    org/net are IANA-reserved (RFC 2606), permanently registered, not a
//    brand SLD, and already used by this repo's own edge-cache-prewarm cron —
//    zero controversy, zero risk of ever becoming free.
//  - "Known free" names are generated fresh each run: an 11-char SLD
//    ("qz" + 9 random letters, same shape as scripts/bench/first-answer.mjs's
//    freshLabel()) is always >= 6 characters, which is long enough that every
//    isLikelyPremium() branch is false regardless of TLD, and random letters
//    never collide with the curated brand list. .co/.me are deliberately
//    excluded — those two ALWAYS escalate by design (§4 of the architecture
//    doc, no public RDAP), so including them here would just be a paid,
//    noisy way to re-confirm a known, accepted constraint.
// ---------------------------------------------------------------------------
const KNOWN_TAKEN = ["example.com", "example.org", "example.net"];
const FREE_REFERENCE_TLDS = ["com", "net", "org"];

const letters = "abcdefghijklmnopqrstuvwxyz";
function freshLabel() {
  return "qz" + Array.from({ length: 9 }, () => letters[Math.floor(Math.random() * 26)]).join("");
}
function knownFreeDomains() {
  const label = freshLabel();
  return FREE_REFERENCE_TLDS.map((tld) => `${label}.${tld}`);
}

async function timed(fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - t0, value, error: null };
  } catch (error) {
    return { ms: Date.now() - t0, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function withTimeout(ms) {
  return AbortSignal.timeout(ms);
}

async function checkRoute200(path) {
  const url = `${SITE_URL}${path}`;
  const { ms, value, error } = await timed(async () => {
    const res = await fetch(url, { signal: withTimeout(HTTP_TIMEOUT_MS), redirect: "follow" });
    return res.status;
  });
  const ok = error === null && value === 200;
  return { check: `route ${path}`, url, ok, ms, detail: error || `HTTP ${value}` };
}

async function checkReferenceDomain(domain, expectation) {
  const url = `${EDGE_API_URL}/check?domain=${encodeURIComponent(domain)}`;
  const { ms, value, error } = await timed(async () => {
    const res = await fetch(url, { signal: withTimeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body?.result;
  });

  if (error || !value) {
    return { check: `domain ${domain}`, url, ok: false, ms, detail: error || "no result in response" };
  }

  const { available, uncertain } = value;
  let ok = false;
  let detail;
  if (expectation === "taken") {
    // The one failure mode this whole workflow exists to catch: a genuinely
    // taken name coming back available. uncertain:true is fine here too —
    // it just means the honest-unless-sure invariant held.
    ok = available === false;
    detail = ok ? `taken, since_year=${value.since_year ?? "?"}` : `WRONG: available=${available} uncertain=${uncertain}`;
  } else {
    // "free" reference: available:true or an honest uncertain are both fine;
    // the one wrong answer is a fabricated "taken".
    ok = available === true || uncertain === true;
    detail = ok
      ? `available=${available} uncertain=${!!uncertain}`
      : `WRONG: reported taken for a name that was never registered`;
  }
  return { check: `domain ${domain} (expect ${expectation})`, url, ok, ms, detail };
}

async function checkPriceFreshness() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { check: "price freshness", ok: null, ms: 0, detail: "skipped — VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY not set" };
  }
  const headers = { apikey: SUPABASE_ANON_KEY };
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { ms, value, error } = await timed(async () => {
    const freshestRes = await fetch(
      `${SUPABASE_URL}/rest/v1/registrar_prices?select=verified_at&supported=eq.true&verified_at=not.is.null&order=verified_at.desc&limit=1`,
      { headers, signal: withTimeout(HTTP_TIMEOUT_MS) },
    );
    if (!freshestRes.ok) throw new Error(`HTTP ${freshestRes.status} (freshest)`);
    const freshest = await freshestRes.json();

    // Informational only: tld-list.com's pricing API has been paused since
    // 2026-09-11 (docs §5), so some registrar rows are expected to run stale
    // while the scraper fallback rotates through the catalog — that is a
    // known, owner-accepted state, not a page for this monitor. The gate below
    // is on the FRESHEST row: if even the most recently verified price is
    // older than the site's own stale threshold, the refresh pipeline itself
    // has stopped, which is worth paging on.
    const staleCountRes = await fetch(
      `${SUPABASE_URL}/rest/v1/registrar_prices?select=id&supported=eq.true&verified_at=lt.${encodeURIComponent(cutoff)}`,
      { headers: { ...headers, Prefer: "count=exact" }, signal: withTimeout(HTTP_TIMEOUT_MS) },
    );
    const staleCount = staleCountRes.headers.get("content-range")?.split("/")?.[1] ?? "unknown";

    return { freshestVerifiedAt: freshest?.[0]?.verified_at ?? null, staleCount };
  });

  if (error || !value?.freshestVerifiedAt) {
    return { check: "price freshness", ok: false, ms, detail: error || "no verified_at rows returned" };
  }
  const ageDays = (Date.now() - new Date(value.freshestVerifiedAt).getTime()) / (24 * 60 * 60 * 1000);
  const ok = ageDays <= STALE_AFTER_DAYS;
  return {
    check: "price freshness",
    ok,
    ms,
    detail: `freshest verified_at ${value.freshestVerifiedAt} (${ageDays.toFixed(1)}d old, threshold ${STALE_AFTER_DAYS}d); ${value.staleCount} row(s) past threshold (informational, tld-list.com API is paused)`,
  };
}

async function checkCronHeartbeats() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return [{ check: "cron heartbeats", ok: null, ms: 0, detail: "skipped — VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY not set" }];
  }
  const expected = ["domain-cache-purge-expired", "site-events-retention"];
  const { ms, value, error } = await timed(async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cron_heartbeats?select=job_name,last_run_at,rows_affected`,
      { headers: { apikey: SUPABASE_ANON_KEY }, signal: withTimeout(HTTP_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  if (error) {
    return [{ check: "cron heartbeats", ok: false, ms, detail: error }];
  }

  const byJob = new Map((value || []).map((r) => [r.job_name, r]));
  return expected.map((jobName) => {
    const row = byJob.get(jobName);
    if (!row) {
      return { check: `cron heartbeat: ${jobName}`, ok: false, ms, detail: "no heartbeat row yet (migration just landed, or the job never ran)" };
    }
    const ageHours = (Date.now() - new Date(row.last_run_at).getTime()) / (60 * 60 * 1000);
    const ok = ageHours <= HEARTBEAT_MAX_AGE_HOURS;
    return {
      check: `cron heartbeat: ${jobName}`,
      ok,
      ms,
      detail: `last ran ${row.last_run_at} (${ageHours.toFixed(1)}h ago, threshold ${HEARTBEAT_MAX_AGE_HOURS}h), rows_affected=${row.rows_affected}`,
    };
  });
}

async function main() {
  const results = [];

  results.push(await checkRoute200("/"));
  results.push(await checkRoute200("/tld"));

  for (const domain of KNOWN_TAKEN) {
    results.push(await checkReferenceDomain(domain, "taken"));
  }
  for (const domain of knownFreeDomains()) {
    results.push(await checkReferenceDomain(domain, "free"));
  }

  results.push(await checkPriceFreshness());
  results.push(...(await checkCronHeartbeats()));

  const failures = results.filter((r) => r.ok === false);
  const skipped = results.filter((r) => r.ok === null);
  const ok = failures.length === 0;

  const summaryLines = [
    "| Check | Result | ms | Detail |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.check} | ${r.ok === null ? "⚠️ skipped" : r.ok ? "✅" : "❌"} | ${r.ms} | ${r.detail} |`),
    "",
    "**Fastly Domain Research spend:** not tracked anywhere in code today (only a per-request `fastly-escalate` log line) — see docs/DIGMYNAME_ARCHITECTURE.md §13 for the proposal on measuring it without persisting domain names. Not part of this check's pass/fail.",
  ];
  const summary = summaryLines.join("\n");

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n", { flag: "a" });
  }

  const result = { ok, generatedAt: new Date().toISOString(), failures, skipped, results };
  if (RESULT_OUT) writeFileSync(RESULT_OUT, JSON.stringify(result, null, 2));

  if (!ok) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exitCode = 1;
  }
}

main();
