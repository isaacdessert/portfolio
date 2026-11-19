// Redis game store, against the in-memory fake. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §5.

import { HttpError } from '@lab/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeHashKv } from './__fixtures__/fakeKv';
import { createGameStore, keySpaceFromEnv } from './store';
import type { Game } from './game';

afterEach(() => vi.unstubAllEnvs());

it('stores a Guess under the key space and the Guesser’s normalised name', async () => {
  const kv = fakeHashKv();
  const store = createGameStore(kv, 'preview');
  expect(await store.addGuess({ guesser: 'Aunt May', first: 'Ava', middle: 'Rose', at: 't' })).toBe(true);
  expect((await store.load()).guesses).toEqual([{ id: 'aunt may', guesser: 'Aunt May', first: 'Ava', middle: 'Rose', at: 't' }]);
  expect([...kv.data.keys()]).toContain('preview:guesses');
});

it('refuses a second Guess under the same name, however it is typed, even at the same moment', async () => {
  const store = createGameStore(fakeHashKv(), 'preview');
  const [a, b] = await Promise.all([
    store.addGuess({ guesser: 'Mom', first: 'Ava', middle: 'Rose', at: 't1' }),
    store.addGuess({ guesser: ' mom ', first: 'Zoe', middle: 'Kate', at: 't2' }),
  ]);
  expect([a, b].sort()).toEqual([false, true]);
  expect((await store.load()).guesses).toHaveLength(1);
});

it('gives each Decoy its own id and removes by id', async () => {
  let n = 0;
  const newId = () => `d${++n}`;
  const store = createGameStore(fakeHashKv(), 'preview', newId);

  await store.addDecoy({ first: 'Ava', middle: 'Rose', at: 't1' });
  await store.addDecoy({ first: 'Zoe', middle: 'Kate', at: 't2' });
  expect((await store.load()).decoys).toEqual([
    { id: 'd1', first: 'Ava', middle: 'Rose', at: 't1' },
    { id: 'd2', first: 'Zoe', middle: 'Kate', at: 't2' },
  ]);

  await store.removeDecoy('d1');
  expect((await store.load()).decoys).toEqual([{ id: 'd2', first: 'Zoe', middle: 'Kate', at: 't2' }]);

  await store.addGuess({ guesser: 'Mom', first: 'Ava', middle: 'Rose', at: 't3' });
  await store.addGuess({ guesser: 'Dad', first: 'Zoe', middle: 'Kate', at: 't4' });
  await store.removeGuess('mom');
  expect((await store.load()).guesses).toEqual([{ id: 'dad', guesser: 'Dad', first: 'Zoe', middle: 'Kate', at: 't4' }]);
});

it('saves and loads the game', async () => {
  const store = createGameStore(fakeHashKv(), 'preview');
  const g: Game = { lastGuessDay: '2027-01-05', dueDate: '2027-01-20', hints: { first: 'a', middle: 'b' } };
  await store.saveGame(g);
  expect((await store.load()).game).toEqual(g);
});

it('starts empty', async () =>
  expect(await createGameStore(fakeHashKv(), 'x').load()).toEqual({ game: null, guesses: [], decoys: [] }));

it('keeps key spaces apart', async () => {
  const kv = fakeHashKv();
  await createGameStore(kv, 'preview').addGuess({ guesser: 'Mom', first: 'Ava', middle: 'Rose', at: 't' });
  expect((await createGameStore(kv, 'production').load()).guesses).toEqual([]);
});

it('reads the key space from VERCEL_ENV', () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  expect(keySpaceFromEnv()).toBe('production');
});

it('stays "development" when neither VERCEL nor VERCEL_ENV is set', () => {
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL', '');
  expect(keySpaceFromEnv()).toBe('development');
});

it('refuses to guess the key space when VERCEL is set but VERCEL_ENV is not', () => {
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL', '1');
  let caught: unknown;
  try {
    keySpaceFromEnv();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(HttpError);
  expect(caught).toMatchObject({ status: 500, message: 'VERCEL_ENV missing; refusing to guess the key space' });
});
