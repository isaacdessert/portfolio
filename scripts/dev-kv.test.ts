import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createKv, type RedisLike } from '../src/lab/kv';
import { createDevKvServer } from './dev-kv.mjs';

// Drives the stub with the real Upstash client and rate limiter, so it is tested against the
// protocol the lab actually speaks (base64 responses, pipelines, EVALSHA) rather than a guess.
let server: ReturnType<typeof createDevKvServer>;
let redis: Redis;

beforeAll(async () => {
  server = createDevKvServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  redis = new Redis({ url: `http://127.0.0.1:${port}`, token: 'dev-kv', retry: false });
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const store = (slug: string) => createKv(slug, () => redis as unknown as RedisLike);

describe('dev-kv stub', () => {
  it('round-trips JSON values, counters and deletes through kv()', async () => {
    const kv = store('a');
    expect(await kv.get('missing')).toBeNull();
    await kv.set('game', { lastGuessDay: '2027-01-05', hints: { first: 'Two syllables' } });
    expect(await kv.get('game')).toEqual({ lastGuessDay: '2027-01-05', hints: { first: 'Two syllables' } });
    await kv.set('temp', 'x', { ex: 60 });
    expect(await kv.get('temp')).toBe('x');
    expect(await kv.incr('n')).toBe(1);
    expect(await kv.incr('n')).toBe(2);
    await kv.del('game');
    expect(await kv.get('game')).toBeNull();
  });

  it('keeps one value per hash field with hsetnx and parses hgetall values', async () => {
    const kv = store('b');
    expect(await kv.hgetall('guesses')).toEqual({});
    expect(await kv.hsetnx('guesses', 'aunt may', { guesser: 'Aunt May', first: 'Zoë' })).toBe(true);
    expect(await kv.hsetnx('guesses', 'aunt may', { guesser: 'aunt may', first: 'Ava' })).toBe(false);
    await kv.hsetnx('guesses', 'mom', { guesser: 'Mom', first: 'O’Brien' });
    expect(await kv.hgetall('guesses')).toEqual({
      'aunt may': { guesser: 'Aunt May', first: 'Zoë' },
      mom: { guesser: 'Mom', first: 'O’Brien' },
    });
    await kv.hdel('guesses', 'mom');
    expect(Object.keys(await kv.hgetall('guesses'))).toEqual(['aunt may']);
  });

  it('only lets one of two simultaneous same-field hsetnx calls win', async () => {
    const kv = store('c');
    const results = await Promise.all([kv.hsetnx('h', 'f', 1), kv.hsetnx('h', 'f', 2)]);
    expect(results.sort()).toEqual([false, true]);
  });

  it('expires keys set with ex', async () => {
    await redis.set('lab:d:soon', 'x', { px: 20 });
    expect(await redis.get('lab:d:soon')).toBe('x');
    await new Promise((r) => setTimeout(r, 40));
    expect(await redis.get('lab:d:soon')).toBeNull();
  });

  it('runs the sliding-window rate limit script', async () => {
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(2, '1 m'), prefix: 'lab:e:rl' });
    expect((await limiter.limit('1.2.3.4')).success).toBe(true);
    expect((await limiter.limit('1.2.3.4')).success).toBe(true);
    expect((await limiter.limit('1.2.3.4')).success).toBe(false);
    expect((await limiter.limit('5.6.7.8')).success).toBe(true);
  });

  it('refuses commands it does not implement, by name', async () => {
    await expect(redis.zadd('z', { score: 1, member: 'm' })).rejects.toThrow(/zadd.*dev-kv/i);
  });
});
