import { describe, it, expect, vi } from 'vitest';
import { createKv, type RedisLike } from './kv';

function fakeRedis() {
  return {
    get: vi.fn(async () => 7),
    set: vi.fn(async () => 'OK'),
    incr: vi.fn(async () => 8),
    del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    hsetnx: vi.fn(async () => 1),
    hgetall: vi.fn(async () => ({ a: 1 })),
    hdel: vi.fn(async () => 1),
  };
}

const asClient = (redis: ReturnType<typeof fakeRedis>) => () => redis as unknown as RedisLike;

describe('createKv', () => {
  it('prefixes every key with lab:<slug>:', async () => {
    const redis = fakeRedis();
    const store = createKv('hello', asClient(redis));

    expect(await store.get('visits')).toBe(7);
    await store.set('name', 'x');
    await store.set('temp', 1, { ex: 60 });
    expect(await store.incr('visits')).toBe(8);
    await store.del('name');
    await store.expire('visits', 30);

    expect(redis.get).toHaveBeenCalledWith('lab:hello:visits');
    expect(redis.set).toHaveBeenCalledWith('lab:hello:name', 'x');
    expect(redis.set).toHaveBeenCalledWith('lab:hello:temp', 1, { ex: 60 });
    expect(redis.incr).toHaveBeenCalledWith('lab:hello:visits');
    expect(redis.del).toHaveBeenCalledWith('lab:hello:name');
    expect(redis.expire).toHaveBeenCalledWith('lab:hello:visits', 30);
  });

  it('does not touch the client until first use', () => {
    const getClient = vi.fn(() => fakeRedis() as unknown as RedisLike);
    createKv('hello', getClient);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('keeps projects apart', async () => {
    const redis = fakeRedis();
    await createKv('a', asClient(redis)).incr('n');
    await createKv('b', asClient(redis)).incr('n');
    expect(redis.incr.mock.calls).toEqual([['lab:a:n'], ['lab:b:n']]);
  });

  it('prefixes hash keys with lab:<slug>:', async () => {
    const redis = fakeRedis();
    const store = createKv('hello', asClient(redis));
    expect(await store.hsetnx('guesses', 'mom', { first: 'Ava' })).toBe(true);
    expect(await store.hgetall('guesses')).toEqual({ a: 1 });
    await store.hdel('guesses', 'mom');
    expect(redis.hsetnx).toHaveBeenCalledWith('lab:hello:guesses', 'mom', { first: 'Ava' });
    expect(redis.hgetall).toHaveBeenCalledWith('lab:hello:guesses');
    expect(redis.hdel).toHaveBeenCalledWith('lab:hello:guesses', 'mom');
  });

  it('reports an existing hash field as false', async () => {
    const redis = fakeRedis();
    redis.hsetnx.mockResolvedValueOnce(0);
    expect(await createKv('hello', asClient(redis)).hsetnx('g', 'mom', 1)).toBe(false);
  });

  it('returns {} for a missing hash', async () => {
    const redis = fakeRedis();
    redis.hgetall.mockResolvedValueOnce(null);
    expect(await createKv('hello', asClient(redis)).hgetall('g')).toEqual({});
  });
});
