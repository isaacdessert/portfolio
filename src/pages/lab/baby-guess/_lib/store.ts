// Thin storage adapter over the shared lab KV. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §5.

import { HttpError, readEnv } from '@lab/api';
import type { LabKv } from '@lab/kv';
import type { BirthDetails } from './birth';
import { normalize } from './names';
import type { Decoy, Game, GameData, Guess } from './game';

export interface NewGuess {
  guesser: string;
  first: string;
  middle: string;
  at: string;
  birth: BirthDetails;
}

export interface NewDecoy {
  first: string;
  middle: string;
  at: string;
}

export interface GameStore {
  readonly keySpace: string;
  load(): Promise<GameData>;
  addGuess(guess: NewGuess): Promise<boolean>;
  addDecoy(decoy: NewDecoy): Promise<void>;
  removeGuess(id: string): Promise<void>;
  removeDecoy(id: string): Promise<void>;
  saveGame(game: Game): Promise<void>;
}

export type HashKv = Pick<LabKv, 'get' | 'set' | 'hsetnx' | 'hgetall' | 'hdel'>;

type GuessFields = Omit<Guess, 'id'>;
type DecoyFields = Omit<Decoy, 'id'>;

/** `keySpace` is bare (e.g. `"preview"`); `kv` is already scoped to this project, so keys here get no `lab:baby-guess:` prefix. */
export function createGameStore(kv: HashKv, keySpace: string, newId: () => string = () => crypto.randomUUID()): GameStore {
  const guessesKey = `${keySpace}:guesses`;
  const decoysKey = `${keySpace}:decoys`;
  const gameKey = `${keySpace}:game`;

  return {
    keySpace,

    async load() {
      const [game, guessFields, decoyFields] = await Promise.all([
        kv.get<Game>(gameKey),
        kv.hgetall<GuessFields>(guessesKey),
        kv.hgetall<DecoyFields>(decoysKey),
      ]);
      const guesses: Guess[] = Object.entries(guessFields).map(([id, fields]) => ({ id, ...fields }));
      const decoys: Decoy[] = Object.entries(decoyFields).map(([id, fields]) => ({ id, ...fields }));
      return { game, guesses, decoys };
    },

    // No `await` before `hsetnx`: the one-per-Guesser check-and-set must stay atomic under simultaneous submits.
    addGuess(guess) {
      return kv.hsetnx(guessesKey, normalize(guess.guesser), guess);
    },

    async addDecoy(decoy) {
      await kv.hsetnx(decoysKey, newId(), decoy);
    },

    async removeGuess(id) {
      await kv.hdel(guessesKey, id);
    },

    async removeDecoy(id) {
      await kv.hdel(decoysKey, id);
    },

    async saveGame(game) {
      await kv.set(gameKey, game);
    },
  };
}

/**
 * The active key space: `VERCEL_ENV` ("preview"/"production"), or "development" locally. On
 * Vercel (`VERCEL` set) `VERCEL_ENV` must also be set — fail closed rather than guess, since a
 * wrong guess here could point a rehearsal at the real game's keys.
 */
export function keySpaceFromEnv(): string {
  const vercelEnv = readEnv('VERCEL_ENV');
  if (vercelEnv) return vercelEnv;
  if (readEnv('VERCEL')) throw new HttpError(500, 'VERCEL_ENV missing; refusing to guess the key space');
  return 'development';
}
