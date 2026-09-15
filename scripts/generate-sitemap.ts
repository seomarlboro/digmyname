// Runs before `vite dev` and `vite build`; writes public/sitemap.xml from the
// shared route table (src/seo/routes.ts) plus the per-extension price pages
// (src/seo/tldRoutes.ts), so the sitemap, the pages' <head> and the prerendered
// HTML can never disagree about which URLs exist. Runs after
// generate-tld-prices.ts, which refreshes the snapshot those pages come from.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { SITEMAP_ROUTES, canonicalUrl, type RouteMeta } from "../src/seo/routes";
import { buildTldRoutes } from "../src/seo/tldRoutes";

export function sitemapRoutes(): RouteMeta[] {
  return [...SITEMAP_ROUTES, ...buildTldRoutes().filter((r) => !r.noindex)];
}

export function generateSitemap(routes: RouteMeta[] = sitemapRoutes()): string {
  const urls = routes.map((r) =>
    [
      `  <url>`,
      `    <loc>${canonicalUrl(r)}</loc>`,
      r.lastmod ? `    <lastmod>${r.lastmod}</lastmod>` : null,
      r.changefreq ? `    <changefreq>${r.changefreq}</changefreq>` : null,
      r.priority ? `    <priority>${r.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

const routes = sitemapRoutes();
writeFileSync(resolve("public/sitemap.xml"), generateSitemap(routes));
console.log(`sitemap.xml written (${routes.length} entries)`);
