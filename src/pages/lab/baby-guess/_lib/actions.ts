// Game actions: load from the store, check the rules for today, write. The orchestration layer the
// API routes call. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

import { HttpError } from '@lab/api';
import { centralDay, type Day } from './days';
import { cleanName, normalize } from './names';
import { reanchor } from './pacing';
import {
  BOARDS,
  boardCandidates,
  buildLock,
  phaseOf,
  type BoardId,
  type BoardLock,
  type Game,
} from './game';
import { hostState, publicState, type HostState, type PublicState } from './project';
import type { GameStore } from './store';

export interface ActionDeps {
  store: GameStore;
  now: () => Date;
  /** Defaults to a `crypto.getRandomValues`-backed value in [0, 1); tests pass a seeded one. */
  random?: () => number;
}

export interface GuessInput {
  guesser: string;
  first: string;
  middle: string;
}

export interface ConfigInput {
  lastGuessDay?: Day;
  dueDate?: Day;
  hints?: Record<BoardId, string>;
}

const ANSWER_LABEL: Record<BoardId, { part: string; boardAdj: string }> = {
  first: { part: 'first name', boardAdj: 'first-name' },
  middle: { part: 'middle name', boardAdj: 'middle-name' },
};

function defaultRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/** Every Host write fails this way once the game is revealed, before any other rule is checked. */
function assertNotRevealed(game: Game | null): void {
  if (game?.reveal) throw new HttpError(409, 'The game is over.');
}

/** Adds one Guess, cleaned, while guessing is open. Returns the cleaned values that were stored. */
export async function submitGuess(deps: ActionDeps, input: GuessInput): Promise<GuessInput> {
  const today = centralDay(deps.now());
  const data = await deps.store.load();
  const phase = phaseOf(data.game, today);

  if (phase === 'setup') throw new HttpError(409, "Guessing hasn't opened yet.");
  if (phase !== 'guessing') throw new HttpError(409, 'Guessing is closed.');

  const guesser = cleanName(input.guesser);
  const first = cleanName(input.first);
  const middle = cleanName(input.middle);
  const at = deps.now().toISOString();

  const added = await deps.store.addGuess({ guesser, first, middle, at });
  if (!added) throw new HttpError(409, `Someone named ${guesser} already guessed. Add your last initial.`);

  return { guesser, first, middle };
}

/** Sets or updates the last guessing day, the Due Date and the Hints; re-anchors a lock when the Due Date moves. */
export async function saveConfig(deps: ActionDeps, input: ConfigInput): Promise<Game> {
  const today = centralDay(deps.now());
  const data = await deps.store.load();
  const { game } = data;
  assertNotRevealed(game);

  if (!game) {
    const lastGuessDay = input.lastGuessDay;
    const dueDate = input.dueDate;
    const first = input.hints?.first;
    const middle = input.hints?.middle;
    if (!lastGuessDay || !dueDate || !first || !middle) {
      throw new HttpError(400, 'Set the last guessing day, the Due Date and both Hints.');
    }
    if (dueDate <= lastGuessDay) {
      throw new HttpError(400, 'The Due Date must be after the last guessing day.');
    }
    const created: Game = { lastGuessDay, dueDate, hints: { first, middle } };
    await deps.store.saveGame(created);
    return created;
  }

  const phase = phaseOf(game, today);
  const changesLastGuessDay = input.lastGuessDay !== undefined && input.lastGuessDay !== game.lastGuessDay;
  const changesHints =
    input.hints !== undefined && (input.hints.first !== game.hints.first || input.hints.middle !== game.hints.middle);
  if (phase === 'boards' && (changesLastGuessDay || changesHints)) {
    throw new HttpError(409, 'Guessing has closed, so the last guessing day and Hints are fixed.');
  }

  const lastGuessDay = input.lastGuessDay ?? game.lastGuessDay;
  const dueDate = input.dueDate ?? game.dueDate;
  const hints = input.hints ?? game.hints;
  if (dueDate <= lastGuessDay) {
    throw new HttpError(400, 'The Due Date must be after the last guessing day.');
  }

  let lock = game.lock;
  if (lock && dueDate !== game.dueDate) {
    const oldDueDate = game.dueDate;
    const boards = {} as Record<BoardId, BoardLock>;
    for (const board of BOARDS) {
      const boardLock = lock.boards[board];
      boards[board] = { ...boardLock, anchor: reanchor(boardLock.order.length, boardLock.anchor, oldDueDate, today) };
    }
    lock = { ...lock, boards };
  }

  const updated: Game = { lastGuessDay, dueDate, hints, ...(lock ? { lock } : {}) };
  await deps.store.saveGame(updated);
  return updated;
}

/** Adds a Decoy, cleaned, before the lock. */
export async function addDecoy(deps: ActionDeps, input: { first: string; middle: string }): Promise<void> {
  const { game } = await deps.store.load();
  assertNotRevealed(game);
  if (game?.lock) throw new HttpError(409, 'The Boards are locked.');

  const first = cleanName(input.first);
  const middle = cleanName(input.middle);
  const at = deps.now().toISOString();
  await deps.store.addDecoy({ first, middle, at });
}

/** Deletes a Guess or Decoy by id, before the lock. */
export async function removeEntry(deps: ActionDeps, input: { kind: 'guess' | 'decoy'; id: string }): Promise<void> {
  const { game } = await deps.store.load();
  assertNotRevealed(game);
  if (game?.lock) throw new HttpError(409, 'The Boards are locked.');

  if (input.kind === 'guess') await deps.store.removeGuess(input.id);
  else await deps.store.removeDecoy(input.id);
}

/** Locks both Boards' Final Fives, once, after the Deadline. */
export async function lockBoards(deps: ActionDeps, picks: Record<BoardId, string[]>): Promise<void> {
  const today = centralDay(deps.now());
  const data = await deps.store.load();
  const { game } = data;
  assertNotRevealed(game);

  if (!game || phaseOf(game, today) !== 'boards') {
    throw new HttpError(409, 'Lock the Boards after guessing closes.');
  }
  if (game.lock) throw new HttpError(409, 'The Boards are already locked.');

  const random = deps.random ?? defaultRandom;
  const lock = buildLock(data, picks, today, random);
  await deps.store.saveGame({ ...game, lock });
}

/**
 * Reveals the Answer, ending the game. After the lock, each name must be one of that Board's
 * Final Five (the only Candidates that can never be Eliminated); before it, any existing
 * Candidate — see spec §1 "After the lock, that means from the Final Five."
 */
export async function revealAnswer(deps: ActionDeps, input: Record<BoardId, string>): Promise<void> {
  const data = await deps.store.load();
  const { game } = data;
  assertNotRevealed(game);
  if (!game) throw new HttpError(409, 'Set up the game first.');

  const answer = {} as Record<BoardId, string>;
  for (const board of BOARDS) {
    const key = normalize(input[board]);
    const label = ANSWER_LABEL[board];

    if (game.lock) {
      if (!game.lock.boards[board].finalFive.includes(key)) {
        throw new HttpError(400, `The Answer's ${label.part} must be one of the ${label.boardAdj} Final Five.`);
      }
    } else if (!boardCandidates(data, board).some((c) => c.key === key)) {
      throw new HttpError(400, `The Answer's ${label.part} must be a Candidate still on the ${label.boardAdj} Board.`);
    }

    answer[board] = key;
  }

  const at = deps.now().toISOString();
  await deps.store.saveGame({ ...game, reveal: { first: answer.first, middle: answer.middle, at } });
}

/** The phase-shaped state a Guesser's browser may see. */
export async function readPublic(deps: ActionDeps): Promise<PublicState> {
  const data = await deps.store.load();
  return publicState(data, centralDay(deps.now()));
}

/** Everything the Host sees. */
export async function readHost(deps: ActionDeps): Promise<HostState> {
  const data = await deps.store.load();
  return hostState(data, centralDay(deps.now()), deps.store.keySpace);
}
