import { HttpError } from '@lab/api';
import { describe, expect, it } from 'vitest';
import { normalize } from './names';
import {
  boardCandidates,
  buildLock,
  defaultFinalFive,
  eliminatedKeys,
  phaseOf,
  results,
  shuffle,
  type Game,
  type GameData,
  type Guess,
} from './game';

/** A Guess builder for tests: `id` is derived from `guesser`, like the real submit path. */
function guess(guesser: string, first: string, middle: string, at: string): Guess {
  return { id: normalize(guesser), guesser, first, middle, at };
}

describe('phaseOf', () => {
  const game: Game = { lastGuessDay: '2027-01-05', dueDate: '2027-01-20', hints: { first: 'a', middle: 'b' } };
  it('is setup with no game', () => expect(phaseOf(null, '2027-01-01')).toBe('setup'));
  it('is guessing through the last guessing day', () => expect(phaseOf(game, '2027-01-05')).toBe('guessing'));
  it('is boards after it', () => expect(phaseOf(game, '2027-01-06')).toBe('boards'));
  it('is revealed once revealed, even mid-guessing', () =>
    expect(phaseOf({ ...game, reveal: { first: 'ava', middle: 'rose', at: '2027-01-02T12:00:00Z' } }, '2027-01-02')).toBe(
      'revealed',
    ));
});

describe('boardCandidates', () => {
  it('groups case, spacing, apostrophe and accent variants into one Candidate', () => {
    const data = {
      guesses: [guess('A', 'O’Brien ', 'X', '2027-01-01T10:00:00Z'), guess('B', "o'brien", 'Y', '2027-01-01T11:00:00Z')],
      decoys: [{ id: 'd1', first: "O'BRIEN", middle: 'Z', at: '2027-01-01T09:00:00Z' }],
    };
    expect(boardCandidates(data, 'first')).toEqual([{ key: "o'brien", name: "O'Brien", guesses: 2, decoys: 1 }]);
  });
  it('lists alphabetically, not by popularity', () => {
    const data = { guesses: [guess('A', 'Zoe', 'X', 't1'), guess('B', 'zoë', 'X', 't2'), guess('C', 'Ava', 'X', 't3')], decoys: [] };
    expect(boardCandidates(data, 'first').map((c) => c.key)).toEqual(['ava', 'zoe']);
  });
  it('names a Candidate after its earliest backer, Guesses beating Decoys on a tie', () => {
    const data = {
      guesses: [guess('A', 'ava', 'X', 't1')],
      // Ties the guess exactly; its deliberate mixed case would show if it won, but Guesses win ties.
      decoys: [{ id: 'd1', first: 'AvA', middle: 'X', at: 't1' }],
    };
    expect(boardCandidates(data, 'first')).toEqual([{ key: 'ava', name: 'Ava', guesses: 1, decoys: 1 }]);
  });
});

it('defaultFinalFive takes the top 5 by real Guesses, ties alphabetical', () => {
  const c = (key: string, guesses: number, decoys = 0) => ({ key, name: key, guesses, decoys });
  expect(defaultFinalFive([c('ava', 3), c('bea', 4), c('cal', 4), c('dot', 1, 9), c('eve', 5), c('fay', 3), c('gus', 2)]))
    .toEqual(['eve', 'bea', 'cal', 'ava', 'fay']);
});

it('shuffle is Fisher–Yates and leaves its input alone', () => {
  const input = ['a', 'b', 'c', 'd'];
  expect(shuffle(input, () => 0)).toEqual(['b', 'c', 'd', 'a']);
  expect(input).toEqual(['a', 'b', 'c', 'd']);
});

describe('buildLock', () => {
  // 7 distinct first names and 7 distinct middle names, one of each per Guesser.
  const data: GameData = {
    game: null,
    guesses: [
      guess('G1', 'Olivia', 'Rose', 't1'),
      guess('G2', 'Ava', 'Grace', 't2'),
      guess('G3', 'Mia', 'Jane', 't3'),
      guess('G4', 'Liam', 'Faith', 't4'),
      guess('G5', 'Noah', 'Hope', 't5'),
      guess('G6', 'Ethan', 'Joy', 't6'),
      guess('G7', 'Zoe', 'Belle', 't7'),
    ],
    decoys: [],
  };
  const validMiddlePicks = ['Rose ', 'GRACE', 'Jane', 'faith', 'HOPE'];
  const today = '2027-01-10';

  it('accepts picks in display form or any case and orders the rest', () => {
    const lock = buildLock(data, { first: ['Olivia ', 'AVA', 'Mia', 'liam', 'NOAH'], middle: validMiddlePicks }, today, () => 0);

    expect(lock.day).toBe(today);
    expect([...lock.boards.first.finalFive].sort()).toEqual(['ava', 'liam', 'mia', 'noah', 'olivia']);
    expect([...lock.boards.first.order].sort()).toEqual(['ethan', 'zoe']);
    expect(lock.boards.first.anchor).toEqual({ day: today, eliminated: 0 });
    expect([...lock.boards.middle.finalFive].sort()).toEqual(['faith', 'grace', 'hope', 'jane', 'rose']);
    expect([...lock.boards.middle.order].sort()).toEqual(['belle', 'joy']);
    expect(lock.boards.middle.anchor).toEqual({ day: today, eliminated: 0 });
  });

  it.each([
    ['four picks', ['Olivia ', 'AVA', 'Mia', 'liam']],
    ['a duplicate (Ava, ava )', ['Olivia ', 'Ava', 'Mia', 'Liam', 'ava ']],
    ['a name not on the Board', ['Olivia ', 'Ava', 'Mia', 'Liam', 'Mystery']],
  ])('refuses %s with a 400 naming the Board', (_label, firstPicks) => {
    expect.assertions(2);
    try {
      buildLock(data, { first: firstPicks, middle: validMiddlePicks }, today, () => 0);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toMatchObject({ status: 400, message: 'Pick 5 different Candidates on the first-name Board' });
    }
  });
});

describe('eliminatedKeys', () => {
  const order = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
  const finalFive = ['f1', 'f2', 'f3', 'f4', 'f5'];

  it('is empty before the lock', () => {
    const game: Game = { lastGuessDay: '2027-01-01', dueDate: '2027-01-20', hints: { first: 'a', middle: 'b' } };
    expect(eliminatedKeys(game, 'first', '2027-01-05')).toEqual(new Set());
  });

  it('never includes a Final Five member and covers the whole order on the Due Date', () => {
    const anchor = { day: '2027-01-01', eliminated: 0 };
    const dueDate = '2027-01-10';
    const game: Game = {
      lastGuessDay: '2026-12-31',
      dueDate,
      hints: { first: 'a', middle: 'b' },
      lock: { day: '2027-01-01', boards: { first: { finalFive, order, anchor }, middle: { finalFive, order, anchor } } },
    };
    const keys = eliminatedKeys(game, 'first', dueDate);
    expect(keys.size).toBe(order.length);
    for (const key of order) expect(keys.has(key)).toBe(true);
    for (const key of finalFive) expect(keys.has(key)).toBe(false);
  });

  it('freezes at the Reveal day', () => {
    const anchor = { day: '2027-01-01', eliminated: 0 };
    const dueDate = '2027-01-20';
    const game: Game = {
      lastGuessDay: '2026-12-31',
      dueDate,
      hints: { first: 'a', middle: 'b' },
      lock: { day: '2027-01-01', boards: { first: { finalFive, order, anchor }, middle: { finalFive, order, anchor } } },
      reveal: { first: 'f1', middle: 'f1', at: '2027-01-05T18:00:00Z' },
    };
    const onRevealDay = eliminatedKeys(game, 'first', '2027-01-05');
    const fiveDaysLater = eliminatedKeys(game, 'first', '2027-01-10');
    expect(fiveDaysLater).toEqual(onRevealDay);
  });
});

it('results: exact match wins, one name in position is a Partial Win, swapped names get nothing', () => {
  const guesses = [guess('Mom', 'Olivia', 'Rose', 't'), guess('Dad', 'olivia', 'Grace', 't'), guess('Gran', 'Ava', 'ROSE', 't'), guess('Uncle', 'Rose', 'Olivia', 't')];
  expect(results(guesses, { first: 'olivia', middle: 'rose' })).toEqual({
    winners: ['Mom'],
    partialWinners: [{ guesser: 'Dad', matched: 'first' }, { guesser: 'Gran', matched: 'middle' }],
  });
});
