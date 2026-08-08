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

    const results = await checkDomains(domains);

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
