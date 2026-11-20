import { describe, expect, it } from 'vitest';
import { addDays, centralDay, daysBetween, isDay } from './days';

describe('centralDay', () => {
  it('uses Central time, CST (UTC−6) in winter', () => {
    expect(centralDay(new Date('2026-11-19T05:59:59Z'))).toBe('2026-11-18');
    expect(centralDay(new Date('2026-11-19T06:00:00Z'))).toBe('2026-11-19');
  });
  it('uses CDT (UTC−5) in summer', () => {
    expect(centralDay(new Date('2027-06-01T04:59:59Z'))).toBe('2027-05-31');
    expect(centralDay(new Date('2027-06-01T05:00:00Z'))).toBe('2027-06-01');
  });
});
describe('addDays', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-13', 1)).toBe('2027-03-14');
  });
});
describe('daysBetween', () => {
  it('counts days between', () => {
    expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
    expect(daysBetween('2027-01-02', '2026-12-31')).toBe(-2);
  });
});
describe('isDay', () => {
  it('validates days', () => {
    expect(isDay('2027-02-28')).toBe(true);
    expect(isDay('2027-02-30')).toBe(false);
    expect(isDay('2027-2-3')).toBe(false);
  });
});
