// Smoke tests: verify trust hierarchy via live edge function call.
// Loads .env so VITE_SUPABASE_URL / KEY are available.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/check-domains`;

async function check(domains: string[]) {
  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ domains }),
  });
  const json = await resp.json();
  return { status: resp.status, results: json.results as Array<Record<string, unknown>> };
}

Deno.test("known-taken short .com is never reported as available", async () => {
  // google.com is registered → must be available:false.
  const { status, results } = await check(["google.com"]);
  assertEquals(status, 200);
  const r = results[0];
  assertEquals(r.available, false, `google.com should be taken, got ${JSON.stringify(r)}`);
});

Deno.test("invalid domain is rejected", async () => {
  const { status } = await check(["not a domain!!"]);
  assertEquals(status, 400);
});

Deno.test("short SLD on .com gets premium/uncertain treatment when available", async () => {
  // 3-letter .com that is registered must be reported as taken; if any signal
  // marked it available it would carry likelyPremium=true.
  const { results } = await check(["abc.com"]);
  const r = results[0];
  if (r.available === true) {
    assert(r.likelyPremium === true, "available short .com must be flagged likelyPremium");
  } else {
    assertEquals(r.available, false);
  }
});

Deno.test("clearly-available random domain returns true", async () => {
  const rand = `lvbl-${crypto.randomUUID().slice(0, 8)}.com`;
  const { results } = await check([rand]);
  const r = results[0];
  // Should be available; if uncertain, must NOT claim available=true.
  if (r.uncertain) {
    assertEquals(r.available, false);
  } else {
    assertEquals(r.available, true);
  }
});
