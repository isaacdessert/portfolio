import { describe, it, expect } from 'vitest';
import { yearToDate, dateToYear } from './time';
describe('time', () => {
  it('maps fractional years to dates', () => {
    expect(yearToDate(1850)).toBe('1850-01-01');
    expect(yearToDate(1850.5)).toBe('1850-07-02');
    expect(yearToDate(1999.9999)).toBe('1999-12-31');
  });
  it('round-trips within a day', () => {
    for (const d of ['1790-05-29', '1863-06-20', '1959-08-21', '2020-04-01']) expect(yearToDate(dateToYear(d))).toBe(d);
  });
  it('is monotonic across a version boundary', () => {
    expect(dateToYear('1863-06-19')).toBeLessThan(dateToYear('1863-06-20'));
  });
});
