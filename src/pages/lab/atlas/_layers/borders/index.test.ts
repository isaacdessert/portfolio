import { describe, it, expect } from 'vitest';
import topo from '../../_data/borders.topo.json';
import { skinAt } from '../../_engine/skins';
import { toRgba } from '../../_engine/color';
import { borders, parseBorders } from './index';
const data = parseBorders(topo);
const state = (year: number) => ({ year, skin: skinAt(year), phase: '2d' as const, depth: 0 });
describe('borders layer', () => {
  it('renders the polygons in effect for the year plus labels', () => {
    const layers = borders.render(data, state(1850.5));
    const poly = layers.find((l) => l.id === 'borders-polygons')!;
    const fc = poly.props.data as GeoJSON.FeatureCollection;
    expect(fc.features.length).toBeGreaterThan(30);
    expect(fc.features.every((f) => f.properties!.start <= '1850-07-02' && '1850-07-02' <= f.properties!.end)).toBe(true);
    expect(layers.some((l) => l.id.startsWith('borders-labels'))).toBe(true);
  });
  it('colours states from the palette and territories from the territory token', () => {
    const s = state(1850.5);
    const poly = borders.render(data, s).find((l) => l.id === 'borders-polygons')!;
    const fill = poly.props.getFillColor as (f: any) => number[];
    const fc = poly.props.data as GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
    const terr = fc.features.find((f) => f.properties.kind === 'territory')!;
    expect(fill(terr)).toEqual(toRgba(s.skin.territory, 0.85));
  });
  it('renders a second label layer only during a font cross-fade', () => {
    expect(borders.render(data, state(1810)).filter((l) => l.id.startsWith('borders-labels'))).toHaveLength(1);
    expect(borders.render(data, state(1845)).filter((l) => l.id.startsWith('borders-labels'))).toHaveLength(2);
  });
});
