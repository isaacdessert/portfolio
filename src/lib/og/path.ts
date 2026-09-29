/** The og:image path for a page pathname. */
export function ogImageFor(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/og-default.png';

  const [first, second] = segments;
  if ((first === 'lab' || first === 'blog') && second) {
    return `/og/${first}/${second}.png`;
  }
  return `/og/${first}.png`;
}
