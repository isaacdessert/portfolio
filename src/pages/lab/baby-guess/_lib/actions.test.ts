// Game actions, against the in-memory fake store. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeHashKv } from './__fixtures__/fakeKv';
import { createGameStore } from './store';
import { eliminatedCount } from './pacing';
import type { BoardId, Game } from './game';
import {
  addDecoy,
  lockBoards,
  readPublic,
  removeEntry,
  revealAnswer,
  saveConfig,
  submitGuess,
  type ActionDeps,
  type GuessInput,
} from './actions';

// A single mutable clock, shared by every ActionDeps this file builds (including ones created
// mid-test), so a test can move time by simply reassigning `clock`.
let clock: string;

/** A deterministic, non-constant stand-in for `crypto.getRandomValues`-backed randomness. */
function seededRandom(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Sets the shared clock to `at` and returns fresh `ActionDeps` over an empty store. */
function deps(at: string): ActionDeps {
  clock = at;
  return { store: createGameStore(fakeHashKv(), 'test'), now: () => new Date(clock), random: seededRandom() };
}

const baseHints = { first: 'Two syllables', middle: 'A family name' };
const baseGame: Game = { lastGuessDay: '2027-01-05', dueDate: '2027-01-20', hints: baseHints };

async function withBaseGame(target: ActionDeps): Promise<void> {
  await target.store.saveGame({ ...baseGame });
}

const mom: GuessInput = { guesser: 'Mom', first: 'Olivia', middle: 'Rose' };
const dad: GuessInput = { guesser: 'Dad', first: 'Ava', middle: 'Grace' };

// 7 distinct first names and 7 distinct middle names, one of each per Guesser — enough to lock a
// Final Five of 5 per Board with 2 left over for the Elimination order.
const SEED_GUESSES: GuessInput[] = [
  { guesser: 'G1', first: 'Olivia', middle: 'Rose' },
  { guesser: 'G2', first: 'Ava', middle: 'Grace' },
  { guesser: 'G3', first: 'Mia', middle: 'Jane' },
  { guesser: 'G4', first: 'Liam', middle: 'Faith' },
  { guesser: 'G5', first: 'Noah', middle: 'Hope' },
  { guesser: 'G6', first: 'Ethan', middle: 'Joy' },
  { guesser: 'G7', first: 'Zoe', middle: 'Belle' },
];

const LOCK_PICKS: Record<BoardId, string[]> = {
  first: ['Olivia ', 'AVA', 'Mia', 'liam', 'NOAH'],
  middle: ['Rose ', 'GRACE', 'Jane', 'faith', 'HOPE'],
};

async function seedCandidates(target: ActionDeps): Promise<void> {
  for (const g of SEED_GUESSES) await target.store.addGuess({ ...g, at: target.now().toISOString() });
}

let d: ActionDeps;

beforeEach(async () => {
  d = deps('2027-01-01T00:00:00Z');
  await withBaseGame(d);
});

it('accepts a Guess at 11:59 pm Central on the last guessing day and refuses one at midnight', async () => {
  clock = '2027-01-06T05:59:00Z';
  await expect(submitGuess(d, mom)).resolves.toBeTruthy();
  clock = '2027-01-06T06:00:00Z';
  await expect(submitGuess(d, dad)).rejects.toMatchObject({ status: 409, message: 'Guessing is closed.' });
});

it('lets only one of two simultaneous same-name Guesses through, with the spec copy', async () => {
  const settled = await Promise.allSettled([
    submitGuess(d, { ...mom, guesser: 'Mom' }),
    submitGuess(d, { ...dad, guesser: 'mom ' }),
  ]);
  expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
  const rejected = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ status: 409 });
  expect(rejected.reason.message).toMatch(/^Someone named (Mom|mom) already guessed\. Add your last initial\.$/);
});

it("refuses Guesses before setup with 409 Guessing hasn't opened yet.", async () => {
  const fresh = deps('2027-01-01T00:00:00Z');
  await expect(submitGuess(fresh, mom)).rejects.toMatchObject({ status: 409, message: "Guessing hasn't opened yet." });
});

describe('saveConfig', () => {
  it('needs every field the first time', async () => {
    const fresh = deps('2027-01-01T00:00:00Z');
    await expect(saveConfig(fresh, { lastGuessDay: '2027-01-05' })).rejects.toMatchObject({
      status: 400,
      message: 'Set the last guessing day, the Due Date and both Hints.',
    });
    await expect(saveConfig(fresh, {})).rejects.toMatchObject({
      status: 400,
      message: 'Set the last guessing day, the Due Date and both Hints.',
    });
  });

  it('allows changes while guessing is open', async () => {
    const updated = await saveConfig(d, {
      lastGuessDay: '2027-01-07',
      dueDate: '2027-01-22',
      hints: { first: 'New first hint', middle: 'New middle hint' },
    });
    expect(updated).toEqual({
      lastGuessDay: '2027-01-07',
      dueDate: '2027-01-22',
      hints: { first: 'New first hint', middle: 'New middle hint' },
    });
    expect((await d.store.load()).game).toEqual(updated);
  });

  it('fixes the last guessing day and Hints after the Deadline', async () => {
    clock = '2027-01-06T12:00:00Z';
    await expect(saveConfig(d, { lastGuessDay: '2027-01-08' })).rejects.toMatchObject({
      status: 409,
      message: 'Guessing has closed, so the last guessing day and Hints are fixed.',
    });
    await expect(saveConfig(d, { hints: { first: 'Changed', middle: 'Changed' } })).rejects.toMatchObject({
      status: 409,
      message: 'Guessing has closed, so the last guessing day and Hints are fixed.',
    });
    // The Due Date alone is unaffected by this rule (it's how a lock gets re-anchored).
    await expect(saveConfig(d, { dueDate: '2027-01-25' })).resolves.toMatchObject({ dueDate: '2027-01-25' });
  });

  it('resending the same lastGuessDay and Hints after the Deadline is not a change (Ruling 2)', async () => {
    clock = '2027-01-06T12:00:00Z';
    await expect(
      saveConfig(d, { lastGuessDay: baseGame.lastGuessDay, hints: { ...baseHints } }),
    ).resolves.toMatchObject({ lastGuessDay: baseGame.lastGuessDay, hints: baseHints });
  });

  it('requires the Due Date after the last guessing day', async () => {
    await expect(saveConfig(d, { dueDate: '2027-01-05' })).rejects.toMatchObject({
      status: 400,
      message: 'The Due Date must be after the last guessing day.',
    });
    const fresh = deps('2027-01-01T00:00:00Z');
    await expect(
      saveConfig(fresh, { lastGuessDay: '2027-01-05', dueDate: '2027-01-05', hints: { first: 'a', middle: 'b' } }),
    ).rejects.toMatchObject({ status: 400, message: 'The Due Date must be after the last guessing day.' });
  });

  it('re-anchors after the lock when the Due Date moves, keeping today’s Eliminations', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    clock = '2027-01-06T12:00:00Z';
    await lockBoards(d, LOCK_PICKS);

    const beforeGame = (await d.store.load()).game!;
    const firstLock = beforeGame.lock!.boards.first;
    const expectedEliminated = eliminatedCount(firstLock.order.length, firstLock.anchor, beforeGame.dueDate, '2027-01-13');

    clock = '2027-01-13T12:00:00Z';
    const updated = await saveConfig(d, { dueDate: '2027-01-16' });

    expect(updated.lock!.boards.first.anchor).toEqual({ day: '2027-01-13', eliminated: expectedEliminated });
    expect(updated.lock!.boards.middle.anchor.day).toBe('2027-01-13');
  });
});

it('adds and removes Decoys and Guesses until the lock, then refuses with 409 The Boards are locked.', async () => {
  clock = '2027-01-02T12:00:00Z';
  await seedCandidates(d);
  await addDecoy(d, { first: 'Luna', middle: 'Sage' });

  const seeded = await d.store.load();
  const zoe = seeded.guesses.find((g) => g.guesser === 'G7')!;
  const decoy = seeded.decoys[0];

  await removeEntry(d, { kind: 'decoy', id: decoy.id });
  await removeEntry(d, { kind: 'guess', id: zoe.id });

  const afterRemoval = await d.store.load();
  expect(afterRemoval.decoys).toHaveLength(0);
  expect(afterRemoval.guesses.map((g) => g.guesser)).not.toContain('G7');

  clock = '2027-01-06T12:00:00Z';
  await lockBoards(d, LOCK_PICKS);

  await expect(addDecoy(d, { first: 'Extra', middle: 'Name' })).rejects.toMatchObject({
    status: 409,
    message: 'The Boards are locked.',
  });
  await expect(removeEntry(d, { kind: 'guess', id: afterRemoval.guesses[0].id })).rejects.toMatchObject({
    status: 409,
    message: 'The Boards are locked.',
  });
});

describe('lockBoards', () => {
  it('refuses before the Deadline', async () => {
    const fresh = deps('2027-01-01T00:00:00Z');
    await expect(lockBoards(fresh, LOCK_PICKS)).rejects.toMatchObject({
      status: 409,
      message: 'Lock the Boards after guessing closes.',
    });

    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);
    await expect(lockBoards(d, LOCK_PICKS)).rejects.toMatchObject({
      status: 409,
      message: 'Lock the Boards after guessing closes.',
    });
  });

  it('locks once with picks in display form and any case', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    clock = '2027-01-06T12:00:00Z';
    await lockBoards(d, LOCK_PICKS);

    const game = (await d.store.load()).game!;
    expect([...game.lock!.boards.first.finalFive].sort()).toEqual(['ava', 'liam', 'mia', 'noah', 'olivia']);
    expect([...game.lock!.boards.middle.finalFive].sort()).toEqual(['faith', 'grace', 'hope', 'jane', 'rose']);

    await expect(lockBoards(d, LOCK_PICKS)).rejects.toMatchObject({
      status: 409,
      message: 'The Boards are already locked.',
    });
  });
});

describe('revealAnswer', () => {
  it('accepts the Answer as typed (" Olivia", "ROSE")', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    clock = '2027-01-06T12:00:00Z';
    await lockBoards(d, LOCK_PICKS);

    clock = '2027-01-10T12:00:00Z';
    await revealAnswer(d, { first: ' Olivia', middle: 'ROSE' });

    const state = await readPublic(d);
    expect(state.phase).toBe('revealed');
    if (state.phase !== 'revealed') throw new Error('unreachable');
    expect(state.answer).toEqual({ first: 'Olivia', middle: 'Rose' });
  });

  it('refuses an Eliminated Candidate', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    clock = '2027-01-06T12:00:00Z';
    await lockBoards(d, LOCK_PICKS);

    // At the Due Date, both leftover first-name Candidates (ethan, zoe) are Eliminated regardless
    // of shuffle order: R = m = 2, so the whole leftover list clears at the final midnight.
    clock = '2027-01-20T12:00:00Z';
    await expect(revealAnswer(d, { first: 'Ethan', middle: 'Rose' })).rejects.toMatchObject({
      status: 400,
      message: "The Answer's first name must be a Candidate still on the first-name Board.",
    });
    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Joy' })).rejects.toMatchObject({
      status: 400,
      message: "The Answer's middle name must be a Candidate still on the middle-name Board.",
    });
  });

  it('works before the lock, for an early baby', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    await revealAnswer(d, { first: 'Olivia', middle: 'Rose' });

    const state = await readPublic(d);
    expect(state.phase).toBe('revealed');
  });

  it('ends the game: Guesses close and Host writes get 409 The game is over.', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    await revealAnswer(d, { first: 'Olivia', middle: 'Rose' });

    await expect(submitGuess(d, { guesser: 'Late', first: 'Zoe', middle: 'Belle' })).rejects.toMatchObject({
      status: 409,
      message: 'Guessing is closed.',
    });
    await expect(saveConfig(d, { dueDate: '2027-01-25' })).rejects.toMatchObject({ status: 409, message: 'The game is over.' });
    await expect(addDecoy(d, { first: 'X', middle: 'Y' })).rejects.toMatchObject({ status: 409, message: 'The game is over.' });
    await expect(removeEntry(d, { kind: 'decoy', id: 'whatever' })).rejects.toMatchObject({
      status: 409,
      message: 'The game is over.',
    });
    await expect(lockBoards(d, LOCK_PICKS)).rejects.toMatchObject({ status: 409, message: 'The game is over.' });
    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Rose' })).rejects.toMatchObject({
      status: 409,
      message: 'The game is over.',
    });
  });
});
