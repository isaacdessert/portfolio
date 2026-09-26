// Shared by src/lab/meta.ts (TypeScript) and scripts/new-lab.mjs (plain Node),
// so it is plain JS.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 40;
export const RESERVED_SLUGS = ['www', 'api', 'lab'];

/**
 * @param {unknown} slug
 * @returns {string | null} a human-readable problem, or null if valid
 */
export function slugError(slug) {
  if (typeof slug !== 'string' || slug.length === 0) return 'Slug is required';
  if (slug.length > SLUG_MAX_LENGTH) return `Slug must be ${SLUG_MAX_LENGTH} characters or fewer`;
  if (!SLUG_PATTERN.test(slug)) return 'Slug must be lowercase kebab-case (a-z, 0-9, single hyphens)';
  if (RESERVED_SLUGS.includes(slug)) return `Slug "${slug}" is reserved`;
  return null;
}

/**
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isValidSlug(slug) {
  return slugError(slug) === null;
}
