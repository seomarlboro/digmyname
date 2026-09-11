// Thin HTTP wrapper around the shared domain-resolution pipeline.
// All availability/pricing logic lives in ../_shared/pipeline.ts so that
// `public-api` can call it in-process (no edge→edge hop) and share the same
// warm module-level caches.
import { checkDomains, isValidDomain, type DomainCheckResult } from "../_shared/pipeline.ts";
import { clientIpOf, createBudget } from "../_shared/rate-limit.ts";

// Backwards-compat re-exports (tests and any external importers).
export {
  checkDomains,
  classifyAftermarket,
  detectAftermarket,
  FAST_RDAP,
  FAST_RDAP_EXCEPTIONS,
  getTldPricing,
  interpretDomainr,
  isLikelyPremium,
  isValidDomain,
  loadRdapBootstrap,
  loadTldPricing,
  warmRdapBootstrap,
} from "../_shared/pipeline.ts";
export type { DomainCheckResult, DomainrVerdict } from "../_shared/pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------------------------------------------------------------------------
// Per-IP budget (in-memory, sliding window, per isolate). Counted in DOMAINS,
// not requests: the website sends one request per top TLD plus batches of 8
// (16 requests for a 53-TLD search, 318 domains with AI variations on), so the
// old 30-requests/min cap would have failed it on the second search the day
// the platform starts reusing isolates. The request cap bounds a flood of
// 1-domain requests. Logic and tests live in ../_shared/rate-limit.ts.
// ---------------------------------------------------------------------------
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 600, maxCost: 4000 };
const spendBudget = createBudget(RATE_LIMIT);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domains, verifyPremium } = (await req.json()) as { domains: string[]; verifyPremium?: boolean };
    if (!Array.isArray(domains) || domains.length === 0) {
      return new Response(JSON.stringify({ error: "domains array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validOrder = domains.slice(0, 50).filter(isValidDomain);
    if (validOrder.length === 0) {
      return new Response(JSON.stringify({ error: "No valid domains provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The budget is spent per valid domain, so the request is parsed first.
    const quota = spendBudget(clientIpOf(req), validOrder.length);
    if (!quota.ok) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(quota.retryAfterSec),
          "X-RateLimit-Limit": String(RATE_LIMIT.maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      });
    }
    const quotaHeaders = {
      "X-RateLimit-Limit": String(RATE_LIMIT.maxRequests),
      "X-RateLimit-Remaining": String(quota.remainingRequests),
    };

    // Wall-clock budget: on a cold isolate a slow zone (.co/.me via the third
    // signal) can run long. We race the full pipeline against a hard budget and,
    // on timeout, serve whatever DID resolve — every domain that reached a verdict
    // is published into `partialSink` as it lands; the still-unresolved ones are
    // returned as an honest budget_timeout (uncertain, NOT a registry failure).
    const HARD_BUDGET_MS = 8000;
    const THIRD_SIGNAL_WINDOW_MS = 6000;

    const partialSink = new Map<string, DomainCheckResult>();

    // `verifyPremium`: the site asks for the registry-premium status of the card
    // the visitor typed (one name, after the wave settled). Costs one third-signal
    // call, so it is capped at three names and can be switched off with
    // HEADLINE_PREMIUM_CHECK=off without a deploy.
    const premiumCheckOn = Deno.env.get("HEADLINE_PREMIUM_CHECK") !== "off";
    const verify = verifyPremium === true && premiumCheckOn && validOrder.length <= 3 ? new Set(validOrder) : undefined;
    const pipeline = checkDomains(domains, {
      partialSink,
      thirdSignalDeadlineAt: Date.now() + THIRD_SIGNAL_WINDOW_MS,
      verifyPremium: verify,
    });

    const budget = new Promise<"timeout">((resolve) => {
      const id = setTimeout(() => resolve("timeout"), HARD_BUDGET_MS);
      // Don't hold the isolate open just for the timer if the pipeline wins.
      (globalThis as { Deno?: { unrefTimer?: (n: number) => void } }).Deno?.unrefTimer?.(id as unknown as number);
    });

    const outcome = await Promise.race([pipeline, budget]);

    let results: DomainCheckResult[];
    if (outcome === "timeout") {
      // Pipeline exceeded the budget. Assemble from whatever resolved; fill gaps
      // with an honest budget_timeout verdict (never "available", never a failure
      // of the registry — OUR budget expired). Preserve input order.
      results = validOrder.map(
        (d) =>
          partialSink.get(d) ?? {
            domain: d,
            available: false,
            checkedVia: "budget",
            uncertain: true,
            uncertainReason: "budget_timeout" as const,
          }
      );
      const resolved = validOrder.filter((d) => partialSink.has(d)).length;
      console.warn(
        `check-domains budget hit ${HARD_BUDGET_MS}ms — served ${resolved}/${validOrder.length} resolved, rest budget_timeout`
      );
      // Let the pipeline finish in the background so its cache writes still land
      // (results are cached for the next caller); never awaited on this request.
      const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      rt?.waitUntil?.(pipeline.catch(() => {}));
    } else {
      results = outcome as DomainCheckResult[];
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, ...quotaHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-domains error:", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
