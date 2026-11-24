import { describe, expect, it } from 'vitest';
import type { BirthDetails } from './birth';
import { BOARDS, buildLock, type BoardId, type GameData, type Guess } from './game';
import { addDays, daysBetween, type Day } from './days';
import { eliminatedCount, reanchor } from './pacing';
import { hostState, publicState } from './project';

const hints = { first: 'Two syllables', middle: 'A family name' };

/** Builds a Guess. `birth` is omitted entirely (never stored as `birth: undefined`) when not given. */
function guess(guesser: string, first: string, middle: string, at: string, birth?: BirthDetails): Guess {
  return { id: guesser.toLowerCase(), guesser, first, middle, at, ...(birth && { birth }) };
}

// Each Guesser's Birth Details is the sole Closest Winner of exactly one category against
// REAL_BIRTH below: Bravo on date (1 day off), Delta on time (10 min off), Echo on weight (1 oz
// off), Foxtrot on length (half an inch off). Guesser Hotel has none, to prove old Guesses (stored
// before this feature) are skipped by `closestWinners` and carry no `birth` key in the projection.
const ALPHA_BIRTH: BirthDetails = { date: '2027-01-17', time: '09:15', weightOz: 100, lengthIn: 15 };
const BRAVO_BIRTH: BirthDetails = { date: '2027-01-19', time: '03:00', weightOz: 90, lengthIn: 14 };
const CHARLIE_BIRTH: BirthDetails = { date: '2027-01-10', time: '06:00', weightOz: 80, lengthIn: 13 };
const DELTA_BIRTH: BirthDetails = { date: '2027-01-05', time: '11:50', weightOz: 70, lengthIn: 12 };
const ECHO_BIRTH: BirthDetails = { date: '2027-01-02', time: '20:00', weightOz: 121, lengthIn: 26 };
const FOXTROT_BIRTH: BirthDetails = { date: '2027-01-25', time: '23:00', weightOz: 60, lengthIn: 20.5 };
const GOLF_BIRTH: BirthDetails = { date: '2027-01-30', time: '01:00', weightOz: 50, lengthIn: 12.5 };

/** The Reveal's real Birth Details, used by every revealed-game fixture in this file. */
const REAL_BIRTH: BirthDetails = { date: '2027-01-20', time: '12:00', weightOz: 120, lengthIn: 20 };

/** 8 Guesses (7 distinct names per Board), 2 Decoys, open through 2027-01-05. Answer: Olivia Rose, guessed by Guesser Alpha. */
function fixture(): GameData {
  return {
    game: { lastGuessDay: '2027-01-05', dueDate: '2027-01-20', hints },
    guesses: [
      guess('Guesser Alpha', 'Olivia', 'Rose', '2027-01-01T10:00:00Z', ALPHA_BIRTH),
      guess('Guesser Bravo', 'Ava', 'Grace', '2027-01-01T11:00:00Z', BRAVO_BIRTH),
      guess('Guesser Charlie', 'Mia', 'Jane', '2027-01-01T12:00:00Z', CHARLIE_BIRTH),
      guess('Guesser Delta', 'Liam', 'Faith', '2027-01-02T09:00:00Z', DELTA_BIRTH),
      guess('Guesser Echo', 'Noah', 'Hope', '2027-01-02T10:00:00Z', ECHO_BIRTH),
      guess('Guesser Foxtrot', 'Ethan', 'Joy', '2027-01-02T11:00:00Z', FOXTROT_BIRTH),
      guess('Guesser Golf', 'Zoe', 'Belle', '2027-01-03T09:00:00Z', GOLF_BIRTH),
      guess('Guesser Hotel', 'Ava', 'Grace', '2027-01-03T10:00:00Z'), // no Birth Details
    ],
    decoys: [
      { id: 'd1', first: 'Luna', middle: 'Sage', at: '2027-01-01T08:00:00Z' },
      { id: 'd2', first: 'Ivy', middle: 'Wren', at: '2027-01-01T09:00:00Z' },
    ],
  };
}

const LOCK_PICKS = {
  first: ['Olivia', 'Ava', 'Mia', 'Liam', 'Noah'],
  middle: ['Rose', 'Grace', 'Jane', 'Faith', 'Hope'],
};

/** The lock a Host would make on `day` from `fixture()`'s Candidates, with deterministic shuffling. */
function lockedFixture(day: Day): GameData {
  const data = fixture();
  data.game!.lock = buildLock(data, LOCK_PICKS, day, () => 0);
  return data;
}

/** Lists the Days from `from` to `to`, inclusive. */
function days(from: Day, to: Day): Day[] {
  const n = daysBetween(from, to);
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/**
 * The exact Eliminated count the pacing formula gives for `board` on `day`, read from `data`'s own
 * lock. An oracle independent of `publicState`'s plumbing, so a projection that passes the wrong
 * day (e.g. the Due Date instead of `today`) into Elimination shows up as a count mismatch instead
 * of passing by accident.
 */
function expectedEliminated(data: GameData, board: BoardId, day: Day): number {
  const lock = data.game!.lock!.boards[board];
  return eliminatedCount(lock.order.length, lock.anchor, data.game!.dueDate, day);
}

it('setup shows nothing', () =>
  expect(publicState({ game: null, guesses: [], decoys: [] }, '2027-01-01')).toEqual({ phase: 'setup' }));

it('guessing shows the Due Date, so the form can set its date range', () =>
  expect(publicState(fixture(), '2027-01-03')).toEqual({
    phase: 'guessing',
    lastGuessDay: '2027-01-05',
    dueDate: '2027-01-20',
    hints,
    count: 10,
  }));

it('carries no Birth Details anywhere before the Reveal', () => {
  for (const day of ['2027-01-03', '2027-01-12']) {
    const text = JSON.stringify(publicState(lockedFixture('2027-01-06'), day));
    for (const word of ['birth', 'weightOz', 'lengthIn', '"time"']) expect(text).not.toContain(word);
  }
});

describe('secrecy before the Reveal', () => {
  const data = lockedFixture('2027-01-06');
  const state = publicState(data, '2027-01-12');
  if (state.phase !== 'boards') throw new Error(`expected phase 'boards', got '${state.phase}'`);

  it('has only phase, hints and boards', () => {
    expect(Object.keys(state)).toEqual(['phase', 'hints', 'boards']);
  });

  it('gives every Candidate exactly { name, eliminated }', () => {
    for (const b of BOARDS) for (const c of state.boards[b]) expect(Object.keys(c)).toEqual(['name', 'eliminated']);
  });

  it('leaks no Guesser, Decoy, count or lock detail', () => {
    const text = JSON.stringify(state);
    for (const word of ['Guesser', 'decoy', 'finalFive', 'order', 'anchor', 'dueDate', 'count', 'guesses']) {
      expect(text).not.toContain(word);
    }
  });

  it('lists alphabetically', () => {
    for (const b of BOARDS) {
      const names = state.boards[b].map((c) => c.name);
      expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    }
  });

  it('shows exactly the Eliminated count the pacing formula gives for this day, not a future one', () => {
    for (const b of BOARDS) {
      const eliminated = state.boards[b].filter((c) => c.eliminated);
      expect(eliminated).toHaveLength(expectedEliminated(data, b, '2027-01-12'));
    }
  });
});

it('plays a full timeline', () => {
  const data = fixture();
  const game = data.game!;

  for (const day of days('2027-01-01', '2027-01-05')) {
    expect(publicState(data, day).phase).toBe('guessing');
  }

  const dayAfterDeadline = publicState(data, '2027-01-06');
  expect(dayAfterDeadline.phase).toBe('boards');
  if (dayAfterDeadline.phase !== 'boards') throw new Error('unreachable');
  for (const b of BOARDS) for (const c of dayAfterDeadline.boards[b]) expect(c.eliminated).toBe(false);

  game.lock = buildLock(data, LOCK_PICKS, '2027-01-06', () => 0);

  const finalFiveNames: Record<BoardId, Set<string>> = {
    first: new Set(LOCK_PICKS.first),
    middle: new Set(LOCK_PICKS.middle),
  };

  for (const day of days('2027-01-07', '2027-01-22')) {
    const state = publicState(data, day);
    expect(state.phase).toBe('boards');
    if (state.phase !== 'boards') throw new Error('unreachable');
    for (const b of BOARDS) {
      const eliminated = state.boards[b].filter((c) => c.eliminated);
      // Pinned to the pacing formula's own count for *this* day, not just "didn't decrease" — a
      // projection that passed the Due Date instead of today would show 4 on every one of these
      // days (the schedule's final value) instead of the real 0,0,…,0,1,2,3,4 ramp.
      expect(eliminated).toHaveLength(expectedEliminated(data, b, day));
      for (const c of eliminated) expect(finalFiveNames[b].has(c.name)).toBe(false);
      if (day >= '2027-01-20') {
        const remaining = state.boards[b].filter((c) => !c.eliminated).map((c) => c.name);
        expect(new Set(remaining)).toEqual(finalFiveNames[b]);
      }
    }
  }

  game.reveal = { first: 'olivia', middle: 'rose', at: '2027-01-23T15:00:00Z', birth: REAL_BIRTH };
  const revealed = publicState(data, '2027-01-23');
  expect(revealed.phase).toBe('revealed');
  if (revealed.phase !== 'revealed') throw new Error('unreachable');

  expect(revealed.winners).toEqual(['Guesser Alpha']);
  for (const b of BOARDS) {
    const answered = revealed.boards[b].filter((c) => c.answer);
    expect(answered).toHaveLength(1);
    for (const c of revealed.boards[b]) expect(Object.keys(c)).toEqual(['name', 'eliminated', 'answer']);
  }
  expect(revealed.guesses).toHaveLength(8);
  const decoyNames = ['Luna', 'Ivy', 'Sage', 'Wren'];
  for (const g of revealed.guesses) {
    expect(decoyNames).not.toContain(g.first);
    expect(decoyNames).not.toContain(g.middle);
  }
});

it('an early Reveal before the lock shows nothing Eliminated', () => {
  const data = fixture();
  data.game!.reveal = { first: 'olivia', middle: 'rose', at: '2027-01-02T12:00:00Z', birth: REAL_BIRTH };
  const state = publicState(data, '2027-01-02');
  expect(state.phase).toBe('revealed');
  if (state.phase !== 'revealed') throw new Error('unreachable');
  for (const b of BOARDS) for (const c of state.boards[b]) expect(c.eliminated).toBe(false);
});

it('after the Reveal, shows the real Birth Details, each category’s Closest Winners and everyone’s guesses', () => {
  const data = fixture();
  data.game!.reveal = { first: 'olivia', middle: 'rose', at: '2027-01-23T15:00:00Z', birth: REAL_BIRTH };
  const state = publicState(data, '2027-01-23');
  expect(state.phase).toBe('revealed');
  if (state.phase !== 'revealed') throw new Error('unreachable');

  expect(state.birth.real).toEqual(REAL_BIRTH);
  expect(state.birth.winners).toEqual({
    date: ['Guesser Bravo'],
    time: ['Guesser Delta'],
    weight: ['Guesser Echo'],
    length: ['Guesser Foxtrot'],
  });

  expect(state.guesses).toHaveLength(8);
  const alpha = state.guesses.find((g) => g.guesser === 'Guesser Alpha');
  expect(alpha).toStrictEqual({ guesser: 'Guesser Alpha', first: 'Olivia', middle: 'Rose', birth: ALPHA_BIRTH });
  const hotel = state.guesses.find((g) => g.guesser === 'Guesser Hotel');
  expect(hotel).toEqual({ guesser: 'Guesser Hotel', first: 'Ava', middle: 'Grace' });
  expect(hotel).not.toHaveProperty('birth');
  for (const winners of Object.values(state.birth.winners)) expect(winners).not.toContain('Guesser Hotel');

  const decoyNames = ['Luna', 'Ivy', 'Sage', 'Wren'];
  const text = JSON.stringify(state.birth) + JSON.stringify(state.guesses);
  for (const name of decoyNames) expect(text).not.toContain(name);
});

it('moving the Due Date after the lock never lowers the public Eliminated count, and lands on the Final Five (spec §7)', () => {
  const data = lockedFixture('2027-01-06');
  const game = data.game!;
  const finalFiveNames: Record<BoardId, Set<string>> = {
    first: new Set(LOCK_PICKS.first),
    middle: new Set(LOCK_PICKS.middle),
  };

  /** The public Eliminated count per Board on `day`, checked against the pacing oracle. */
  function eliminatedCounts(day: Day): Record<BoardId, number> {
    const state = publicState(data, day);
    if (state.phase !== 'boards') throw new Error(`expected phase 'boards', got '${state.phase}'`);
    const counts = {} as Record<BoardId, number>;
    for (const b of BOARDS) {
      const eliminated = state.boards[b].filter((c) => c.eliminated);
      expect(eliminated).toHaveLength(expectedEliminated(data, b, day));
      for (const c of eliminated) expect(finalFiveNames[b].has(c.name)).toBe(false);
      counts[b] = eliminated.length;
    }
    return counts;
  }

  /** Mirrors `saveConfig`'s re-anchor block in `_lib/actions.ts` exactly. */
  function moveDueDate(newDueDate: Day, today: Day): void {
    const oldDueDate = game.dueDate;
    for (const board of BOARDS) {
      const boardLock = game.lock!.boards[board];
      boardLock.anchor = reanchor(boardLock.order.length, boardLock.anchor, oldDueDate, today);
    }
    game.dueDate = newDueDate;
  }

  const before = eliminatedCounts('2027-01-16');

  // Move the Due Date earlier, on 01-16.
  moveDueDate('2027-01-18', '2027-01-16');
  const afterEarlierMove = eliminatedCounts('2027-01-16');
  for (const b of BOARDS) expect(afterEarlierMove[b]).toBeGreaterThanOrEqual(before[b]);

  const midway = eliminatedCounts('2027-01-17');
  for (const b of BOARDS) expect(midway[b]).toBeGreaterThanOrEqual(afterEarlierMove[b]);

  // Move the Due Date later, on a different day, 01-17.
  moveDueDate('2027-01-25', '2027-01-17');
  const afterLaterMove = eliminatedCounts('2027-01-17');
  for (const b of BOARDS) expect(afterLaterMove[b]).toBeGreaterThanOrEqual(midway[b]);

  // On the new Due Date, exactly the Final Five remain on each Board.
  const onNewDueDate = publicState(data, '2027-01-25');
  if (onNewDueDate.phase !== 'boards') throw new Error(`expected phase 'boards', got '${onNewDueDate.phase}'`);
  for (const b of BOARDS) {
    const remaining = onNewDueDate.boards[b].filter((c) => !c.eliminated).map((c) => c.name);
    expect(new Set(remaining)).toEqual(finalFiveNames[b]);
  }
});

it('hostState gives the Host counts, Decoys, defaults before the lock and the schedule after it', () => {
  const data = fixture();

  const before = hostState(data, '2027-01-06', 'development');
  expect(before.keySpace).toBe('development');
  expect(before.today).toBe('2027-01-06');
  expect(before.phase).toBe('boards');
  expect(before.game).toEqual(data.game);
  expect(before.guesses).toEqual(data.guesses);
  expect(before.decoys).toEqual(data.decoys);
  for (const b of BOARDS) {
    expect(before.boards[b].defaultFinalFive).toHaveLength(5);
    expect(before.boards[b].upcoming).toEqual([]);
  }
  const ava = before.boards.first.candidates.find((c) => c.key === 'ava');
  expect(ava).toMatchObject({ guesses: 2, decoys: 0, eliminated: false });
  const luna = before.boards.first.candidates.find((c) => c.key === 'luna');
  expect(luna).toMatchObject({ guesses: 0, decoys: 1, eliminated: false });

  data.game!.lock = buildLock(data, LOCK_PICKS, '2027-01-06', () => 0);
  const after = hostState(data, '2027-01-10', 'development');
  for (const b of BOARDS) {
    const finalFiveKeys = new Set(LOCK_PICKS[b].map((n) => n.toLowerCase()));
    for (const c of after.boards[b].candidates) expect(c.finalFive).toBe(finalFiveKeys.has(c.key));
    expect(after.boards[b].upcoming.length).toBeGreaterThan(0);
  }
});
