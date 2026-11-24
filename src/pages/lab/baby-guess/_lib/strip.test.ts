import { describe, expect, it } from 'vitest';
import { stripLayout } from './strip';

describe('stripLayout', () => {
  it('spans every guess and the real value', () => {
    const layout = stripLayout([{ label: 'A', value: 10 }, { label: 'B', value: 30 }], 20, { width: 124 });
    expect([layout.min, layout.max]).toEqual([10, 30]);
    expect(layout.dots.map((d) => d.x)).toEqual([12, 112]);
    expect(layout.realX).toBe(62);
  });
  it('stacks equal values alphabetically', () => {
    const layout = stripLayout([{ label: 'Mom', value: 5 }, { label: 'Dad', value: 5 }, { label: 'Ava', value: 6 }], 5, { width: 100 });
    expect(layout.dots.filter((d) => d.value === 5).map((d) => [d.label, d.level])).toEqual([['Dad', 0], ['Mom', 1]]);
    expect(layout.levels).toBe(2);
  });
  it('uses a fixed domain when given (time of day)', () => {
    const layout = stripLayout([{ label: 'A', value: 720 }], 0, { width: 124, domain: [0, 1440] });
    expect(layout.dots[0].x).toBe(62);
    expect(layout.realX).toBe(12);
  });
  it('widens a single-value domain so nothing divides by zero', () => {
    expect(stripLayout([{ label: 'A', value: 7 }], 7, { width: 100 })).toMatchObject({ min: 6, max: 8 });
  });
  it('reports zero levels with no points', () => {
    expect(stripLayout([], 10, { width: 100 }).levels).toBe(0);
  });
});
