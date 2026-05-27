// Temporary diagnostic function — compares DigMyName verdicts vs competitors.
// Delete after testing.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL = "https://api.firecrawl.dev/v2/scrape";

interface CompetitorProbe {
  name: string;
  url: (domain: string) => string;
  // Heuristic: look for keywords near the domain name in markdown
  parse: (markdown: string, domain: string) => string;
}

function around(text: string, needle: string, win = 200): string {
  const lower = text.toLowerCase();
  const i = lower.indexOf(needle.toLowerCase());
  if (i < 0) return "";
  return text.slice(Math.max(0, i - win), Math.min(text.length, i + needle.length + win));
}

function classifyChunk(chunk: string): string {
  const c = chunk.toLowerCase();
  const has = (...words: string[]) => words.some((w) => c.includes(w));
  if (!chunk) return "not_found";
  if (has("premium", "marketplace", "make offer", "buy now", "for sale", "$", "€", "aftermarket")) {
    // distinguish premium vs registration price
    if (has("premium") || /\$\s?\d{3,}/.test(chunk) || has("make offer", "for sale", "aftermarket")) return "premium";
  }
  if (has("available", "is available", "register")) return "available";
  if (has("taken", "unavailable", "registered", "owned", "already")) return "taken";
  return "unknown";
}

const COMPETITORS: CompetitorProbe[] = [
  {
    name: "InstantDomainSearch",
    url: (d) => `https://instantdomainsearch.com/?q=${encodeURIComponent(d.split(".")[0])}`,
    parse: (md, d) => classifyChunk(around(md, d, 300)),
  },
  {
    name: "Domainr",
    url: (d) => `https://domainr.com/?q=${encodeURIComponent(d)}`,
    parse: (md, d) => classifyChunk(around(md, d, 300)),
  },
  {
    name: "Namechk",
    url: (d) => `https://namechk.com/namechecker/${encodeURIComponent(d.split(".")[0])}`,
    parse: (md, d) => classifyChunk(around(md, d, 300)),
  },
  {
    name: "LeanDomainSearch",
    url: (d) => `https://leandomainsearch.com/search?q=${encodeURIComponent(d.split(".")[0])}`,
    parse: (md, d) => classifyChunk(around(md, d, 300)),
  },
];

async function scrape(url: string): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return "ERR: no firecrawl key";
  try {
    const r = await fetch(FIRECRAWL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 4000,
      }),
    });
    const j = await r.json();
    if (!r.ok) return `ERR ${r.status}: ${JSON.stringify(j).slice(0, 200)}`;
    return j.data?.markdown || j.markdown || "";
  } catch (e) {
    return `ERR: ${(e as Error).message}`;
  }
}

async function checkOurs(domain: string): Promise<unknown> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const r = await fetch(`${supabaseUrl}/functions/v1/check-domains`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anon}`,
      apikey: anon || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domains: [domain] }),
  });
  const j = await r.json();
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { domains } = (await req.json()) as { domains: string[] };

  const results: Record<string, Record<string, string>> = {};

  for (const domain of domains) {
    const ourPromise = checkOurs(domain);
    const compPromises = COMPETITORS.map(async (c) => {
      const md = await scrape(c.url(domain));
      const verdict = md.startsWith("ERR") ? md.slice(0, 80) : c.parse(md, domain);
      return [c.name, verdict] as const;
    });

    const [ours, ...comps] = await Promise.all([ourPromise, ...compPromises]);
    const row: Record<string, string> = {};
    const ourResult = (ours as { results?: Array<{ available: boolean; uncertain?: boolean; premium?: boolean; likelyPremium?: boolean; price?: number; checkedVia: string }> })?.results?.[0];
    if (ourResult) {
      let label = ourResult.uncertain
        ? "uncertain"
        : ourResult.available
          ? ourResult.premium || ourResult.likelyPremium
            ? `premium${ourResult.price ? `($${ourResult.price})` : ""}`
            : "available"
          : "taken";
      row["DigMyName"] = `${label} [${ourResult.checkedVia}]`;
    } else {
      row["DigMyName"] = `ERR: ${JSON.stringify(ours).slice(0, 100)}`;
    }
    for (const [name, verdict] of comps) row[name] = verdict;
    results[domain] = row;
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
