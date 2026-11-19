// Browser-only helpers for the Guesser page: remembering the device's own Guess and reading the
// Board from the URL hash. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §1, §3.
//
// Never touches `window`/`document`/`localStorage` itself — the page script owns getting at
// `window.localStorage` (itself wrapped in try/catch, since access can throw) and passes the
// result in, or `undefined` if it couldn't. That keeps this module runnable under vitest's node
// environment and testable without a DOM.

import type { GuessInput } from './actions';
import type { BoardId } from './game';

export const GUESS_KEY = 'baby-guess:guess';

function isGuessInput(value: unknown): value is GuessInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).guesser === 'string' &&
    typeof (value as Record<string, unknown>).first === 'string' &&
    typeof (value as Record<string, unknown>).middle === 'string'
  );
}

/** Remembers `guess` in `storage` for next visit. An optional convenience: never throws. */
export function rememberGuess(storage: Storage | undefined, guess: GuessInput): void {
  try {
    storage?.setItem(GUESS_KEY, JSON.stringify(guess));
  } catch {
    // Storage is blocked (private mode, disabled cookies, quota) — nothing to do about it.
  }
}

/** The Guess remembered on this device, or `null` if there is none, storage is blocked, or the data is malformed. */
export function recallGuess(storage: Storage | undefined): GuessInput | null {
  try {
    const raw = storage?.getItem(GUESS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGuessInput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The Board a URL hash selects: `#middle` for the middle-name Board, anything else for the first-name one. */
export function boardFromHash(hash: string): BoardId {
  return hash === '#middle' ? 'middle' : 'first';
}
