/**
 * Private, first-party product analytics — table `public.site_events`
 * (schema and rules: docs/DIGMYNAME_ARCHITECTURE.md §12).
 *
 * The one rule: **search queries and domain names are never logged.** Nothing
 * here takes a free-text field. Every property is whitelisted per event and
 * validated to a shape that cannot hold a name (a TLD has no dot, a target or a
 * marketplace is one of a fixed list), and the table has no column that could hold one either.
 *
 * Off the critical path by construction: `trackSiteEvent` only pushes a row
 * onto an in-memory queue. One batched `fetch(keepalive)` leaves
 * FLUSH_DELAY_MS later (well after the first answer and the authoritative
 * wave), or right away when the tab is hidden (a buy link opening a new tab).
 * No referrer is sent (the page URL carries `?q=<name>`), no cookie, no user
 * token — only the public anon key. Every failure is swallowed.
 */

export type SiteEventName =
  | "search_started"
  | "first_answer"
  | "buy_click"
  | "aftermarket_click"
  | "whois_click"
  | "visit_click"
  | "favorite_add"
  | "api_copy"
  | "mcp_copy"
  | "pricing_tld_view";

/** Which lane stopped the stopwatch: registry from the browser, DNS pre-check, or the edge. */
export type FirstAnswerLane = "browser" | "fast" | "edge";
/** What the Buy button offered: a standard price, a premium name, or no price ("Check price"). */
export type BuyOffer = "available" | "premium" | "check_price";

export interface SiteEventProps {
  /** Length of the typed text — never the text. */
  queryLength?: number;
  /** The typed text ended in an extension we track. */
  tldTyped?: boolean;
  /** Names in the wave. */
  tldCount?: number;
  ms?: number;
  lane?: FirstAnswerLane;
  registrar?: string;
  /** Extension only, without the dot. */
  tld?: string;
  /** 1-based position of the card inside its result section. */
  position?: number;
  /** The card showed the lowest first-year price among the available cards on screen. */
  cheapest?: boolean;
  offer?: BuyOffer;
  marketplace?: string;
  /** What was copied: the snippet tab's label (mapped to a fixed list, else "other"). */
  target?: string;
  signedIn?: boolean;
  layout?: "cards" | "compact";
}

/** Exactly the columns anon may insert (the migration grants INSERT on these and nothing else). */
export const SITE_EVENT_COLUMNS = [
  "session_id",
  "event",
  "page",
  "device",
  "env",
  "query_length",
  "tld_typed",
  "tld_count",
  "ms",
  "lane",
  "registrar",
  "tld",
  "position",
  "cheapest",
  "offer",
  "marketplace",
  "target",
  "signed_in",
  "layout",
] as const;

export type SiteEventRow = Record<(typeof SITE_EVENT_COLUMNS)[number], string | number | boolean | null>;

const ALLOWED: Record<SiteEventName, (keyof SiteEventProps)[]> = {
  search_started: ["queryLength", "tldTyped", "tldCount"],
  first_answer: ["ms", "lane"],
  buy_click: ["registrar", "tld", "position", "cheapest", "offer", "layout"],
  aftermarket_click: ["marketplace", "tld", "position", "layout"],
  whois_click: ["tld", "position", "layout"],
  visit_click: ["tld", "position", "layout"],
  favorite_add: ["tld", "position", "signedIn"],
  api_copy: ["target"],
  mcp_copy: ["target"],
  pricing_tld_view: ["tld"],
};

const REGISTRARS = new Set(["Namecheap", "Cloudflare", "Porkbun", "GoDaddy", "Spaceship", "OVHcloud"]);
const MARKETPLACES: Record<string, string> = { sedo: "sedo", "dan.com": "dan", dan: "dan", afternic: "afternic", aftermarket: "aftermarket" };
const LANES = new Set(["browser", "fast", "edge"]);
const OFFERS = new Set(["available", "premium", "check_price"]);
const LAYOUTS = new Set(["cards", "compact"]);
const TLD_RE = /^[a-z0-9-]{2,24}$/;
/** Snippet tabs on /api and /mcp, slugified. Anything else becomes "other". */
const TARGETS = new Set(["curl", "javascript", "python", "response", "claude_code", "claude_desktop_config_json"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Mirrors useIsMobile's breakpoint. */
const MOBILE_MAX_WIDTH = 767;
const FLUSH_DELAY_MS = 2000;
const MAX_BATCH = 20;
const MAX_QUEUE = 100;
const SESSION_KEY = "dmn_sid";

const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const oneOf = (v: unknown, set: Set<string>) => (typeof v === "string" && set.has(v) ? v : null);

function target(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return TARGETS.has(s) ? s : "other";
}

function pageOf(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return "search";
  const known = ["/pricing", "/api", "/mcp", "/favorites"];
  return known.includes(p) ? p.slice(1) : "other";
}

function envOf(hostname: string): "prod" | "dev" | "preview" {
  if (hostname === "digmyname.com" || hostname === "www.digmyname.com") return "prod";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".local")) return "dev";
  return "preview";
}

let memorySessionId: string | null = null;

function newUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Random per-tab id in sessionStorage (gone when the tab closes); in memory if storage is blocked. */
function sessionId(): string {
  if (memorySessionId) return memorySessionId;
  let id: string | null = null;
  try {
    id = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    /* storage blocked */
  }
  if (!id || !UUID_RE.test(id)) {
    id = newUuid();
    try {
      window.sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      /* storage blocked — the id lives in memory for this page load */
    }
  }
  memorySessionId = id;
  return id;
}

/**
 * Builds the row that would be sent, or null for an unknown event. Pure apart
 * from reading the window (path, width, host) and the session id. Anything not
 * whitelisted for the event, or not of the expected shape, becomes null.
 */
export function buildSiteEventRow(event: SiteEventName, props: SiteEventProps = {}): SiteEventRow | null {
  const allowed = ALLOWED[event];
  if (!allowed) return null;
  const has = (k: keyof SiteEventProps) => allowed.includes(k) ? props[k] : undefined;
  const marketplace = has("marketplace");
  return {
    session_id: sessionId(),
    event,
    page: pageOf(window.location.pathname),
    device: window.innerWidth <= MOBILE_MAX_WIDTH ? "mobile" : "desktop",
    env: envOf(window.location.hostname),
    query_length: int(has("queryLength"), 1, 253),
    tld_typed: bool(has("tldTyped")),
    tld_count: int(has("tldCount"), 1, 500),
    ms: int(has("ms"), 0, 120_000),
    lane: oneOf(has("lane"), LANES),
    registrar: oneOf(has("registrar"), REGISTRARS),
    tld: typeof has("tld") === "string" && TLD_RE.test(has("tld") as string) ? (has("tld") as string) : null,
    position: int(has("position"), 1, 500),
    cheapest: bool(has("cheapest")),
    offer: oneOf(has("offer"), OFFERS),
    marketplace: typeof marketplace === "string" ? (MARKETPLACES[marketplace.trim().toLowerCase()] ?? "other") : null,
    target: target(has("target")),
    signed_in: bool(has("signedIn")),
    layout: oneOf(has("layout"), LAYOUTS),
  };
}

let queue: SiteEventRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let hideListener = false;

function sendingEnabled(): boolean {
  if (typeof window === "undefined" || typeof fetch !== "function") return false;
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) return false;
  // Automated browsers (the first-answer benchmark runs 300 of them against
  // prod) would swamp the funnel. Local dev stays on so events can be checked.
  if (typeof navigator !== "undefined" && navigator.webdriver && envOf(window.location.hostname) !== "dev") return false;
  return true;
}

function send(batch: SiteEventRow[]) {
  const base = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "");
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  // A legacy anon key is itself the JWT; a publishable key must not be sent as a bearer.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  try {
    void fetch(`${base}/rest/v1/site_events`, {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers,
      body: JSON.stringify(batch),
    }).catch(() => {});
  } catch {
    /* fetch threw synchronously (offline, blocked) — analytics never breaks the page */
  }
}

/** Sends everything queued. Called by the timer and when the tab is hidden. */
export function flushSiteEvents() {
  try {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!queue.length || !sendingEnabled()) return;
    const pending = queue;
    queue = [];
    for (let i = 0; i < pending.length; i += MAX_BATCH) send(pending.slice(i, i + MAX_BATCH));
  } catch {
    /* noop */
  }
}

/** Queues one event. Never throws, never awaits, never touches the network itself. */
export function trackSiteEvent(event: SiteEventName, props?: SiteEventProps) {
  try {
    if (!sendingEnabled()) return;
    const row = buildSiteEventRow(event, props);
    if (!row || queue.length >= MAX_QUEUE) return;
    queue.push(row);
    if (!hideListener) {
      hideListener = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushSiteEvents();
      });
      window.addEventListener("pagehide", flushSiteEvents);
    }
    if (timer == null) timer = setTimeout(flushSiteEvents, FLUSH_DELAY_MS);
  } catch {
    /* noop */
  }
}

/** Test hook: forget the queue, timer and session id. */
export function resetSiteEventsForTests() {
  if (timer != null) clearTimeout(timer);
  timer = null;
  queue = [];
  memorySessionId = null;
}
