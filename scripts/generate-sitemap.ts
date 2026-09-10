// Runs before `vite dev` and `vite build`; writes public/sitemap.xml from the
// shared route table (src/seo/routes.ts) so the sitemap, the pages' <head> and
// the prerendered HTML can never disagree about which URLs exist.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { SITEMAP_ROUTES, canonicalUrl } from "../src/seo/routes";

export function generateSitemap(): string {
  const urls = SITEMAP_ROUTES.map((r) =>
    [
      `  <url>`,
      `    <loc>${canonicalUrl(r)}</loc>`,
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

const target = resolve("public/sitemap.xml");
writeFileSync(target, generateSitemap());
console.log(`sitemap.xml written (${SITEMAP_ROUTES.length} entries)`);
