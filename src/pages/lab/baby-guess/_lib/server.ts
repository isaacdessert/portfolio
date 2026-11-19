// Wiring shared by every route: the store, response shaping and the Host guard. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import type { APIContext, APIRoute } from 'astro';
import { handler, json, readEnv } from '@lab/api';
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

/** The success-path response shape. `route()` below adds `cache-control: no-store`, so this doesn't. */
export function noStore(data: unknown, status = 200): Response {
  return json(data, { status });
}

/** Sets `cache-control: no-store` on `res`, preserving its status and other headers (e.g. `Retry-After`). */
export function withNoStore(res: Response): Response {
  res.headers.set('cache-control', 'no-store');
  return res;
}

/**
 * `handler(fn)`, plus `cache-control: no-store` on every response it returns — success *or*
 * error. Spec §2 requires it on all of them, but `handler()`'s own error responses (400/401/409/
 * 429/500) don't otherwise carry it, so every route here goes through `route()` instead of
 * `handler()` directly.
 */
export function route(fn: (context: APIContext) => Response | Promise<Response>): APIRoute {
  const wrapped = handler(fn);
  return async (context) => withNoStore(await wrapped(context));
}

/** Rate-limits, then checks the Host token, so guessing the token is itself throttled. */
export async function guardHost(request: Request): Promise<void> {
  await rateLimit(request, { slug: SLUG, id: 'host', limit: 30, window: '1 m' });
  checkHostToken(request.headers.get('authorization'), readEnv('BABY_GUESS_HOST_TOKEN'));
}
