export type BorderKind = 'state' | 'territory' | 'other';
export interface BorderProps { id: string; name: string; kind: BorderKind; start: string; end: string; lx: number; ly: number }
export type BorderFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, BorderProps>;

/** Shapes in effect on an ISO date (start and end inclusive; ISO strings compare chronologically). */
export function featuresAt(features: BorderFeature[], date: string): BorderFeature[] {
  return features.filter((f) => f.properties.start <= date && date <= f.properties.end);
}

/** Stable palette slot (0..4) per state id, so a state keeps its atlas colour across versions. */
export function paletteIndex(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 5;
}
