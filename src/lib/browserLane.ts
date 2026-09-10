/**
 * Browser lane: the registry answers the visitor directly.
 *
 * Every registry we use for the popular TLDs publishes RDAP with
 * `Access-Control-Allow-Origin: *` (RFC 7480 §5.6), and Cloudflare / Google
 * DNS-over-HTTPS do too. So the browser can run the same two base signals the
 * edge pipeline runs first (registry RDAP + DoH) over its OWN connection —
 * pre-opened on landing / focus — instead of waiting for a cold edge isolate
 * to open a fresh TLS session to the registry on every request.
 *
 * Honesty rules, identical to `_shared/pipeline.ts#resolveDomain`'s base pass:
 *   - taken: registry RDAP 200, or DNS has records (either alone is decisive);
 *   - available: RDAP 404 AND NXDOMAIN, and only when the edge would not
 *     escalate the name (premium suspects and brand-blocked labels stay with
 *     the server and its paid third signal);
 *   - anything else is `unknown` and changes nothing on screen.
 * A browser verdict is provisional: the authoritative wave overwrites it, it is
 * never cached, and a row that already has a verdict is never touched.
 */
import type { DomainResult } from "./domainData";
import { isLikelyBlocked } from "../../supabase/functions/_shared/availability-rules";
import { isPremiumSuspectSld, sldOf } from "./searchLanes";

/** Registry RDAP bases with CORS verified (2026-09-10), a subset of the edge's FAST_RDAP table. */
const VERISIGN_COM = "https://rdap.verisign.com/com/v1";
const VERISIGN_NET = "https://rdap.verisign.com/net/v1";
const PIR = "https://rdap.publicinterestregistry.org/rdap";
const IDENTITY_DIGITAL = "https://rdap.identitydigital.services/rdap";
const GOOGLE = "https://pubapi.registry.google/rdap";
const CENTRALNIC = "https://rdap.centralnic.com";
const RADIX = "https://rdap.radix.host/rdap";

export const BROWSER_RDAP: Readonly<Record<string, string>> = {
  com: VERISIGN_COM,
  net: VERISIGN_NET,
  org: PIR,
  io: IDENTITY_DIGITAL,
  ai: IDENTITY_DIGITAL,
  info: IDENTITY_DIGITAL,
  digital: IDENTITY_DIGITAL,
  software: IDENTITY_DIGITAL,
  systems: IDENTITY_DIGITAL,
  agency: IDENTITY_DIGITAL,
  company: IDENTITY_DIGITAL,
  ventures: IDENTITY_DIGITAL,
  capital: IDENTITY_DIGITAL,
  studio: IDENTITY_DIGITAL,
  media: IDENTITY_DIGITAL,
  market: IDENTITY_DIGITAL,
  community: IDENTITY_DIGITAL,
  social: IDENTITY_DIGITAL,
  group: IDENTITY_DIGITAL,
  finance: IDENTITY_DIGITAL,
  money: IDENTITY_DIGITAL,
  fund: IDENTITY_DIGITAL,
  life: IDENTITY_DIGITAL,
  live: IDENTITY_DIGITAL,
  world: IDENTITY_DIGITAL,
  pro: IDENTITY_DIGITAL,
  wtf: IDENTITY_DIGITAL,
  solutions: IDENTITY_DIGITAL,
  works: IDENTITY_DIGITAL,
  land: IDENTITY_DIGITAL,
  app: GOOGLE,
  dev: GOOGLE,
  page: GOOGLE,
  new: GOOGLE,
  xyz: `${CENTRALNIC}/xyz`,
  art: `${CENTRALNIC}/art`,
  lol: `${CENTRALNIC}/lol`,
  icu: `${CENTRALNIC}/icu`,
  inc: `${CENTRALNIC}/inc`,
  tech: RADIX,
  store: RADIX,
  site: RADIX,
  online: RADIX,
  space: RADIX,
};

export const DOH_PRIMARY = "https://cloudflare-dns.com/dns-query";
export const DOH_HEDGE = "https://dns.google/resolve";
/** Same hedge delay as the edge pipeline: the common fast case costs nothing extra. */
export const DOH_HEDGE_DELAY_MS = 400;
export const RDAP_TIMEOUT_MS = 2500;
export const DOH_TIMEOUT_MS = 2000;

/** Hosts worth a `preconnect` before the visitor types: origins of the table above plus DoH. */
export const REGISTRY_ORIGINS: readonly string[] = [
  "https://rdap.verisign.com",
  "https://rdap.identitydigital.services",
  "https://rdap.publicinterestregistry.org",
  "https://cloudflare-dns.com",
  "https://pubapi.registry.google",
  "https://rdap.centralnic.com",
  "https://rdap.radix.host",
];

export type BrowserState = "available" | "taken" | "unknown";
export interface BrowserVerdict {
  domain: string;
  state: BrowserState;
  /** Which signal decided: registry RDAP, DNS records, or nothing. */
  checkedVia: "rdap" | "dns" | "none";
}

export function tldOf(domain: string): string {
  const dot = domain.indexOf(".");
  return dot === -1 ? "" : domain.slice(dot + 1).toLowerCase();
}

/** The lane only asks registries it can reach with CORS, and never for brand-blocked labels (the server files those as brand-protected). */
export function browserLaneEligible(domain: string): boolean {
  return Boolean(BROWSER_RDAP[tldOf(domain)]) && !isLikelyBlocked(domain);
}

/** A short label is a premium suspect on every TLD: its RDAP-404 may be a registry-reserved tier, so the browser never calls it available. */
export function mayShowAvailable(domain: string): boolean {
  return !isPremiumSuspectSld(sldOf(domain));
}

type RdapState = "available" | "taken" | "unknown";
type DnsState = "has_records" | "no_records" | "error";

const PENDING = new Promise<never>(() => {});

function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => Boolean(s));
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === "function") return any.call(AbortSignal, list);
  const ctl = new AbortController();
  for (const s of list) {
    if (s.aborted) ctl.abort();
    else s.addEventListener("abort", () => ctl.abort(), { once: true });
  }
  return ctl.signal;
}

function timeoutSignal(ms: number, parent: AbortSignal): AbortSignal {
  const t = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof t === "function") return anySignal([parent, t.call(AbortSignal, ms)]);
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), ms);
  return anySignal([parent, ctl.signal]);
}

async function rdapOnce(url: string, signal: AbortSignal): Promise<RdapState> {
  try {
    const resp = await fetch(url, { headers: { accept: "application/rdap+json" }, signal: timeoutSignal(RDAP_TIMEOUT_MS, signal) });
    if (resp.status === 404) return "available";
    if (resp.ok) return "taken";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function dohProbe(endpoint: string, domain: string, signal: AbortSignal): Promise<DnsState> {
  try {
    const answers = await Promise.all(
      ["A", "NS"].map((type) =>
        fetch(`${endpoint}?name=${encodeURIComponent(domain)}&type=${type}`, {
          headers: { accept: "application/dns-json" },
          signal: timeoutSignal(DOH_TIMEOUT_MS, signal),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );
    let hasRecords = false;
    let nxdomain = false;
    for (const data of answers as ({ Status?: number; Answer?: unknown[] } | null)[]) {
      if (!data) continue;
      if (Array.isArray(data.Answer) && data.Answer.length > 0) hasRecords = true;
      if (data.Status === 3) nxdomain = true;
    }
    if (hasRecords) return "has_records";
    if (nxdomain) return "no_records";
    return "error";
  } catch {
    return "error";
  }
}

async function dnsDoH(domain: string, signal: AbortSignal): Promise<DnsState> {
  const ctl = new AbortController();
  const sig = anySignal([signal, ctl.signal]);
  const primary = dohProbe(DOH_PRIMARY, domain, sig);
  const hedge = new Promise<DnsState>((resolve) => {
    const id = setTimeout(() => dohProbe(DOH_HEDGE, domain, sig).then(resolve), DOH_HEDGE_DELAY_MS);
    primary.then((s) => {
      if (s !== "error") {
        clearTimeout(id);
        resolve("error");
      }
    });
  });
  const decisive = (p: Promise<DnsState>) => p.then((s) => (s === "error" ? PENDING : s));
  try {
    return await Promise.race([decisive(primary), decisive(hedge), Promise.all([primary, hedge]).then((s) => s.find((x) => x !== "error") ?? "error")]);
  } finally {
    ctl.abort();
  }
}

/**
 * Registry RDAP + DoH from the visitor's browser. Decisive answers win the race
 * the same way they do on the edge; the rest resolves to `unknown`.
 */
export async function checkInBrowser(domain: string, signal?: AbortSignal): Promise<BrowserVerdict> {
  const base = BROWSER_RDAP[tldOf(domain)];
  if (!base) return { domain, state: "unknown", checkedVia: "none" };
  const ctl = new AbortController();
  const sig = anySignal([signal, ctl.signal]);
  const rdapP = rdapOnce(`${base}/domain/${domain}`, sig);
  const dnsP = dnsDoH(domain, sig);
  // A superseded search must not wait for probes that outlive its abort.
  const aborted = new Promise<"aborted">((resolve) => {
    if (sig.aborted) resolve("aborted");
    else sig.addEventListener("abort", () => resolve("aborted"), { once: true });
  });
  try {
    const winner = await Promise.race([
      rdapP.then((r) => (r === "taken" ? "rdap" : PENDING)),
      dnsP.then((d) => (d === "has_records" ? "dns" : PENDING)),
      Promise.all([rdapP, dnsP]).then(() => "settled"),
      aborted,
    ]);
    if (winner === "aborted") return { domain, state: "unknown", checkedVia: "none" };
    if (winner === "rdap" || winner === "dns") return { domain, state: "taken", checkedVia: winner };
    const [rdap, dns] = await Promise.all([rdapP, dnsP]);
    if (rdap === "available" && dns === "no_records" && mayShowAvailable(domain)) return { domain, state: "available", checkedVia: "rdap" };
    return { domain, state: "unknown", checkedVia: "none" };
  } finally {
    ctl.abort();
  }
}

/**
 * Merge a browser verdict into a result row. Same contract as the fast lane's
 * `applyFastVerdict`: only a row still Checking changes, `unknown` changes
 * nothing, and the row stays `provisional` so the session cache ignores it and
 * the authoritative answer replaces it. Returns the SAME object when nothing
 * changes, so callers can detect a flip by identity.
 */
export function applyBrowserVerdict(row: DomainResult, v: BrowserVerdict): DomainResult {
  if (!row.checking || v.state === "unknown") return row;
  return { ...row, available: v.state === "available", uncertain: false, checking: false, provisional: true };
}

let lastWarmAt = 0;
/** Browsers drop an unused preconnected socket after ~10 s, so re-open on focus / first keystroke, at most once per 8 s. */
export function warmRegistries(now = Date.now()): boolean {
  if (typeof document === "undefined" || now - lastWarmAt < 8000) return false;
  lastWarmAt = now;
  for (const origin of REGISTRY_ORIGINS) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    // The hint is consumed on insertion; the element itself is not needed afterwards.
    setTimeout(() => link.remove(), 1000);
  }
  return true;
}
