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

const US_TOTAL: Record<number, number> = {
  1790: 3929214, 1800: 5308483, 1810: 7239881, 1820: 9638453, 1830: 12866020, 1840: 17069453,
  1850: 23191876, 1860: 31443321, 1870: 38558371, 1880: 50189209, 1890: 62979766, 1900: 76212168,
  1910: 92228496, 1920: 106021537, 1930: 123202624, 1940: 132164569, 1950: 151325798, 1960: 179323175,
  1970: 203211926, 1980: 226545805, 1990: 248709873, 2000: 281421906, 2010: 308745538, 2020: 331449281,
};

describe('population.json', async () => {
  const population = await import('./population.json', { assert: { type: 'json' } }).then((m) => m.default);
  const states = population.states as Record<string, Record<string, number>>;
  it('has 50 states + DC with a 2020 count', () => {
    expect(Object.keys(states)).toHaveLength(51);
    for (const [abbr, series] of Object.entries(states)) {
      expect(abbr).toMatch(/^[A-Z]{2}$/);
      expect(series['2020']).toBeGreaterThan(500_000);
    }
  });
  it('only has decennial census years with non-negative integers', () => {
    for (const series of Object.values(states)) for (const [y, v] of Object.entries(series)) {
      expect(Number(y) % 10).toBe(0);
      expect(Number.isInteger(v) && v >= 0).toBe(true);
    }
  });
  it.each(Object.keys(US_TOTAL))('sums to the national total in %s (±0.1%)', (year) => {
    const sum = Object.values(states).reduce((a, s) => a + (s[year] ?? 0), 0);
    expect(Math.abs(sum - US_TOTAL[Number(year)]) / US_TOTAL[Number(year)]).toBeLessThan(0.001);
  });
  it('cites its source', () => {
    expect(population.meta.boundaries).toBe('present-day state boundaries');
    expect(population.meta.url).toMatch(/wikipedia\.org/);
  });
});
