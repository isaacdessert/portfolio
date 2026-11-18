export type Series = Record<string, number>;

/** Value at a fractional year: exponential between positive census points, linear otherwise; 0 before the first; holds the last. */
export function valueAtYear(series: Series, year: number): number {
  const pts = Object.entries(series).map(([k, v]) => [Number(k), v] as const)
    .filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  if (pts.length === 0 || year < pts[0][0]) return 0;
  const last = pts[pts.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, v0] = pts[i];
    const [y1, v1] = pts[i + 1];
    if (year < y0 || year > y1) continue;
    const t = (year - y0) / (y1 - y0);
    return v0 > 0 && v1 > 0 ? v0 * Math.pow(v1 / v0, t) : v0 + (v1 - v0) * t;
  }
  return 0;
}
