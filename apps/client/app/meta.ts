import type { MetaDescriptor } from "react-router";

/**
 * The production client origin. Canonical URLs and Open Graph URLs always name
 * production, including on staging, so a shared staging link never becomes the
 * page search engines index. Keep in step with `client_host`/`dns_zone_name` in
 * `infra/terraform/variables.tf` and `docs/hosting.md`.
 */
export const SITE_URL = "https://castle-clash.atomic-nucleus.com";

export const SITE_NAME = "Castle Clash";
export const DEFAULT_DESCRIPTION =
  "A free 2D knight arena brawler for 2 to 6 players. Draft power-ups between rounds and be the last knight standing. Play in your browser, no account needed.";

export interface PageMeta {
  /** Page title without the site name; omit for the home page. */
  title?: string;
  description?: string;
  /** Path under the site, e.g. `/privacy`. */
  path: string;
}

/**
 * Title, description, canonical link, Open Graph and Twitter card tags for one
 * route. The root route calls this for the default; a route's own `meta` export
 * replaces the parent's wholesale, so each page passes its own.
 */
export function pageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
}: PageMeta): MetaDescriptor[] {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME}: knight arena brawler`;
  const url = `${SITE_URL}${path === "/" ? "" : path}`;
  const image = `${SITE_URL}/og.png`;
  return [
    { title: fullTitle },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url === SITE_URL ? `${SITE_URL}/` : url },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Castle Clash: last knight standing takes the castle." },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

/**
 * For pages behind sign-in or without content of their own (lobby, stats, the
 * game, 404): a plain title and a `noindex`, so search engines skip them.
 */
export function privatePageMeta(title: string): MetaDescriptor[] {
  return [{ title: `${title} | ${SITE_NAME}` }, { name: "robots", content: "noindex" }];
}
