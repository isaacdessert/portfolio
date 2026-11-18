import { describe, it, expect } from 'vitest';
import { buildStyle, paintUpdates, TERRAIN_TILES } from './style';
import { skinAt } from './skins';
const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
const base = { land: empty, lakes: empty, rivers: empty };
describe('style', () => {
  it('builds a key-free style with terrain hillshade and base layers in order', () => {
    const st = buildStyle(skinAt(1790), base);
    expect(st.sources.dem).toMatchObject({ type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium' });
    expect(st.layers.map((l) => l.id)).toEqual(['water', 'land', 'hillshade', 'lakes', 'rivers', 'coast']);
    expect(JSON.stringify(st)).not.toMatch(/key=|access_token/);
  });
  it('emits paint updates that follow the skin', () => {
    const ups = paintUpdates(skinAt(2000));
    expect(ups).toContainEqual(['water', 'background-color', skinAt(2000).water]);
    expect(ups).toContainEqual(['hillshade', 'hillshade-exaggeration', skinAt(2000).hillshade]);
  });
});
