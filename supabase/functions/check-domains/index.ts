// Thin HTTP wrapper around the shared domain-resolution pipeline.
// All availability/pricing logic lives in ../_shared/pipeline.ts so that
// `public-api` can call it in-process (no edge→edge hop) and share the same
// warm module-level caches.
import { checkDomains, isValidDomain, type DomainCheckResult } from "../_shared/pipeline.ts";

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
// Lightweight per-IP rate limiter (in-memory, sliding window).
// Each isolate gets its own counter — good enough to stop trivial abuse
// without external infra.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 30;            // requests
const RATE_LIMIT_WINDOW_MS = 60_000;  // per minute
const rateBuckets = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(req: Request): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  const window = rateBuckets.get(ip) ?? [];
  const recent = window.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  // Best-effort cleanup to prevent unbounded growth.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (rateLimited(req)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const { domains } = (await req.json()) as { domains: string[] };
    if (!Array.isArray(domains) || domains.length === 0) {
      return new Response(JSON.stringify({ error: "domains array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (domains.slice(0, 50).filter(isValidDomain).length === 0) {
      return new Response(JSON.stringify({ error: "No valid domains provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Wall-clock budget: on a cold isolate a slow zone (.co/.me via the third
    // signal) can run long. We race the full pipeline against a hard budget and,
    // on timeout, serve whatever DID resolve — every domain that reached a verdict
    // is published into `partialSink` as it lands; the still-unresolved ones are
    // returned as an honest budget_timeout (uncertain, NOT a registry failure).
    const HARD_BUDGET_MS = 8000;
    const THIRD_SIGNAL_WINDOW_MS = 6000;

    const partialSink = new Map<string, DomainCheckResult>();
    const validOrder = domains.slice(0, 50).filter(isValidDomain);

    const pipeline = checkDomains(domains, {
      partialSink,
      thirdSignalDeadlineAt: Date.now() + THIRD_SIGNAL_WINDOW_MS,
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-domains error:", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
