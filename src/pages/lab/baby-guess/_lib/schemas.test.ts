// Request body schemas for the API routes. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import { describe, expect, it } from 'vitest';
import { configSchema, guessSchema, lockSchema, revealSchema } from './schemas';

const BIRTH = { date: '2027-01-20', time: '12:00', weightOz: 120, lengthIn: 20 };

describe('schemas', () => {
  it('accepts a phone-typed Guess', () =>
    expect(guessSchema.parse({ guesser: 'Aunt May', first: 'Zoë', middle: "O’Brien", birth: BIRTH })).toBeTruthy());

  it('rejects a bad name part and a blank Guesser', () => {
    expect(guessSchema.safeParse({ guesser: 'A', first: 'R2D2', middle: 'Rose', birth: BIRTH }).success).toBe(false);
    expect(guessSchema.safeParse({ guesser: '   ', first: 'Ava', middle: 'Rose', birth: BIRTH }).success).toBe(false);
  });

  it('needs exactly 5 picks per Board', () =>
    expect(
      lockSchema.safeParse({ first: ['a', 'b', 'c', 'd'], middle: ['a', 'b', 'c', 'd', 'e'] }).success,
    ).toBe(false));

  it('takes partial config and real days only', () => {
    expect(configSchema.safeParse({}).success).toBe(true);
    expect(configSchema.safeParse({ dueDate: '2027-01-20' }).success).toBe(true);
    expect(configSchema.safeParse({ dueDate: '2027-02-30' }).success).toBe(false);
  });

  it('needs a well-formed birth with every Guess and Reveal', () => {
    const birth = { date: '2027-04-05', time: '15:20', weightOz: 120, lengthIn: 20.5 };
    expect(guessSchema.safeParse({ guesser: 'Mom', first: 'Ava', middle: 'Rose', birth }).success).toBe(true);
    expect(guessSchema.safeParse({ guesser: 'Mom', first: 'Ava', middle: 'Rose' }).success).toBe(false);
    expect(guessSchema.safeParse({ guesser: 'Mom', first: 'Ava', middle: 'Rose', birth: { ...birth, time: '3:20 pm' } }).success).toBe(false);
    expect(revealSchema.safeParse({ first: 'ava', middle: 'rose', birth: { ...birth, weightOz: '120' } }).success).toBe(false);
  });
});
