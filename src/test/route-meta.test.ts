import { describe, it, expect } from "vitest";
import { ROUTES, SITEMAP_ROUTES, SITE_URL, canonicalUrl, getRouteMeta } from "@/seo/routes";
import {
  HEAD_END,
  HEAD_START,
  SHELL_END,
  SHELL_START,
  STATIC_END,
  STATIC_START,
  outputPathsFor,
  renderHeadTags,
  renderRouteHtml,
} from "@/seo/prerender";

const template = `<!doctype html><html><head>
    ${HEAD_START}
    <title data-rh="true">OLD</title>
    ${HEAD_END}
    <meta property="og:site_name" content="DigMyName" />
  </head><body><div id="root">
      ${SHELL_START}
      <div class="hero"><input id="prehydrate-q" /></div>
      ${SHELL_END}
      <div>
        ${STATIC_START}
        <h1>OLD</h1>
        ${STATIC_END}
      </div></div></body></html>`;

describe("route table", () => {
  it("every route has a title, a description and crawler content with an h1", () => {
    for (const r of ROUTES) {
      expect(r.title.length, r.path).toBeGreaterThan(10);
      expect(r.description.length, r.path).toBeGreaterThan(40);
      expect(r.staticHtml, r.path).toMatch(/<h1>/);
    }
  });

  it("paths and aliases are unique and never collide", () => {
    const all = ROUTES.flatMap((r) => [r.path, ...(r.aliases ?? [])]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("resolves aliases to their canonical route", () => {
    expect(getRouteMeta("/about").path).toBe("/how-it-works");
    expect(getRouteMeta("/skill").path).toBe("/mcp");
    expect(getRouteMeta("/gpt").path).toBe("/mcp");
    expect(() => getRouteMeta("/nope")).toThrow(/Unknown route/);
  });

  it("the sitemap lists indexable canonical paths only", () => {
    const paths = SITEMAP_ROUTES.map((r) => r.path);
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/privacy");
    expect(paths).toContain("/terms");
    expect(paths).not.toContain("/favorites");
    expect(paths).not.toContain("/about");
  });

  it("canonical URLs use the apex host and no trailing slash except the root", () => {
    expect(canonicalUrl(getRouteMeta("/"))).toBe(`${SITE_URL}/`);
    expect(canonicalUrl(getRouteMeta("/speed"))).toBe(`${SITE_URL}/speed`);
  });
});

describe("prerender", () => {
  it("writes the route's own title, description, canonical and og:url", () => {
    const html = renderRouteHtml(template, getRouteMeta("/speed"));
    expect(html).toContain(`<title data-rh="true">Fastest domain search in the universe (or second) — DigMyName</title>`);
    expect(html).toContain(`<link data-rh="true" rel="canonical" href="https://digmyname.com/speed" />`);
    expect(html).toContain(`<meta data-rh="true" property="og:url" content="https://digmyname.com/speed" />`);
    expect(html).toContain(`<meta data-rh="true" property="og:type" content="article" />`);
    expect(html).not.toContain("OLD");
  });

  it("aliases canonicalise to the main path", () => {
    const html = renderRouteHtml(template, getRouteMeta("/about"));
    expect(html).toContain(`href="https://digmyname.com/how-it-works"`);
    expect(html).not.toContain("digmyname.com/about");
  });

  it("exactly one robots directive per page: noindex for private routes, the rich-snippet default otherwise", () => {
    const fav = renderHeadTags(getRouteMeta("/favorites"));
    expect(fav).toContain(`name="robots" content="noindex"`);
    expect(fav.match(/name="robots"/g)).toHaveLength(1);
    const pricing = renderHeadTags(getRouteMeta("/pricing"));
    expect(pricing).toContain(`name="robots" content="index, follow, max-snippet:-1`);
    expect(pricing.match(/name="robots"/g)).toHaveLength(1);
  });

  it("swaps the crawler block for the route's own content and keeps the rest of the template", () => {
    const html = renderRouteHtml(template, getRouteMeta("/api"));
    expect(html).toContain("<h1>Free domain availability API for agents and humans</h1>");
    expect(html).toContain(`<meta property="og:site_name" content="DigMyName" />`);
    expect(html).toContain(STATIC_START);
    expect(html).toContain(STATIC_END);
  });

  it("escapes quotes and angle brackets in attributes", () => {
    const html = renderHeadTags({ ...getRouteMeta("/"), title: `A "quoted" <title>`, description: "x & y" });
    expect(html).toContain(`<title data-rh="true">A "quoted" &lt;title&gt;</title>`);
    expect(html).toContain(`content="x &amp; y"`);
    expect(html).toContain(`og:title" content="A &quot;quoted&quot; &lt;title&gt;"`);
  });

  it("fails loudly when the template lost its markers", () => {
    expect(() => renderRouteHtml("<html></html>", getRouteMeta("/"))).toThrow(/route-head markers/);
  });

  it("emits both directory-index and clean-URL files for deep paths", () => {
    expect(outputPathsFor("/")).toEqual(["index.html"]);
    expect(outputPathsFor("/how-it-works")).toEqual(["how-it-works/index.html", "how-it-works.html"]);
  });

  it("keeps the pre-hydration hero shell on the home route only", () => {
    const home = renderRouteHtml(template, getRouteMeta("/"));
    expect(home).toContain('id="prehydrate-q"');
    expect(home).toContain(SHELL_START);
    const pricing = renderRouteHtml(template, getRouteMeta("/pricing"));
    expect(pricing).not.toContain('id="prehydrate-q"');
    expect(pricing).not.toContain(SHELL_START);
    expect(pricing).toContain("dmn-spin");
    // The crawler block survives the shell swap.
    expect(pricing).toContain("<h1>Domain pricing, side by side</h1>");
  });

  it("is idempotent on the home route: rendering the rendered output again gives the same file", () => {
    const once = renderRouteHtml(template, getRouteMeta("/"));
    const twice = renderRouteHtml(once, getRouteMeta("/"));
    expect(twice).toBe(once);
  });
});
