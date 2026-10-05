import { describe, it, expect } from 'vitest';
import { valueAtYear } from './interpolate';
const s = { '1800': 100, '1810': 400, '1820': 0, '1830': 50 };
describe('valueAtYear', () => {
  it('returns census values exactly', () => { expect(valueAtYear(s, 1810)).toBe(400); });
  it('interpolates exponentially between positive points', () => { expect(valueAtYear(s, 1805)).toBeCloseTo(200, 6); });
  it('interpolates linearly when a point is zero', () => { expect(valueAtYear(s, 1825)).toBeCloseTo(25, 6); });
  it('is 0 before the first census and holds the last after', () => {
    expect(valueAtYear(s, 1700)).toBe(0);
    expect(valueAtYear(s, 2050)).toBe(50);
  });
  it('handles empty series', () => { expect(valueAtYear({}, 1900)).toBe(0); });
});
