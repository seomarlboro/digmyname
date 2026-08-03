import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// ---------------------------------------------------------------------------
// domain-age — returns the registration (creation) date for taken domains.
// Lazy / non-blocking: the UI calls this AFTER search results render, so it
// never adds latency to the availability check itself.
// ---------------------------------------------------------------------------

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

// Registry RDAP endpoints for the most common zones — skips the rdap.org hop.
const FAST_RDAP: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1",
  net: "https://rdap.verisign.com/net/v1",
  org: "https://rdap.publicinterestregistry.org/rdap",
  info: "https://rdap.identitydigital.services/rdap",
  io: "https://rdap.identitydigital.services/rdap",
  ai: "https://rdap.identitydigital.services/rdap",
  app: "https://www.registry.google/rdap",
  dev: "https://www.registry.google/rdap",
  xyz: "https://rdap.centralnic.com/xyz",
  co: "https://rdap.nic.co",
  me: "https://rdap.nic.me",
};

interface AgeInfo { created: string | null; expires: string | null }

// 24h in-isolate cache — creation dates never change.
const cache = new Map<string, { value: AgeInfo; expiresAt: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

function pickEvent(events: unknown, action: string): string | null {
  if (!Array.isArray(events)) return null;
  for (const e of events) {
    const ev = e as { eventAction?: string; eventDate?: string };
    if (ev?.eventAction === action && typeof ev.eventDate === "string") return ev.eventDate;
  }
  return null;
}

async function fetchAge(domain: string): Promise<AgeInfo> {
  const hit = cache.get(domain);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const tld = domain.split(".").pop()!.toLowerCase();
  const urls = [
    FAST_RDAP[tld] ? `${FAST_RDAP[tld]}/domain/${domain}` : null,
    `https://rdap.org/domain/${domain}`,
  ].filter(Boolean) as string[];

  let value: AgeInfo = { created: null, expires: null };
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { accept: "application/rdap+json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) { await resp.text().catch(() => {}); continue; }
      const data = await resp.json();
      const created = pickEvent(data?.events, "registration");
      const expires = pickEvent(data?.events, "expiration");
      if (created || expires) { value = { created, expires }; break; }
    } catch {
      // try next source
    }
  }

  cache.set(domain, { value, expiresAt: Date.now() + TTL_MS });
  if (cache.size > 5000) {
    for (const [k, v] of cache) { if (v.expiresAt <= Date.now()) cache.delete(k); }
  }
  return value;
}

async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.domains) ? body.domains : [];
    const domains = [...new Set(
      raw
        .filter((d: unknown): d is string => typeof d === "string")
        .map((d: string) => d.trim().toLowerCase())
        .filter((d: string) => d.length <= 253 && DOMAIN_RE.test(d))
    )].slice(0, 50);

    if (domains.length === 0) {
      return new Response(JSON.stringify({ error: "domains must be a non-empty array of valid domain names" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const infos = await pMap(domains, 10, fetchAge);
    const results: Record<string, AgeInfo> = {};
    domains.forEach((d, idx) => { results[d] = infos[idx]; });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    });
  } catch (e) {
    console.error("domain-age error", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
