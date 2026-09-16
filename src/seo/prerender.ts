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
import { SITE_URL, canonicalUrl, type RouteMeta } from "./routes";

export const HEAD_START = "<!-- route-head:start -->";
export const HEAD_END = "<!-- route-head:end -->";
export const STATIC_START = "<!-- route-static:start -->";
export const STATIC_END = "<!-- route-static:end -->";
export const SHELL_START = "<!-- route-shell:start -->";
export const SHELL_END = "<!-- route-shell:end -->";

/** What deep routes show until React mounts: the home hero would be wrong there, and a no-JS crawler must not read it on /pricing. */
export const SPINNER_SHELL = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:inherit;">
        <div style="width:36px;height:36px;border-radius:50%;border:3px solid rgba(127,127,127,0.25);border-top-color:#3fe9be;animation:dmn-spin .8s linear infinite;"></div>
      </div>
      <style>@keyframes dmn-spin{to{transform:rotate(360deg)}}</style>`;

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
  // Emitted exactly as Helmet renders a <script type="application/ld+json">
  // child, so the tag is adopted on mount rather than duplicated.
  if (route.jsonLd) lines.push(`<script data-rh="true" type="application/ld+json">${route.jsonLd}</script>`);
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
  const withStatic = replaceBetween(withHead, STATIC_START, STATIC_END, route.staticHtml.trim(), "route-static");
  // The template's pre-hydration shell is the home hero + search input. Only "/" keeps it.
  if (route.path === "/") return withStatic;
  const a = withStatic.indexOf(SHELL_START);
  const b = withStatic.indexOf(SHELL_END);
  if (a === -1 || b === -1 || b < a) throw new Error("prerender: route-shell markers missing from template");
  return `${withStatic.slice(0, a)}${SPINNER_SHELL}${withStatic.slice(b + SHELL_END.length)}`;
}

/** Title shown for an unknown path before React mounts. Matches src/pages/NotFound.tsx. */
export const NOT_FOUND_TITLE = "404 — Lost in space | DigMyName";

/**
 * Unknown-path guard, injected into the SPA fallback (dist/index.html).
 *
 * The host answers 200 with that exact file for any extensionless path it has
 * no prerendered file for, so `/nope/deep/path` served the home page's head:
 * `index, follow` plus `<link rel=canonical href="https://digmyname.com/">`.
 * React's 404 page does set noindex — after ~210 KB of JS — so a crawler that
 * does not render saw an indexable duplicate of the home page on every junk URL.
 *
 * This runs in <head> before first paint and only when the current path is not
 * a route we ship: it flips robots to noindex, drops the canonical (a noindex
 * page must not also point at another one) and titles the page as the 404 it is.
 * On "/" and on every real route it does nothing.
 */
export function renderNotFoundGuard(knownPaths: string[]): string {
  const known = [...new Set(knownPaths.map((p) => (p === "/" ? "/" : p.replace(/\/+$/, ""))))].sort();
  return `<script>
      (function () {
        try {
          var known = ${JSON.stringify(known)};
          var p = location.pathname;
          while (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
          if (!p) p = "/";
          if (known.indexOf(p) !== -1) return;
          var robots = document.querySelector('meta[name="robots"]');
          if (robots) robots.setAttribute("content", "noindex");
          var canonical = document.querySelector('link[rel="canonical"]');
          if (canonical && canonical.parentNode) canonical.parentNode.removeChild(canonical);
          document.title = ${JSON.stringify(NOT_FOUND_TITLE)};
        } catch (e) {}
      })();
    </script>`;
}

/** Inject the guard just before </head>. Only the SPA fallback needs it. */
export function withNotFoundGuard(html: string, knownPaths: string[]): string {
  const i = html.indexOf("</head>");
  if (i === -1) throw new Error("prerender: </head> missing from template");
  return `${html.slice(0, i)}${renderNotFoundGuard(knownPaths)}\n  ${html.slice(i)}`;
}

/** File targets for a route (and its aliases): `<slug>/index.html` for directory-index hosts and `<slug>.html` for clean-URL hosts. */
export function outputPathsFor(path: string): string[] {
  if (path === "/") return ["index.html"];
  const slug = path.replace(/^\/+/, "");
  return [`${slug}/index.html`, `${slug}.html`];
}

/** A static redirect page for hosts without server redirects: canonical to the target, noindex, meta refresh, JS fallback keeps query and hash. */
export function renderRedirectHtml(to: string): string {
  const url = `${SITE_URL}${to}`;
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<title>Redirecting to ${escapeText(url)}</title>`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta name="robots" content="noindex" />`,
    `<meta http-equiv="refresh" content="0; url=${escapeAttr(to)}" />`,
    `<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>`,
    `</head>`,
    `<body><p>Moved to <a href="${escapeAttr(to)}">${escapeText(url)}</a>.</p></body>`,
    `</html>`,
  ].join("\n");
}
