// Request body schemas for the API routes. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import { describe, expect, it } from 'vitest';
import { configSchema, guessSchema, lockSchema } from './schemas';

describe('schemas', () => {
  it('accepts a phone-typed Guess', () =>
    expect(guessSchema.parse({ guesser: 'Aunt May', first: 'Zoë', middle: "O’Brien" })).toBeTruthy());

  it('rejects a bad name part and a blank Guesser', () => {
    expect(guessSchema.safeParse({ guesser: 'A', first: 'R2D2', middle: 'Rose' }).success).toBe(false);
    expect(guessSchema.safeParse({ guesser: '   ', first: 'Ava', middle: 'Rose' }).success).toBe(false);
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
});
