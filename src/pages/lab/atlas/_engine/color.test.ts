import { describe, it, expect } from 'vitest';
import { mixColor, toRgba } from './color';
describe('color', () => {
  it('returns endpoints exactly', () => {
    expect(mixColor('#e8d9b5', '#0d0d0d', 0)).toBe('#e8d9b5');
    expect(mixColor('#e8d9b5', '#0d0d0d', 1)).toBe('#0d0d0d');
  });
  it('mixes perceptually (OKLab midpoint of black/white)', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#636363');
  });
  it('clamps t', () => { expect(mixColor('#000000', '#ffffff', 2)).toBe('#ffffff'); });
  it('converts to RGBA', () => {
    expect(toRgba('#39ff14')).toEqual([57, 255, 20, 255]);
    expect(toRgba('#39ff14', 0.5)).toEqual([57, 255, 20, 128]);
  });
});
