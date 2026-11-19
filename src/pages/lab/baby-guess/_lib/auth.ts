// Host token check. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from '@lab/api';

function digest(input: string): Buffer {
  return createHash('sha256').update(input).digest();
}

/**
 * Throws 500 if the Host token isn't configured, otherwise 401 unless `authorization` is exactly
 * `Bearer <expected>`. Compares SHA-256 digests (constant length) with `timingSafeEqual` so the
 * check doesn't leak timing information about the token.
 */
export function checkHostToken(authorization: string | null, expected: string | undefined): void {
  if (!expected) throw new HttpError(500, 'Host token not configured');
  const want = digest(`Bearer ${expected}`);
  const got = digest(authorization ?? '');
  if (!timingSafeEqual(got, want)) throw new HttpError(401, 'Unauthorized');
}
