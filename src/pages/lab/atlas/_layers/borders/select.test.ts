import { describe, it, expect } from 'vitest';
import topo from '../../_data/borders.topo.json';
import { parseBorders } from './index';
import { featuresAt, paletteIndex } from './select';
const { features } = parseBorders(topo);
describe('featuresAt', () => {
  it('switches Virginia versions exactly on 1863-06-20', () => {
    const va = (d: string) => featuresAt(features, d).filter((f) => f.properties.id === 'va_state');
    expect(va('1863-06-19')).toHaveLength(1);
    expect(va('1863-06-20')).toHaveLength(1);
    expect(va('1863-06-19')[0].properties.start).not.toBe(va('1863-06-20')[0].properties.start);
  });
  it('treats current shapes as open-ended', () => {
    expect(featuresAt(features, '2020-01-01').filter((f) => f.properties.kind === 'state')).toHaveLength(50);
  });
});
describe('paletteIndex', () => {
  it('is stable and in range', () => {
    expect(paletteIndex('va_state')).toBe(paletteIndex('va_state'));
    for (const f of features) expect(paletteIndex(f.properties.id)).toBeGreaterThanOrEqual(0), expect(paletteIndex(f.properties.id)).toBeLessThan(5);
  });
});
