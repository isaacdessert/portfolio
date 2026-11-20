// Browser-only helpers for the Guesser page: remembering the device’s own Guess and what it has
// seen ruled out, reading the Board from the URL hash, and block letters. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §1, §3.
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

/** Clears the Guess remembered on this device, so the form shows empty again. Never throws. */
export function forgetGuess(storage: Storage | undefined): void {
  try {
    storage?.removeItem(GUESS_KEY);
  } catch {
    // Storage is blocked — nothing stored, nothing to clear.
  }
}

/** The Board a URL hash selects: `#middle` for the middle-name Board, anything else for the first-name one. */
export function boardFromHash(hash: string): BoardId {
  return hash === '#middle' ? 'middle' : 'first';
}

/** The letter on a Candidate's alphabet block: its first letter, upper-cased ("zoë" → "Z", "O'Brien" → "O"). */
export function blockLetter(name: string): string {
  const letter = name.match(/\p{L}/u)?.[0] ?? name.charAt(0);
  return letter.toLocaleUpperCase();
}

// --- "Since you last checked": the Eliminated names this device has already seen, per Board ---
// Only public Board data is stored, so it reveals nothing; it just lets a returning visitor watch
// the names ruled out since their last visit tip over.

export const SEEN_KEY = 'baby-guess:seen-eliminated';

export type SeenEliminated = Record<BoardId, string[]>;

function isSeenEliminated(value: unknown): value is SeenEliminated {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (['first', 'middle'] as const).every(
    (board) => Array.isArray(record[board]) && (record[board] as unknown[]).every((name) => typeof name === 'string'),
  );
}

/** Remembers which names this device has seen ruled out. Never throws. */
export function rememberSeen(storage: Storage | undefined, seen: SeenEliminated): void {
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Storage is blocked — the next visit just won't animate anything.
  }
}

/** What this device saw ruled out last time, or `null` for a first visit, blocked storage or malformed data. */
export function recallSeen(storage: Storage | undefined): SeenEliminated | null {
  try {
    const raw = storage?.getItem(SEEN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSeenEliminated(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Names Eliminated now that weren't when this device last looked. A first visit (`null`) counts nothing as new. */
export function newlyEliminated(previous: SeenEliminated | null, current: SeenEliminated): SeenEliminated {
  const fresh = (board: BoardId): string[] => {
    if (!previous) return [];
    const seen = new Set(previous[board]);
    return current[board].filter((name) => !seen.has(name));
  };
  return { first: fresh('first'), middle: fresh('middle') };
}
