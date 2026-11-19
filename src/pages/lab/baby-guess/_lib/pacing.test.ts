import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, type Day } from './days';
import { eliminatedCount, reanchor, upcoming, type Anchor } from './pacing';

/** Lists the Days from `from` to `to`, inclusive. */
function days(from: Day, to: Day): Day[] {
  const n = daysBetween(from, to);
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/** Each Day's Eliminations from `anchor.day + 1` through `due`. */
function deltas(total: number, anchor: Anchor, due: Day): number[] {
  let prev = anchor.eliminated;
  return days(addDays(anchor.day, 1), due).map((d) => {
    const n = eliminatedCount(total, anchor, due, d);
    const delta = n - prev;
    prev = n;
    return delta;
  });
}

const lock: Anchor = { day: '2027-01-10', eliminated: 0 };

describe('eliminatedCount', () => {
  it('Eliminates one a day, landing on the Due Date, when there are fewer Candidates than days', () => {
    expect(days('2027-01-14', '2027-01-21').map((d) => eliminatedCount(6, lock, '2027-01-20', d)))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 6]);
  });
  it('spreads the extras evenly when there are more Candidates than days', () => {
    expect(deltas(12, lock, '2027-01-20')).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 2]);
  });
  it('Eliminates nothing on the lock day', () => {
    expect(eliminatedCount(12, lock, '2027-01-20', '2027-01-10')).toBe(0);
  });
  it('Eliminates everything at the next midnight when locked on the Due Date', () => {
    const late = { day: '2027-01-20', eliminated: 0 };
    expect(eliminatedCount(4, late, '2027-01-20', '2027-01-20')).toBe(0);
    expect(eliminatedCount(4, late, '2027-01-20', '2027-01-21')).toBe(4);
  });
  it('re-spreads what is left when the Due Date moves earlier', () => {
    const a = reanchor(12, lock, '2027-01-20', '2027-01-13');
    expect(a).toEqual({ day: '2027-01-13', eliminated: 3 });
    expect(days('2027-01-13', '2027-01-16').map((d) => eliminatedCount(12, a, '2027-01-16', d)))
      .toEqual([3, 6, 9, 12]);
  });
  it('waits, then goes one a day, when the Due Date moves later', () => {
    const a = reanchor(12, lock, '2027-01-20', '2027-01-13');
    expect(eliminatedCount(12, a, '2027-01-30', '2027-01-21')).toBe(3);
    expect(eliminatedCount(12, a, '2027-01-30', '2027-01-22')).toBe(4);
    expect(eliminatedCount(12, a, '2027-01-30', '2027-01-30')).toBe(12);
  });
  it('Eliminates the rest at the next midnight when the Due Date is already past', () => {
    const a = reanchor(12, lock, '2027-01-20', '2027-01-13');
    expect(eliminatedCount(12, a, '2027-01-12', '2027-01-13')).toBe(3);
    expect(eliminatedCount(12, a, '2027-01-12', '2027-01-14')).toBe(12);
  });
  it('never decreases and stays within 0…total', () => {
    for (let total = 0; total <= 30; total++)
      for (let offset = -3; offset <= 40; offset++) {
        const due = addDays(lock.day, offset);
        let prev = 0;
        for (const d of days(lock.day, addDays(due > lock.day ? due : lock.day, 5))) {
          const n = eliminatedCount(total, lock, due, d);
          expect(n).toBeGreaterThanOrEqual(prev);
          expect(n).toBeLessThanOrEqual(total);
          prev = n;
        }
      }
  });
});
describe('upcoming', () => {
  it('lists the upcoming Eliminations for the Host', () => {
    expect(upcoming(12, lock, '2027-01-20', '2027-01-18')).toEqual([
      { day: '2027-01-19', count: 1 },
      { day: '2027-01-20', count: 2 },
    ]);
    expect(upcoming(12, lock, '2027-01-20', '2027-01-20')).toEqual([]);
  });
});
