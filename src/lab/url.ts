export const SITE_ORIGIN = 'https://isaacjdessert.dev';

/** Absolute URL on the main site. Use for links that must work from a subdomain. */
export function siteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href;
}

/**
 * Root-relative URL inside a lab project. Always use this (never "./api/x"):
 * `/lab/...` paths are excluded from the subdomain rewrite, so they work on
 * both isaacjdessert.dev/lab/<slug> and <slug>.isaacjdessert.dev.
 */
export function labUrl(slug: string, path = ''): string {
  return `/lab/${slug}/${path.replace(/^\/+/, '')}`;
}
