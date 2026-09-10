/**
 * Build-time per-route HTML.
 *
 * `index.html` carries two marked regions:
 *   <!-- route-head:start --> … <!-- route-head:end -->     (title, description, canonical, og/twitter)
 *   <!-- route-static:start --> … <!-- route-static:end --> (crawler-visible summary inside #root)
 *
 * `renderRouteHtml` swaps both regions for a given route. The head tags carry
 * `data-rh="true"` so react-helmet-async adopts them on mount instead of adding
 * duplicates: Helmet reconciles tags marked data-rh and keeps the ones that are
 * byte-identical to what the page renders.
 *
 * Pure function, no fs — the Vite plugin in scripts/prerender-plugin.ts does the I/O.
 */
import { canonicalUrl, type RouteMeta } from "./routes";

export const HEAD_START = "<!-- route-head:start -->";
export const HEAD_END = "<!-- route-head:end -->";
export const STATIC_START = "<!-- route-static:start -->";
export const STATIC_END = "<!-- route-static:end -->";

/** One robots meta per page: the indexable default (rich snippets allowed) or a plain noindex. */
export const INDEXABLE_ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
export const robotsDirective = (route: RouteMeta) => (route.noindex ? "noindex" : INDEXABLE_ROBOTS);

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The route-managed head tags, in the same shape Helmet renders them. */
export function renderHeadTags(route: RouteMeta): string {
  const url = canonicalUrl(route);
  const ogTitle = route.ogTitle ?? route.title;
  const ogDescription = route.ogDescription ?? route.description;
  const lines = [
    `<title data-rh="true">${escapeText(route.title)}</title>`,
    `<meta data-rh="true" name="description" content="${escapeAttr(route.description)}" />`,
    `<link data-rh="true" rel="canonical" href="${url}" />`,
    `<meta data-rh="true" property="og:title" content="${escapeAttr(ogTitle)}" />`,
    `<meta data-rh="true" property="og:description" content="${escapeAttr(ogDescription)}" />`,
    `<meta data-rh="true" property="og:type" content="${route.ogType ?? "website"}" />`,
    `<meta data-rh="true" property="og:url" content="${url}" />`,
    `<meta data-rh="true" name="twitter:title" content="${escapeAttr(ogTitle)}" />`,
    `<meta data-rh="true" name="twitter:description" content="${escapeAttr(ogDescription)}" />`,
    `<meta data-rh="true" name="robots" content="${robotsDirective(route)}" />`,
  ];
  return lines.map((l) => `    ${l}`).join("\n");
}

function replaceBetween(html: string, start: string, end: string, body: string, label: string): string {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a === -1 || b === -1 || b < a) {
    throw new Error(`prerender: ${label} markers missing from template`);
  }
  return `${html.slice(0, a + start.length)}\n${body}\n    ${html.slice(b)}`;
}

/** Render the template for one route. Works for aliases too: pass the canonical route, the head canonicalises. */
export function renderRouteHtml(template: string, route: RouteMeta): string {
  const withHead = replaceBetween(template, HEAD_START, HEAD_END, renderHeadTags(route), "route-head");
  return replaceBetween(withHead, STATIC_START, STATIC_END, route.staticHtml.trim(), "route-static");
}

/** File targets for a route (and its aliases): `<slug>/index.html` for directory-index hosts and `<slug>.html` for clean-URL hosts. */
export function outputPathsFor(path: string): string[] {
  if (path === "/") return ["index.html"];
  const slug = path.replace(/^\/+/, "");
  return [`${slug}/index.html`, `${slug}.html`];
}
