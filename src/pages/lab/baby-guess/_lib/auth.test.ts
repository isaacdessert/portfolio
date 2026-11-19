// Host token check. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import { describe, expect, it } from 'vitest';
import { HttpError } from '@lab/api';
import { checkHostToken } from './auth';

function statusOf(fn: () => void): number {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
  throw new Error('expected checkHostToken to throw');
}

describe('checkHostToken', () => {
  it('accepts the exact bearer token', () =>
    expect(() => checkHostToken('Bearer s3cret-token', 's3cret-token')).not.toThrow());

  it.each([[null], ['Bearer wrong'], ['Basic s3cret-token'], ['Bearer s3cret-token2'], ['s3cret-token']])(
    '401s %j',
    (h) => expect(statusOf(() => checkHostToken(h, 's3cret-token'))).toBe(401),
  );

  it.each([[undefined], ['']])('500s when the token is not configured (%j)', (e) =>
    expect(statusOf(() => checkHostToken('Bearer x', e))).toBe(500));
});
