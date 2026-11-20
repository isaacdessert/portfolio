// Public and Host projections of game data — the secrecy rules. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §1-2.

import { type Day } from './days';
import { displaySpelling } from './names';
import { upcoming } from './pacing';
import {
  BOARDS,
  boardCandidates,
  defaultFinalFive,
  eliminatedKeys,
  phaseOf,
  results,
  type BoardId,
  type Candidate,
  type Decoy,
  type Game,
  type GameData,
  type Guess,
  type Phase,
} from './game';

export interface PublicCandidate {
  name: string;
  eliminated: boolean;
}

export type PublicState =
  | { phase: 'setup' }
  | { phase: 'guessing'; lastGuessDay: Day; hints: Record<BoardId, string>; count: number }
  | { phase: 'boards'; hints: Record<BoardId, string>; boards: Record<BoardId, PublicCandidate[]> }
  | {
      phase: 'revealed';
      hints: Record<BoardId, string>;
      boards: Record<BoardId, (PublicCandidate & { answer: boolean })[]>;
      answer: Record<BoardId, string>;
      winners: string[];
      partialWinners: { guesser: string; matched: BoardId }[];
      guesses: { guesser: string; first: string; middle: string }[];
    };

/** Every Candidate on `board`, with its Eliminated flag as of `today`. Never counts, Guessers or Decoys. */
function publicBoard(data: GameData, game: Game, board: BoardId, today: Day): PublicCandidate[] {
  const eliminated = eliminatedKeys(game, board, today);
  return boardCandidates(data, board).map((c) => ({ name: c.name, eliminated: eliminated.has(c.key) }));
}

/** Like `publicBoard`, plus which Candidate is the Answer. */
function revealedBoard(
  data: GameData,
  game: Game,
  board: BoardId,
  today: Day,
  answerKey: string,
): (PublicCandidate & { answer: boolean })[] {
  const eliminated = eliminatedKeys(game, board, today);
  return boardCandidates(data, board).map((c) => ({
    name: c.name,
    eliminated: eliminated.has(c.key),
    answer: c.key === answerKey,
  }));
}

/**
 * The phase-shaped projection of `data` a Guesser's browser may see. Before the Reveal this never
 * includes counts, Guesser names, Decoy flags, Final Five membership or the Elimination order — see
 * the spec's secrecy rules.
 */
export function publicState(data: GameData, today: Day): PublicState {
  const { game } = data;
  if (!game) return { phase: 'setup' };

  if (game.reveal) {
    const reveal = game.reveal;
    const boards = {} as Record<BoardId, (PublicCandidate & { answer: boolean })[]>;
    const answer = {} as Record<BoardId, string>;
    for (const board of BOARDS) {
      const candidates = revealedBoard(data, game, board, today, reveal[board]);
      boards[board] = candidates;
      answer[board] = candidates.find((c) => c.answer)?.name ?? displaySpelling(reveal[board]);
    }
    const { winners, partialWinners } = results(data.guesses, { first: reveal.first, middle: reveal.middle });
    const guesses = [...data.guesses]
      .sort((a, b) => a.guesser.localeCompare(b.guesser))
      .map((g) => ({ guesser: g.guesser, first: displaySpelling(g.first), middle: displaySpelling(g.middle) }));
    return { phase: 'revealed', hints: game.hints, boards, answer, winners, partialWinners, guesses };
  }

  const phase = phaseOf(game, today);
  if (phase === 'guessing') {
    return { phase, lastGuessDay: game.lastGuessDay, hints: game.hints, count: data.guesses.length + data.decoys.length };
  }

  const boards = {} as Record<BoardId, PublicCandidate[]>;
  for (const board of BOARDS) boards[board] = publicBoard(data, game, board, today);
  return { phase: 'boards', hints: game.hints, boards };
}

export interface HostCandidate extends Candidate {
  eliminated: boolean;
  finalFive: boolean;
}

export interface HostBoard {
  candidates: HostCandidate[];
  defaultFinalFive: string[];
  upcoming: { day: Day; count: number }[];
}

export interface HostState {
  keySpace: string;
  today: Day;
  phase: Phase;
  game: Game | null;
  guesses: Guess[];
  decoys: Decoy[];
  boards: Record<BoardId, HostBoard>;
}

/** Everything the Host sees: full counts, Decoys, every Candidate's Eliminated/Final-Five flags and the Elimination schedule. */
export function hostState(data: GameData, today: Day, keySpace: string): HostState {
  const { game } = data;
  const boards = {} as Record<BoardId, HostBoard>;

  for (const board of BOARDS) {
    const candidates = boardCandidates(data, board);
    const defaults = defaultFinalFive(candidates);
    const boardLock = game?.lock?.boards[board];
    const eliminated = game ? eliminatedKeys(game, board, today) : new Set<string>();
    const finalFive = new Set(boardLock ? boardLock.finalFive : defaults);

    boards[board] = {
      candidates: candidates.map((c) => ({ ...c, eliminated: eliminated.has(c.key), finalFive: finalFive.has(c.key) })),
      defaultFinalFive: defaults,
      upcoming: game && boardLock ? upcoming(boardLock.order.length, boardLock.anchor, game.dueDate, today) : [],
    };
  }

  return { keySpace, today, phase: phaseOf(game, today), game, guesses: data.guesses, decoys: data.decoys, boards };
}
