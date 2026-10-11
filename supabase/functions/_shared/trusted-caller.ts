// ============================================================================
// WHO IS CALLING — the one place that decides which address a request is
// charged to (docs/DIGMYNAME_ARCHITECTURE.md §15).
//
// Why this file exists. `api.digmyname.com` is a Cloudflare Worker that fetches
// this origin server-side. A Worker subrequest carries none of the visitor's
// headers unless the Worker copies them, so the platform reports the Worker's
// own egress address — the same one for every visitor. Measured 2026-10-11:
// every request through the edge, from every caller, landed in ONE row of
// `api_quota_daily`. "5,000 domains per day per IP" was therefore 5,000 per day
// for the whole edge, and our own prewarm job alone asks for 7,200. The API
// answered `429 daily_quota` to everyone for 15-18 hours a day, six days
// running, while the direct origin (which sees real addresses) stayed fine.
//
// The contract now:
//   • The Worker sends `x-dmn-client-ip` (Cloudflare's `CF-Connecting-IP` for
//     the visitor) together with `x-dmn-edge-key`.
//   • That address is believed ONLY when the key checks out. A caller who talks
//     to the origin directly and invents the header is charged to the address
//     the platform reports, exactly as before — a client-supplied address must
//     never choose its own quota bucket (CWE-348).
//   • Our own scheduled traffic sends `x-dmn-internal-key`. It is counted (so
//     we can see what our own jobs cost) but never capped: a product that
//     refuses its own cache warmer has only limited itself.
//
// Keys are compared by digest. This repository is public, so the keys
// themselves live only where they are used (a Worker secret, the database
// vault) and the code holds their SHA-256. Each key is 256 random bits, so the
// digest gives away nothing that helps find it. To rotate without a deploy, set
// `EDGE_KEY_SHA256` / `INTERNAL_KEY_SHA256` in the edge environment.
//
// No remote imports, no Deno globals at load time — unit-tested by
// `trusted-caller_test.ts`.
// ============================================================================
import { clientIpOf } from "./rate-limit.ts";

/** SHA-256 (hex) of the key the edge Worker presents in `x-dmn-edge-key`. */
export const EDGE_KEY_SHA256 = "7e958d5cd89e872e9af7821c179874c467c98c1fd9c21d6a53ae4d443727a359";

/** SHA-256 (hex) of the key our own scheduled jobs present in `x-dmn-internal-key`. */
export const INTERNAL_KEY_SHA256 = "407fd4a51dd7a0e3208d071cc8a693e1be68b3afa5457312aea29bd9e646e2b2";

export const EDGE_KEY_HEADER = "x-dmn-edge-key";
export const EDGE_CLIENT_IP_HEADER = "x-dmn-client-ip";
export const INTERNAL_KEY_HEADER = "x-dmn-internal-key";

/** A presented key longer than this is not one of ours; do not hash it. */
const MAX_KEY_LENGTH = 256;

export interface Caller {
  /** The address the request is charged to. */
  ip: string;
  /** `edge`: the Worker vouched for `ip`. `direct`: the platform reported it. */
  via: "edge" | "direct";
  /** Our own scheduled traffic — counted, never capped. */
  internal: boolean;
}

export interface TrustedDigests {
  edge: string;
  internal: string;
}

/** The digests in force: the environment's when set (rotation without a
 *  deploy), otherwise the constants above. A malformed override is ignored
 *  rather than silently trusting nothing — or everything. */
export function trustedDigests(env: (name: string) => string | undefined = safeEnv): TrustedDigests {
  return {
    edge: digestOr(env("EDGE_KEY_SHA256"), EDGE_KEY_SHA256),
    internal: digestOr(env("INTERNAL_KEY_SHA256"), INTERNAL_KEY_SHA256),
  };
}

function digestOr(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(v) ? v : fallback;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent comparison of two digests, so the time it takes says
 *  nothing about how many leading characters matched. */
export function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function presents(req: Request, header: string, digest: string): Promise<boolean> {
  const key = req.headers.get(header);
  if (!key || key.length > MAX_KEY_LENGTH) return false;
  return sameDigest(await sha256Hex(key), digest);
}

function ipv4Octets(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * The eight 16-bit groups of an IPv6 literal, or `null` when the text is not
 * one. Accepts `::` compression, an embedded IPv4 tail (`::ffff:203.0.113.9`),
 * brackets and a zone id — the spellings a proxy header can carry.
 */
export function ipv6Groups(text: string): number[] | null {
  let s = text.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":") || s.length > 45) return null;

  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = ipv4Octets(tail);
    if (!o) return null;
    s = `${s.slice(0, lastColon + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  if (rest === null ? head.length !== 8 : head.length + rest.length > 7) return null;

  const groups = rest === null
    ? head
    : [...head, ...Array<string>(8 - head.length - rest.length).fill("0"), ...rest];
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

/** True for an IPv4 or IPv6 literal. The Worker's header is only ever an
 *  address; anything else is not charged to. */
export function isIpLiteral(text: string): boolean {
  const s = text.trim();
  return ipv4Octets(s) !== null || ipv6Groups(s) !== null;
}

/**
 * Resolve who a request is charged to.
 *
 *  1. A request carrying the edge key and a well-formed address is charged to
 *     that address (the visitor behind the Worker).
 *  2. Anything else is charged to the address the platform reports, as before.
 *  3. A request carrying the internal key is flagged `internal`, whichever way
 *     it arrived.
 */
export async function resolveCaller(
  req: Request,
  fallback = "unknown",
  digests: TrustedDigests = trustedDigests(),
): Promise<Caller> {
  const internal = await presents(req, INTERNAL_KEY_HEADER, digests.internal);

  const claimed = req.headers.get(EDGE_CLIENT_IP_HEADER)?.trim() ?? "";
  if (claimed && isIpLiteral(claimed) && await presents(req, EDGE_KEY_HEADER, digests.edge)) {
    return { ip: claimed, via: "edge", internal };
  }
  return { ip: clientIpOf(req, fallback), via: "direct", internal };
}

/** `Deno.env.get` without requiring the permission (tests, node tooling). */
function safeEnv(name: string): string | undefined {
  try {
    return (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}
