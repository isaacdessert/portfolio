import { Redis } from '@upstash/redis';
import { HttpError, readEnv } from './api';

let client: Redis | undefined;

/** Raw client. Only shared code (rateLimit) should use this; projects use kv(slug). */
export function getRedis(): Redis {
  if (!client) {
    const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
    const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
    if (!url || !token) {
      console.error('[lab] Redis not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel Marketplace → Upstash)');
      throw new HttpError(500, 'Redis not configured');
    }
    client = new Redis({ url, token });
  }
  return client;
}

export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface LabKv {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  incr(key: string): Promise<number>;
  del(key: string): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
}

/** Key-value store scoped to one project: every key is stored as lab:<slug>:<key>. */
export function createKv(slug: string, getClient: () => RedisLike): LabKv {
  const k = (key: string) => `lab:${slug}:${key}`;
  return {
    get: <T>(key: string) => getClient().get<T>(k(key)),
    async set(key, value, opts) {
      if (opts?.ex) await getClient().set(k(key), value, { ex: opts.ex });
      else await getClient().set(k(key), value);
    },
    incr: (key) => getClient().incr(k(key)),
    async del(key) {
      await getClient().del(k(key));
    },
    async expire(key, seconds) {
      await getClient().expire(k(key), seconds);
    },
  };
}

/** Safe to call at module top level: Redis is only contacted on first use. */
export function kv(slug: string): LabKv {
  return createKv(slug, getRedis as () => RedisLike);
}
