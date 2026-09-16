/**
 * Route meta and crawler HTML for /tld and /tld/<tld>, built from the prebuild
 * price snapshot (scripts/generate-tld-prices.ts).
 *
 * Kept out of routes.ts on purpose: routes.ts is in the main bundle (every
 * page's <RouteHead>), the snapshot must not be. Only the build scripts and the
 * lazy /tld page chunks import this file. Node-safe: it runs during the build.
 *
 * Title and description numbers come from the snapshot. The prerendered HTML is
 * therefore as fresh as the last deploy; the page body refreshes live in the
 * browser and every price shows its own verification date.
 */
import snapshotJson from "../generated/tld-prices.json";
import { SITE_URL, type RouteMeta } from "./routes";
import { isSearchableTld } from "../lib/searchableTlds";
import {
  TLD_HUB_PATH,
  buildHub,
  buildTldPage,
  formatDay,
  usd,
  type HubEntry,
  type TldHub,
  type TldPage,
  type TldSnapshot,
} from "../lib/tldPages";

export const TLD_SNAPSHOT = snapshotJson as TldSnapshot;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderTldStatic(page: TldPage): string {
  const rows = page.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.registrar)}</td><td>${usd(r.reg)}/yr</td><td>${usd(r.renew)}/yr</td><td>${
          r.transfer != null ? usd(r.transfer) : "—"
        }</td><td>${usd(r.threeYear)}</td><td>${formatDay(r.verifiedAt)}${r.stale ? " (stale)" : ""}</td></tr>`,
    )
    .join("\n");
  return [
    `<h1>${esc(page.h1)}</h1>`,
    `<p>${esc([page.lede, page.verifiedLine].filter(Boolean).join(" "))}</p>`,
    page.rows.length
      ? `<table>\n<thead><tr><th>Registrar</th><th>Register</th><th>Renew</th><th>Transfer</th><th>3 years</th><th>Verified</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`
      : "",
    page.trapLine ? `<h2>Renewal price</h2>\n<p>${esc(page.trapLine)}</p>` : "",
    page.hiddenLines.length ? `<h2>Not shown</h2>\n<ul>${page.hiddenLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "",
    `<h2>${page.indexable || isSearchableTld(page.tld) ? `How availability of .${esc(page.tld)} is checked` : `Availability of .${esc(page.tld)} names`}</h2>\n<p>${esc(page.checkLines.join(" "))}</p>`,
    `<p><a href="${TLD_HUB_PATH}">All domain extensions</a> · <a href="/pricing">Pricing overview</a> · <a href="/">Search a domain</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** One hub line; a single-registrar extension gets its price, not a "from". */
export function hubEntryText(e: HubEntry): string {
  if (!e.lowestReg || !e.lowestRenew) return "";
  return e.registrarCount === 1
    ? `register ${usd(e.lowestReg.price)}/yr, renew ${usd(e.lowestRenew.price)}/yr at ${e.lowestReg.registrar} (one registrar)`
    : `register from ${usd(e.lowestReg.price)}/yr, renew from ${usd(e.lowestRenew.price)}/yr at ${e.registrarCount} registrars`;
}

export function renderHubStatic(hub: TldHub): string {
  return [
    `<h1>${esc(hub.h1)}</h1>`,
    `<p>${esc(hub.lede)}</p>`,
    `<ul>\n${hub.entries.map((e) => `<li><a href="${e.path}">.${esc(e.tld)}</a> — ${esc(hubEntryText(e))}</li>`).join("\n")}\n</ul>`,
    `<p><a href="/pricing">Pricing overview</a> · <a href="/">Search a domain</a></p>`,
  ].join("\n");
}

/** The only structured data on these pages: a breadcrumb trail (no Product/Offer — nothing is sold here; no FAQPage). */
export function breadcrumbJsonLd(items: { name: string; path: string }[]): string {
  // "<" escaped so the string is safe inside a <script> block and, more to the
  // point, byte-identical whether it is written by the build-time prerender or
  // by Helmet on mount — Helmet only adopts a static tag it matches exactly.
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${it.path}`,
    })),
  }).replace(/</g, "\\u003c");
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : undefined);

export function tldPageRoute(page: TldPage): RouteMeta {
  return {
    path: page.path,
    title: page.title,
    description: page.description,
    noindex: !page.indexable,
    changefreq: "weekly",
    priority: "0.6",
    lastmod: day(page.newestVerifiedAt),
    jsonLd: breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Domain prices", path: TLD_HUB_PATH },
      { name: `.${page.tld}`, path: page.path },
    ]),
    staticHtml: renderTldStatic(page),
  };
}

export function tldHubRoute(hub: TldHub): RouteMeta {
  return {
    path: TLD_HUB_PATH,
    title: hub.title,
    description: hub.description,
    changefreq: "weekly",
    priority: "0.7",
    lastmod: day(hub.newestVerifiedAt),
    jsonLd: breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Domain prices", path: TLD_HUB_PATH },
    ]),
    staticHtml: renderHubStatic(hub),
  };
}

/** The hub plus one route per extension with at least one price fresh enough to show. */
export function buildTldRoutes(snapshot: TldSnapshot = TLD_SNAPSHOT, now = Date.now()): RouteMeta[] {
  const pages = snapshot.tlds.map((t) => buildTldPage(t, now)).filter((p) => p.registrarCount > 0);
  return [tldHubRoute(buildHub(snapshot, now)), ...pages.map(tldPageRoute)];
}
