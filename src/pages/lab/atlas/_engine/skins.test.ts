import { describe, it, expect } from 'vitest';
import { ANCHORS, skinAt, skinKey } from './skins';
import { mixColor } from './color';
const [antique, atlas, modern] = ANCHORS;
describe('skinAt', () => {
  it('returns anchor tokens at anchor years', () => {
    expect(skinAt(1790).paper).toBe(antique.tokens.paper);
    expect(skinAt(2000).water).toBe(modern.tokens.water);
    expect(skinAt(1900).fontFrom).toBe('Inter');
  });
  it('clamps outside the anchors', () => {
    expect(skinAt(1700)).toEqual(skinAt(1790));
    expect(skinAt(2050)).toEqual(skinAt(2000));
  });
  it('blends midway', () => {
    const s = skinAt(1845);
    expect(s.borderWidth).toBeCloseTo((antique.tokens.borderWidth + atlas.tokens.borderWidth) / 2, 6);
    expect(s.paper).toBe(mixColor(antique.tokens.paper, atlas.tokens.paper, 0.5));
    expect(s.landPalette).toHaveLength(5);
  });
  it('cross-fades fonts only around the middle of a segment', () => {
    expect(skinAt(1810).fontMix).toBe(0);
    expect(skinAt(1845).fontMix).toBeCloseTo(0.5, 6);
    expect(skinAt(1880).fontMix).toBe(1);
    expect(skinAt(1845)).toMatchObject({ fontFrom: 'IM Fell English', fontTo: 'Inter' });
  });
  it('gives a stable key', () => { expect(skinKey(skinAt(1845))).toBe(skinKey(skinAt(1845))); });
});
