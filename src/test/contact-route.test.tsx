import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import App from "@/App";
import { REDIRECTS, ROUTES, SITEMAP_ROUTES, getRouteMeta } from "@/seo/routes";
import { outputPathsFor, renderRedirectHtml } from "@/seo/prerender";
import { buildTldRoutes } from "@/seo/tldRoutes";
import sitemapXml from "../../public/sitemap.xml?raw";

describe("/contact and /imprint", () => {
  it("/contact is a real, indexable route in the sitemap; /imprint is only a redirect", () => {
    expect(getRouteMeta("/contact").noindex).toBeFalsy();
    expect(SITEMAP_ROUTES.map((r) => r.path)).toContain("/contact");
    expect(sitemapXml).toContain("<loc>https://digmyname.com/contact</loc>");
    expect(sitemapXml).not.toContain("imprint");
    expect(REDIRECTS).toContainEqual({ from: "/imprint", to: "/contact" });
    const routePaths = ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]);
    for (const { from, to } of REDIRECTS) {
      expect(routePaths).not.toContain(from);
      expect(routePaths).toContain(to);
    }
  });

  it("the sitemap file lists every sitemap route and nothing else", () => {
    const locs = [...sitemapXml.matchAll(/<loc>https:\/\/digmyname\.com([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
    // Static routes, then the indexable per-extension price pages (src/seo/tldRoutes.ts).
    const tldPaths = buildTldRoutes().filter((r) => !r.noindex).map((r) => r.path);
    expect(locs).toEqual([...SITEMAP_ROUTES.map((r) => r.path), ...tldPaths]);
  });

  it("the prerendered /imprint page redirects to /contact, canonicalises there and is not indexed", () => {
    expect(outputPathsFor("/imprint")).toEqual(["imprint/index.html", "imprint.html"]);
    const html = renderRedirectHtml("/contact");
    expect(html).toContain(`<link rel="canonical" href="https://digmyname.com/contact" />`);
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=/contact" />`);
    expect(html).toContain(`<meta name="robots" content="noindex" />`);
    expect(html).toContain(`location.replace("/contact"`);
  });

  it("the app sends /imprint to /contact and renders the contact page with its canonical", async () => {
    window.history.pushState({}, "", "/imprint");
    render(
      <HelmetProvider>
        <App />
      </HelmetProvider>,
    );
    await waitFor(() => expect(window.location.pathname).toBe("/contact"));
    expect(await screen.findByRole("heading", { level: 1, name: /Something looks wrong/i })).toBeInTheDocument();
    const mail = screen.getAllByRole("link", { name: "hello@digmyname.com" });
    expect(mail[0]).toHaveAttribute("href", "mailto:hello@digmyname.com");
    const issueLinks = screen.getAllByRole("link", { name: "GitHub" }).map((l) => l.getAttribute("href"));
    expect(issueLinks).toContain("https://github.com/seomarlboro/digmyname/issues/new");
    await waitFor(() =>
      expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://digmyname.com/contact"),
    );
    expect(screen.getAllByRole("link", { name: "Contact" }).some((l) => l.getAttribute("href") === "/contact")).toBe(true);
    window.history.pushState({}, "", "/");
  });
});
