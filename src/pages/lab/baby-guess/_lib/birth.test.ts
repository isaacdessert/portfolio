import { describe, expect, it } from 'vitest';
import type { Day } from './days';
import {
  birthDistance,
  closestWinners,
  formatBirthDetails,
  formatBirthValue,
  formatLongDay,
  formatShortDay,
  guessBirthProblem,
  isTime,
  realBirthProblem,
  type BirthDetails,
} from './birth';

/** Builds a `BirthDetails` for a test. */
function b(date: Day, time: string, weightOz: number, lengthIn: number): BirthDetails {
  return { date, time, weightOz, lengthIn };
}

const due = '2027-04-03';

describe('guessBirthProblem', () => {
  it('accepts guessed dates inside the 30-day window and names the window otherwise', () => {
    expect(guessBirthProblem(b('2027-03-04', '12:00', 120, 20), due)).toBeNull();
    expect(guessBirthProblem(b('2027-05-03', '12:00', 120, 20), due)).toBeNull();
    expect(guessBirthProblem(b('2027-03-03', '12:00', 120, 20), due)).toBe('Pick a birth date between Mar 4 and May 3.');
    expect(guessBirthProblem(b('2027-05-04', '12:00', 120, 20), due)).toBe('Pick a birth date between Mar 4 and May 3.');
  });
  it.each([[32, null], [239, null], [31, 'w'], [240, 'w'], [120.5, 'w']])('guess weight %s', (oz, r) =>
    expect(guessBirthProblem(b(due, '12:00', oz, 20), due)).toBe(r && 'Pick a weight between 2 lb 0 oz and 14 lb 15 oz.'));
  it.each([[12, null], [26, null], [20.5, null], [11.5, 'l'], [26.5, 'l'], [20.25, 'l']])('guess length %s', (inches, r) =>
    expect(guessBirthProblem(b(due, '12:00', 120, inches), due)).toBe(r && 'Pick a length between 12 and 26 in, in half inches.'));
});

describe('isTime', () => {
  it.each([['00:00', true], ['23:59', true], ['24:00', false], ['7:05', false], ['', false]])('isTime(%j) is %s', (t, ok) =>
    expect(isTime(t)).toBe(ok));
});

describe('realBirthProblem', () => {
  it('lets a tiny or very large real baby through that no guess could be', () => {
    expect(realBirthProblem(b('2027-02-01', '04:10', 20, 9))).toBeNull();
    expect(guessBirthProblem(b(due, '04:10', 20, 20), due)).toBe('Pick a weight between 2 lb 0 oz and 14 lb 15 oz.');
    expect(realBirthProblem(b(due, '04:10', 7, 20))).toBe('The real weight must be between 0 lb 8 oz and 20 lb 0 oz.');
    expect(realBirthProblem(b(due, '04:10', 120, 33))).toBe('The real length must be between 8 and 32 in, in half inches.');
  });
});

describe('birthDistance', () => {
  it('scores time of day around midnight', () => {
    const real = b(due, '23:58', 120, 20);
    expect(birthDistance('time', b(due, '23:50', 120, 20), real)).toBe(8);
    expect(birthDistance('time', b(due, '02:00', 120, 20), real)).toBe(122);
  });
});

describe('closestWinners', () => {
  it('shares a tie between guesses on either side, alphabetically, and skips Guesses without Birth Details', () => {
    const real = b('2027-04-04', '03:12', 121, 20.5);
    const winners = closestWinners([
      { guesser: 'Mom', birth: b('2027-04-05', '03:00', 120, 20) },
      { guesser: 'Grandma Jo', birth: b('2027-04-03', '04:00', 128, 21) },
      { guesser: 'Old Guess' },
    ], real);
    expect(winners.date).toEqual(['Grandma Jo', 'Mom']);
    expect(winners.time).toEqual(['Mom']);
    expect(winners.weight).toEqual(['Mom']);
    expect(winners.length).toEqual(['Grandma Jo', 'Mom']);
    expect(closestWinners([], real)).toEqual({ date: [], time: [], weight: [], length: [] });
  });
});

describe('formatting', () => {
  it('formats every value the way the copy says', () => {
    expect(formatBirthDetails(b('2027-04-05', '15:20', 120, 20.5))).toBe('Apr 5 at 3:20 pm · 7 lb 8 oz · 20½ in');
    expect(formatBirthValue('time', b(due, '12:00', 120, 20))).toBe('12:00 pm');
    expect(formatBirthValue('time', b(due, '00:05', 120, 20))).toBe('12:05 am');
    expect(formatBirthValue('length', b(due, '12:00', 120, 20))).toBe('20 in');
    expect(formatBirthValue('weight', b(due, '12:00', 8, 20))).toBe('0 lb 8 oz');
    expect(formatLongDay('2027-04-03')).toBe('April 3');
    expect(formatShortDay('2027-12-31')).toBe('Dec 31');
  });
  it('shows the same date to a viewer in another time zone', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles'; // Node applies a changed TZ immediately
    try {
      expect(formatShortDay('2027-04-05')).toBe('Apr 5');
      expect(formatBirthDetails(b('2027-04-05', '00:30', 120, 20))).toBe('Apr 5 at 12:30 am · 7 lb 8 oz · 20 in');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
