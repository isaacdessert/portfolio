// Wiring shared by every route: the store, response shaping and the Host guard. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import { json, readEnv } from '@lab/api';
import { kv } from '@lab/kv';
import { rateLimit } from '@lab/rateLimit';
import type { ActionDeps } from './actions';
import { checkHostToken } from './auth';
import { createGameStore, keySpaceFromEnv, type GameStore } from './store';

export const SLUG = 'baby-guess';

let store: GameStore | undefined;

/** Memoised `ActionDeps` over the real store; `now` is the real clock. */
export function deps(): ActionDeps {
  if (!store) store = createGameStore(kv(SLUG), keySpaceFromEnv());
  return { store, now: () => new Date() };
}

/** `json()` plus `cache-control: no-store` — every response here carries secrets or live state. */
export function noStore(data: unknown, status = 200): Response {
  return json(data, { status, headers: { 'cache-control': 'no-store' } });
}

/** Rate-limits, then checks the Host token, so guessing the token is itself throttled. */
export async function guardHost(request: Request): Promise<void> {
  await rateLimit(request, { slug: SLUG, id: 'host', limit: 30, window: '1 m' });
  checkHostToken(request.headers.get('authorization'), readEnv('BABY_GUESS_HOST_TOKEN'));
}
