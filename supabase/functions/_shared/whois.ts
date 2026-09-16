// ============================================================================
// WHOIS (port 43) — the free registry authority for zones RDAP cannot serve us
//
// Why this exists: `.co` and `.me` publish no usable registry RDAP (§4), so for
// years the ONLY way to tell "free" from "registered" there was the paid third
// signal. Both registries still answer plain WHOIS on TCP 43, from the registry
// itself, and faster than the paid call — measured 2026-09-16 from an EU client:
//
//   whois.registry.co   connect 127-214 ms   full answer 307-346 ms
//   whois.nic.me        connect 250-262 ms   full answer 451-465 ms
//   whois.nic.io        connect ~250 ms      full answer ~465 ms
//
// So a WHOIS "not found" + DNS NXDOMAIN is the same shape of evidence as an
// RDAP 404 + NXDOMAIN: two independent sources, one of them the registry.
//
// Scope is deliberately narrow — only the three zones where it replaces money.
// Every other searchable TLD has working registry RDAP, and adding a WHOIS
// server that answers something we parse loosely would trade a paid-but-correct
// answer for a free-but-wrong one. Two zones are excluded on evidence:
//   • `.shop` — GMO retired WHOIS on 2026-05-01 (the server answers with an
//     "RDAP transition policy" notice and no data), so it cannot help there.
//   • the Identity Digital gTLDs (.info, .agency, .studio, …) — IANA publishes
//     no port-43 server for them at all since the RDAP transition.
//
// Transport note: Supabase Edge Functions block outbound ports 25/465/587 only,
// and raw TCP through `Deno.connect` is what the Postgres drivers already use —
// but port 43 from the edge is unproven until this ships. Every failure path
// here returns "unknown", which is exactly today's behaviour, so if the port
// turns out to be closed the pipeline silently keeps its current verdicts.
// ============================================================================

export type WhoisVerdict = "free" | "taken" | "unknown";

/** Registry WHOIS servers, from IANA's own records (checked 2026-09-16) and
 *  verified live against a registered and an unregistered name in each zone. */
export const WHOIS_SERVERS: Readonly<Record<string, string>> = {
  co: "whois.registry.co",
  me: "whois.nic.me",
  io: "whois.nic.io",
};

export function whoisServerFor(domain: string): string | undefined {
  return WHOIS_SERVERS[domain.split(".").pop()?.toLowerCase() ?? ""];
}

// A server that is rate-limiting, refusing or apologising tells us nothing
// about the name. Matched only in the HEAD of the answer: registries put the
// error on the first line, while the legal boilerplate every WHOIS response
// carries ("...must not be used to enable high volume queries...") contains the
// same vocabulary and used to make every real answer read as "unknown".
const NO_ANSWER = [
  "exceeded", "rate limit", "rate-limit", "too many", "quota exceeded", "try again",
  "temporarily unavailable", "service unavailable", "access denied",
  "connection refused", "error processing", "invalid query",
];

/** A registry states an error on the very first line; the legal boilerplate
 *  that mentions the same words ("...sends too many queries...") starts later. */
const ERROR_LINES = 2;
/** How far in the answer itself ("Domain not found.") may appear. */
const ANSWER_LINES = 6;

// The registry saying: no registration exists for this name.
const FREE_MARKERS = [
  "domain not found", "not found", "no match", "no data found", "no entries found",
  "nothing found", "does not exist", "no object found", "status: free",
  "status: available", "not registered",
];

// A registration record. Matched as a field at the start of a line so the words
// cannot be picked up out of the legal boilerplate every WHOIS answer carries.
const TAKEN_FIELD =
  /^[ \t]*(domain name|domain|registry domain id|creation date|created(?: on| date)?|registrar|registrar whois server|name server|nserver|registry expiry date|updated date)[ \t]*:/im;

/**
 * Read a raw WHOIS response. Strict by construction: anything that is not
 * unmistakably "no registration" or unmistakably "a record" is `unknown`, and an
 * `unknown` never becomes an availability claim upstream.
 */
export function interpretWhois(raw: string): WhoisVerdict {
  const text = (raw ?? "").trim();
  if (!text) return "unknown";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const errorHead = lines.slice(0, ERROR_LINES).join("\n").toLowerCase();
  const answerHead = lines.slice(0, ANSWER_LINES).join("\n").toLowerCase();

  if (NO_ANSWER.some((m) => errorHead.includes(m))) return "unknown";

  // A registration record is unambiguous and wins: a genuine not-found answer
  // carries no registration fields at all.
  if (TAKEN_FIELD.test(text)) return "taken";
  // "no registration" is only believed where the registry states it — at the
  // top — never from a sentence buried in the terms of use.
  if (FREE_MARKERS.some((m) => answerHead.includes(m))) return "free";
  return "unknown";
}

/**
 * One WHOIS query over TCP 43. Never throws: a blocked port, a refused
 * connection, a timeout or an unparsable answer all read as "unknown".
 */
export async function whoisQuery(domain: string, server: string, timeoutMs = 2500): Promise<WhoisVerdict> {
  const connect = (globalThis as { Deno?: { connect?: (o: { hostname: string; port: number }) => Promise<Deno.TcpConn> } })
    .Deno?.connect;
  if (!connect) return "unknown";

  let conn: Deno.TcpConn | undefined;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { conn?.close(); } catch { /* already closed */ }
  }, timeoutMs);
  (globalThis as { Deno?: { unrefTimer?: (n: number) => void } }).Deno?.unrefTimer?.(timer as unknown as number);

  try {
    conn = await connect({ hostname: server, port: 43 });
    await conn.write(new TextEncoder().encode(`${domain}\r\n`));

    const chunks: Uint8Array[] = [];
    let total = 0;
    const buf = new Uint8Array(4096);
    // 32 KB is far past any registry's answer; it bounds a server that never
    // closes the connection (the timeout above closes it anyway).
    while (total < 32_768) {
      const n = await conn.read(buf);
      if (n === null) break;
      chunks.push(buf.slice(0, n));
      total += n;
    }
    if (timedOut) return "unknown";

    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return interpretWhois(new TextDecoder().decode(out));
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
    try { conn?.close(); } catch { /* closed by the timeout */ }
  }
}
