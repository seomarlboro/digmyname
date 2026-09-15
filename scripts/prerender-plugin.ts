// Vite plugin: after `vite build`, write one HTML file per route (and alias)
// with the route's own <title>/description/canonical/og tags and a crawler
// summary. Social scrapers and no-JS bots do not run React, so without this
// every shared deep link showed the home page's card. Static files on the
// deep paths also skip the host's SPA-fallback rewrite (slower TTFB).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import type { Plugin, ResolvedConfig } from "vite";
import { REDIRECTS, ROUTES } from "../src/seo/routes";
import { buildTldRoutes } from "../src/seo/tldRoutes";
import { outputPathsFor, renderRedirectHtml, renderRouteHtml } from "../src/seo/prerender";

export function prerenderRoutes(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "digmyname:prerender-routes",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const templatePath = join(outDir, "index.html");
      if (!existsSync(templatePath)) return;
      const template = readFileSync(templatePath, "utf8");

      // Static pages plus the per-extension price pages from the prebuild snapshot.
      const routes = [...ROUTES, ...buildTldRoutes()];
      let written = 0;
      for (const route of routes) {
        const html = renderRouteHtml(template, route);
        for (const path of [route.path, ...(route.aliases ?? [])]) {
          for (const rel of outputPathsFor(path)) {
            const target = join(outDir, rel);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, html);
            written++;
          }
        }
      }
      for (const { from, to } of REDIRECTS) {
        for (const rel of outputPathsFor(from)) {
          const target = join(outDir, rel);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, renderRedirectHtml(to));
          written++;
        }
      }
      config.logger.info(`prerender: ${written} route files written for ${routes.length} routes and ${REDIRECTS.length} redirects`);
    },
  };
}
