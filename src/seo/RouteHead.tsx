import { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { canonicalUrl, getRouteMeta, type RouteMeta } from "./routes";
import { robotsDirective } from "./prerender";

/**
 * Per-route <head> from the shared route table. Renders exactly the tag set
 * that the build-time prerender writes (see src/seo/prerender.ts), so Helmet
 * adopts the static tags on mount instead of duplicating them. Page-specific
 * JSON-LD goes in as children. Generated routes (/tld/*) pass their meta as
 * `route`, since they are not in the static table.
 */
export const RouteHead = ({ path, route: given, children }: { path?: string; route?: RouteMeta; children?: ReactNode }) => {
  const route = given ?? getRouteMeta(path ?? "");
  const url = canonicalUrl(route);
  const ogTitle = route.ogTitle ?? route.title;
  const ogDescription = route.ogDescription ?? route.description;
  return (
    <Helmet>
      <title>{route.title}</title>
      <meta name="description" content={route.description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:type" content={route.ogType ?? "website"} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={ogDescription} />
      <meta name="robots" content={robotsDirective(route)} />
      {children}
    </Helmet>
  );
};

export default RouteHead;
