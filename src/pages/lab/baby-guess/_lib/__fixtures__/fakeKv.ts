// In-memory stand-in for the lab's Redis-backed HashKv, for store.ts's tests
// and (per the task brief) Task 7's. `hsetnx` has real Redis semantics: a
// field that already exists returns false and is left unchanged, and the
// check-and-set runs synchronously (no internal `await`) so two concurrent
// calls on the same field resolve to exactly one `true`. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §5.

import type { HashKv } from '../store';

export function fakeHashKv(): HashKv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();

  return {
    data,

    async get<T>(key: string) {
      return data.has(key) ? (data.get(key) as T) : null;
    },

    async set(key: string, value: unknown) {
      data.set(key, value);
    },

    hsetnx(key: string, field: string, value: unknown) {
      const hash = data.get(key) as Record<string, unknown> | undefined;
      if (hash && Object.prototype.hasOwnProperty.call(hash, field)) return Promise.resolve(false);
      data.set(key, { ...hash, [field]: value });
      return Promise.resolve(true);
    },

    async hgetall<T>(key: string) {
      const hash = data.get(key) as Record<string, T> | undefined;
      return hash ? { ...hash } : {};
    },

    async hdel(key: string, field: string) {
      const hash = data.get(key) as Record<string, unknown> | undefined;
      if (!hash || !Object.prototype.hasOwnProperty.call(hash, field)) return;
      const rest = { ...hash };
      delete rest[field];
      data.set(key, rest);
    },
  };
}
