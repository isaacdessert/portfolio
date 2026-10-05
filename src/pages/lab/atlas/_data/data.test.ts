import { describe, it, expect } from 'vitest';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import bordersTopo from './borders.topo.json';
import centroids from './centroids.json';

type BorderProps = { id: string; name: string; kind: 'state' | 'territory' | 'other'; start: string; end: string; lx: number; ly: number };
const topo = bordersTopo as unknown as Topology & { metadata: Record<string, string> };
const borders = (feature(topo, topo.objects.borders) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, BorderProps>).features;
const activeOn = (date: string) => borders.filter((f) => f.properties.start <= date && date <= f.properties.end);
const statesOn = (date: string) => activeOn(date).filter((f) => f.properties.kind === 'state');

function eachCoord(g: GeoJSON.Geometry, fn: (c: number[]) => void) {
  const walk = (a: unknown): void => { if (typeof (a as number[])[0] === 'number') fn(a as number[]); else (a as unknown[]).forEach(walk); };
  walk((g as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
}

describe('borders.topo.json', () => {
  it('carries license metadata', () => {
    expect(topo.metadata.license).toBe('CC BY-NC-SA 2.5');
    expect(topo.metadata.attribution).toMatch(/Newberry/);
  });
  it('has well-formed properties', () => {
    for (const f of borders) {
      expect(f.properties.id).toMatch(/^[a-z]{2}_[a-z_]+$/);
      expect(['state', 'territory', 'other']).toContain(f.properties.kind);
      expect(f.properties.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.properties.end >= f.properties.start).toBe(true);
    }
  });
  it('matches known state counts', () => {
    expect(statesOn('1850-01-01')).toHaveLength(30);
    expect(statesOn('1960-01-01')).toHaveLength(50);
    expect(statesOn('2020-06-01')).toHaveLength(50);
  });
  it('splits West Virginia from Virginia on 1863-06-20', () => {
    expect(statesOn('1863-06-19').map((f) => f.properties.id)).not.toContain('wv_state');
    expect(statesOn('1863-06-20').map((f) => f.properties.id)).toContain('wv_state');
  });
  it('splits Dakota Territory on 1889-11-02', () => {
    const ids = (d: string) => activeOn(d).map((f) => f.properties.id);
    expect(ids('1889-11-01')).toContain('dk_terr');
    expect(ids('1889-11-02')).toEqual(expect.arrayContaining(['nd_state', 'sd_state']));
    expect(ids('1889-11-02')).not.toContain('dk_terr');
  });
  it('never has two versions of the same id active on one day', () => {
    for (const d of ['1790-06-01', '1863-06-19', '1863-06-20', '1889-11-02', '1959-08-21']) {
      const ids = activeOn(d).map((f) => f.properties.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('stays in the western hemisphere (no antimeridian slivers)', () => {
    for (const f of borders) eachCoord(f.geometry, ([lon, lat]) => {
      expect(lon).toBeGreaterThanOrEqual(-180); expect(lon).toBeLessThanOrEqual(-60);
      expect(lat).toBeGreaterThanOrEqual(15); expect(lat).toBeLessThanOrEqual(72);
    });
  });
});

describe('centroids.json', () => {
  it('has the 50 states plus DC', () => {
    expect(Object.keys(centroids)).toHaveLength(51);
    expect(centroids).toHaveProperty('DC');
    expect((centroids as Record<string, number[]>).CA[0]).toBeLessThan(-114);
  });
});
