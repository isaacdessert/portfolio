// Game actions, against the in-memory fake store. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeHashKv } from './__fixtures__/fakeKv';
import type { BirthDetails } from './birth';
import { createGameStore } from './store';
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

// Matches baseGame's dueDate (2027-01-20), so it's inside the guessed-birth window by default.
const BIRTH: BirthDetails = { date: '2027-01-20', time: '12:00', weightOz: 120, lengthIn: 20 };
const REAL: BirthDetails = { date: '2027-01-10', time: '09:30', weightOz: 112, lengthIn: 19.5 };

const mom: GuessInput = { guesser: 'Mom', first: 'Olivia', middle: 'Rose', birth: BIRTH };
const dad: GuessInput = { guesser: 'Dad', first: 'Ava', middle: 'Grace', birth: BIRTH };

// 7 distinct first names and 7 distinct middle names, one of each per Guesser — enough to lock a
// Final Five of 5 per Board with 2 left over for the Elimination order.
const SEED_GUESSES: GuessInput[] = [
  { guesser: 'G1', first: 'Olivia', middle: 'Rose', birth: BIRTH },
  { guesser: 'G2', first: 'Ava', middle: 'Grace', birth: BIRTH },
  { guesser: 'G3', first: 'Mia', middle: 'Jane', birth: BIRTH },
  { guesser: 'G4', first: 'Liam', middle: 'Faith', birth: BIRTH },
  { guesser: 'G5', first: 'Noah', middle: 'Hope', birth: BIRTH },
  { guesser: 'G6', first: 'Ethan', middle: 'Joy', birth: BIRTH },
  { guesser: 'G7', first: 'Zoe', middle: 'Belle', birth: BIRTH },
];

const LOCK_PICKS: Record<BoardId, string[]> = {
  first: ['Olivia ', 'AVA', 'Mia', 'liam', 'NOAH'],
  middle: ['Rose ', 'GRACE', 'Jane', 'faith', 'HOPE'],
};

async function seedCandidates(target: ActionDeps): Promise<void> {
  for (const g of SEED_GUESSES) await target.store.addGuess({ ...g, at: target.now().toISOString() });
}

/** `count` Guessers, each with its own distinct first and middle name: `FirstNN`/`MidNN`. */
function makeSeedGuesses(count: number): GuessInput[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { guesser: `G${n}`, first: `First${n}`, middle: `Mid${n}`, birth: BIRTH };
  });
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
    // 17 Guessers → 17 distinct Candidates per Board. Locking the first 5 of each as the Final
    // Five leaves R = 12 leftover per Board — the spec §1 worked example ("R = 12 over 10 days
    // goes 1,1,1,1,2,1,1,1,1,2"), picked so the old-schedule count at the move day is neither 0
    // nor equal to what the new Due Date would give (the bug this test guards against).
    clock = '2027-01-02T12:00:00Z';
    for (const g of makeSeedGuesses(17)) await d.store.addGuess({ ...g, at: d.now().toISOString() });

    const finalFive = (prefix: string) => Array.from({ length: 5 }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

    // Lock on 01-10, with the base game's Due Date (01-20) still in force:
    // m = daysBetween(01-10, 01-20) = 10, matching the spec's worked example.
    clock = '2027-01-10T12:00:00Z';
    await lockBoards(d, { first: finalFive('First'), middle: finalFive('Mid') });

    // Move the Due Date on 01-17, 7 days after the lock: k = daysBetween(01-10, 01-17) = 7.
    // R = 12 > m = 10, so by the spec §1 formula: eliminated(t) = floor(R·k/m) = floor(12·7/10)
    // = floor(8.4) = 8 — under the OLD Due Date (01-20), independent of the new one.
    clock = '2027-01-17T12:00:00Z';
    const updated = await saveConfig(d, { dueDate: '2027-02-05' });

    const expectedAnchor = { day: '2027-01-17', eliminated: 8 };
    expect(updated.lock!.boards.first.anchor).toEqual(expectedAnchor);
    expect(updated.lock!.boards.middle.anchor).toEqual(expectedAnchor);
  });

  it('resending the same Due Date after the lock leaves both Boards’ anchors unchanged', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    clock = '2027-01-06T12:00:00Z';
    await lockBoards(d, LOCK_PICKS);
    const locked = (await d.store.load()).game!;

    clock = '2027-01-10T12:00:00Z';
    const updated = await saveConfig(d, { dueDate: locked.dueDate });

    expect(updated.lock!.boards.first.anchor).toEqual(locked.lock!.boards.first.anchor);
    expect(updated.lock!.boards.middle.anchor).toEqual(locked.lock!.boards.middle.anchor);
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
    await revealAnswer(d, { first: ' Olivia', middle: 'ROSE', birth: REAL });

    const state = await readPublic(d);
    expect(state.phase).toBe('revealed');
    if (state.phase !== 'revealed') throw new Error('unreachable');
    expect(state.answer).toEqual({ first: 'Olivia', middle: 'Rose' });
  });

  it('refuses a leftover Candidate once locked, even before it would be Eliminated, and accepts a Final Five member', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    clock = '2027-01-06T12:00:00Z';
    await lockBoards(d, LOCK_PICKS);

    // 'ethan' (first) and 'joy' (middle) are leftovers, not Final Five members. The Due Date is
    // 2027-01-20, so under the pacing schedule neither has been Eliminated yet on 01-10 — but once
    // locked, only the Final Five is eligible as the Answer at all (spec §1 "After the lock, that
    // means from the Final Five"), independent of the day's Elimination count.
    clock = '2027-01-10T12:00:00Z';
    await expect(revealAnswer(d, { first: 'Ethan', middle: 'Rose', birth: REAL })).rejects.toMatchObject({
      status: 400,
      message: "The Answer's first name must be one of the first-name Final Five.",
    });
    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Joy', birth: REAL })).rejects.toMatchObject({
      status: 400,
      message: "The Answer's middle name must be one of the middle-name Final Five.",
    });

    // A Final Five member, same day, is accepted.
    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Rose', birth: REAL })).resolves.toBeUndefined();
  });

  it('refuses a name that is not yet a Candidate, before the lock', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    await expect(revealAnswer(d, { first: 'Mystery', middle: 'Rose', birth: REAL })).rejects.toMatchObject({
      status: 400,
      message: "The Answer's first name must be a Candidate still on the first-name Board.",
    });
  });

  it('works before the lock, for an early baby', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    await revealAnswer(d, { first: 'Olivia', middle: 'Rose', birth: REAL });

    const state = await readPublic(d);
    expect(state.phase).toBe('revealed');
  });

  it('ends the game: Guesses close and Host writes get 409 The game is over.', async () => {
    clock = '2027-01-02T12:00:00Z';
    await seedCandidates(d);

    await revealAnswer(d, { first: 'Olivia', middle: 'Rose', birth: REAL });

    await expect(submitGuess(d, { guesser: 'Late', first: 'Zoe', middle: 'Belle', birth: BIRTH })).rejects.toMatchObject({
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
    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Rose', birth: REAL })).rejects.toMatchObject({
      status: 409,
      message: 'The game is over.',
    });
  });
});

describe('Birth Details', () => {
  // This block's game uses a Due Date of 2027-04-03 rather than baseGame's 2027-01-20, so the
  // first two tests' guessed-birth-date window matches birth.test.ts's own worked example
  // ('Pick a birth date between Mar 4 and May 3.'). The other three don't check the window at
  // all (revealAnswer never does), so the Due Date is otherwise incidental for them.
  beforeEach(async () => {
    await d.store.saveGame({ ...baseGame, dueDate: '2027-04-03' });
  });

  it('refuses a guessed birth date outside the window with the window in the message', async () => {
    await expect(submitGuess(d, { ...mom, birth: { ...BIRTH, date: '2027-05-04' } })).rejects.toMatchObject({
      status: 400,
      message: 'Pick a birth date between Mar 4 and May 3.',
    });
  });

  it('checks the window against the Due Date when the Guess is sent, keeping earlier Guesses', async () => {
    const guessA = { ...mom, birth: { ...BIRTH, date: '2027-05-01' } };
    await expect(submitGuess(d, guessA)).resolves.toMatchObject({ birth: guessA.birth });

    await saveConfig(d, { dueDate: '2027-03-15' });

    const guessB = { ...dad, birth: { ...BIRTH, date: '2027-05-01' } };
    await expect(submitGuess(d, guessB)).rejects.toMatchObject({ status: 400 });

    const loaded = await d.store.load();
    expect(loaded.guesses).toHaveLength(1);
    expect(loaded.guesses[0].birth).toEqual(guessA.birth);
  });

  it('stores and returns the Birth Details with the Guess', async () => {
    const birth: BirthDetails = { ...BIRTH, date: '2027-04-10' };
    const result = await submitGuess(d, { ...mom, birth });
    expect(result).toEqual({ guesser: 'Mom', first: 'Olivia', middle: 'Rose', birth });

    const loaded = await d.store.load();
    expect(loaded.guesses[0].birth).toEqual(birth);
  });

  it('reveals a tiny baby and keeps the real Birth Details', async () => {
    await seedCandidates(d);
    const birth: BirthDetails = { date: '2027-02-01', time: '04:10', weightOz: 20, lengthIn: 9 };

    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Rose', birth })).resolves.toBeUndefined();

    const loaded = await d.store.load();
    expect(loaded.game!.reveal!.birth).toEqual(birth);
  });

  it('refuses a real weight outside 0 lb 8 oz – 20 lb 0 oz', async () => {
    await seedCandidates(d);
    const birth: BirthDetails = { date: '2027-02-01', time: '04:10', weightOz: 7, lengthIn: 20 };

    await expect(revealAnswer(d, { first: 'Olivia', middle: 'Rose', birth })).rejects.toMatchObject({
      status: 400,
      message: 'The real weight must be between 0 lb 8 oz and 20 lb 0 oz.',
    });
  });
});
