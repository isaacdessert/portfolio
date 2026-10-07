import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchJson } from './fetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('returns parsed JSON on an ok response', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })
    );
    await expect(fetchJson('/x.json')).resolves.toEqual({ a: 1 });
  });

  it('throws a descriptive error on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('not found', { status: 404 })
    );
    await expect(fetchJson('/missing.json')).rejects.toThrow('HTTP 404 for /missing.json');
  });
});
