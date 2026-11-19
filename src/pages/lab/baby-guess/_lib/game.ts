// Phases, Boards/Candidates, the lock, and winners. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

import { HttpError } from '@lab/api';
import { centralDay, type Day } from './days';
import { displaySpelling, normalize } from './names';
import { eliminatedCount, type Anchor } from './pacing';

export type BoardId = 'first' | 'middle';
export const BOARDS: readonly BoardId[] = ['first', 'middle'];

/** One Guesser's submission. `id` is `normalize(guesser)`; `at` is an ISO instant. */
export interface Guess {
  id: string;
  guesser: string;
  first: string;
  middle: string;
  at: string;
}

/** A Host-added made-up name, counted and shown like a Guess but belonging to no Guesser. */
export interface Decoy {
  id: string;
  first: string;
  middle: string;
  at: string;
}

/** One Board's state at the lock: its Final Five and the shuffled Elimination order of the rest (Candidate keys). */
export interface BoardLock {
  finalFive: string[];
  order: string[];
  anchor: Anchor;
}

export interface Game {
  lastGuessDay: Day;
  dueDate: Day;
  hints: Record<BoardId, string>;
  lock?: { day: Day; boards: Record<BoardId, BoardLock> };
  reveal?: { first: string; middle: string; at: string }; // Candidate keys
}

export interface GameData {
  game: Game | null;
  guesses: Guess[];
  decoys: Decoy[];
}

export type Phase = 'setup' | 'guessing' | 'boards' | 'revealed';

/** A distinct name on one Board, grouping every Guess and Decoy that has it in that position. */
export interface Candidate {
  key: string;
  name: string;
  guesses: number;
  decoys: number;
}

/** The game's derived phase; never stored. */
export function phaseOf(game: Game | null, today: Day): Phase {
  if (game?.reveal) return 'revealed';
  if (!game) return 'setup';
  return today <= game.lastGuessDay ? 'guessing' : 'boards';
}

interface Backer {
  raw: string;
  at: string;
  isDecoy: boolean;
}

/** Whether `a` names the Candidate ahead of `b`: earlier `at`, or a Guess over a Decoy on a tie. */
function isEarlier(a: Backer, b: Backer): boolean {
  if (a.at !== b.at) return a.at < b.at;
  return !a.isDecoy && b.isDecoy;
}

/** Every Candidate on `board`, grouped by normalised name and sorted alphabetically by key. */
export function boardCandidates(data: Pick<GameData, 'guesses' | 'decoys'>, board: BoardId): Candidate[] {
  const groups = new Map<string, { guesses: number; decoys: number; earliest: Backer }>();

  function add(raw: string, backer: Backer) {
    const key = normalize(raw);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { guesses: backer.isDecoy ? 0 : 1, decoys: backer.isDecoy ? 1 : 0, earliest: backer });
      return;
    }
    if (backer.isDecoy) group.decoys++;
    else group.guesses++;
    if (isEarlier(backer, group.earliest)) group.earliest = backer;
  }

  for (const g of data.guesses) add(g[board], { raw: g[board], at: g.at, isDecoy: false });
  for (const d of data.decoys) add(d[board], { raw: d[board], at: d.at, isDecoy: true });

  return Array.from(groups, ([key, group]) => ({
    key,
    name: displaySpelling(group.earliest.raw),
    guesses: group.guesses,
    decoys: group.decoys,
  })).sort((a, b) => a.key.localeCompare(b.key));
}

/** The Candidate keys Eliminated on `board` as of `today`, frozen at the Reveal day. */
export function eliminatedKeys(game: Game, board: BoardId, today: Day): Set<string> {
  if (!game.lock) return new Set();
  const lock = game.lock.boards[board];
  const revealDay = game.reveal ? centralDay(new Date(game.reveal.at)) : undefined;
  const asOf = revealDay && revealDay < today ? revealDay : today;
  const count = eliminatedCount(lock.order.length, lock.anchor, game.dueDate, asOf);
  return new Set(lock.order.slice(0, count));
}

/** The top 5 Candidates by real Guesses (Decoys don't count), ties broken alphabetically by key. */
export function defaultFinalFive(candidates: Candidate[]): string[] {
  return [...candidates]
    .sort((a, b) => b.guesses - a.guesses || a.key.localeCompare(b.key))
    .slice(0, 5)
    .map((c) => c.key);
}

/** Fisher–Yates shuffle from the end. Does not mutate `items`. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const BOARD_LABEL: Record<BoardId, string> = { first: 'first-name', middle: 'middle-name' };

/** Builds one Board's lock: validates the picks and shuffles the rest into the Elimination order. */
function buildBoardLock(data: GameData, board: BoardId, picks: string[], today: Day, random: () => number): BoardLock {
  const candidateKeys = boardCandidates(data, board).map((c) => c.key);
  const finalFive = picks.map(normalize);
  const distinct = new Set(finalFive);
  const allExist = finalFive.every((key) => candidateKeys.includes(key));
  if (finalFive.length !== 5 || distinct.size !== 5 || !allExist) {
    throw new HttpError(400, `Pick 5 different Candidates on the ${BOARD_LABEL[board]} Board`);
  }
  const order = shuffle(candidateKeys.filter((key) => !distinct.has(key)), random);
  return { finalFive, order, anchor: { day: today, eliminated: 0 } };
}

/** Builds the lock for both Boards from the Host's picks, or throws a 400 naming the offending Board. */
export function buildLock(
  data: GameData,
  picks: Record<BoardId, string[]>,
  today: Day,
  random: () => number,
): NonNullable<Game['lock']> {
  const boards = {} as Record<BoardId, BoardLock>;
  for (const board of BOARDS) boards[board] = buildBoardLock(data, board, picks[board], today, random);
  return { day: today, boards };
}

/** Winners (both names match) and Partial Winners (exactly one, in position) against the Answer. */
export function results(
  guesses: Guess[],
  answer: Record<BoardId, string>,
): { winners: string[]; partialWinners: { guesser: string; matched: BoardId }[] } {
  const winners: string[] = [];
  const partialWinners: { guesser: string; matched: BoardId }[] = [];

  for (const g of guesses) {
    const firstMatch = normalize(g.first) === answer.first;
    const middleMatch = normalize(g.middle) === answer.middle;
    if (firstMatch && middleMatch) winners.push(g.guesser);
    else if (firstMatch) partialWinners.push({ guesser: g.guesser, matched: 'first' });
    else if (middleMatch) partialWinners.push({ guesser: g.guesser, matched: 'middle' });
  }

  winners.sort((a, b) => a.localeCompare(b));
  partialWinners.sort((a, b) => a.guesser.localeCompare(b.guesser));
  return { winners, partialWinners };
}
