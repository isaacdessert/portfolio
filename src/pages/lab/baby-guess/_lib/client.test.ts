// Browser-only helpers for the Guesser page: remembering the device's own Guess and reading the
// Board from the URL hash. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §1, §3.
//
// Runs under vitest's node environment (no DOM): callers pass a `Storage` in rather than this
// module touching `window`/`localStorage` itself.

import { describe, expect, it } from 'vitest';
import type { GuessInput } from './actions';
import { boardFromHash, forgetGuess, GUESS_KEY, recallGuess, rememberGuess } from './client';

/** A minimal in-memory `Storage`, since vitest's node environment has no real one. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  } as unknown as Storage;
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
} as unknown as Storage;

describe('rememberGuess / recallGuess', () => {
  it('round-trips a Guess', () => {
    const storage = memoryStorage();
    const guess: GuessInput = { guesser: 'Aunt May', first: 'Ava', middle: 'Rose' };
    rememberGuess(storage, guess);
    expect(recallGuess(storage)).toEqual(guess);
  });

  it('returns null with no storage, blocked storage or junk', () => {
    expect(recallGuess(undefined)).toBeNull();
    expect(recallGuess(throwing)).toBeNull();
    expect(recallGuess(memoryStorage({ [GUESS_KEY]: '{nope' }))).toBeNull();
  });

  it('never throws when storage is blocked', () =>
    expect(() => rememberGuess(throwing, { guesser: 'A', first: 'Ava', middle: 'Rose' })).not.toThrow());
});

describe('forgetGuess', () => {
  it('removes the remembered Guess', () => {
    const storage = memoryStorage();
    rememberGuess(storage, { guesser: 'A', first: 'Ava', middle: 'Rose' });
    forgetGuess(storage);
    expect(recallGuess(storage)).toBeNull();
  });

  it('never throws with no storage or blocked storage', () => {
    expect(() => forgetGuess(undefined)).not.toThrow();
    expect(() => forgetGuess(throwing)).not.toThrow();
  });
});

describe('boardFromHash', () => {
  it.each([
    ['#middle', 'middle'],
    ['', 'first'],
    ['#nope', 'first'],
  ])('boardFromHash(%j) is %s', (h, b) => expect(boardFromHash(h)).toBe(b));
});
