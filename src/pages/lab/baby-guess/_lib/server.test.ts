// `route()`'s header wrapping — spec §2 requires `cache-control: no-store` on every response,
// success or error. Only exercises the wrapper itself (a fake handler), so it never touches Redis.

import type { APIContext } from 'astro';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@lab/api';
import { route, withNoStore } from './server';

const ctx = { request: new Request('https://x.test/') } as APIContext;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withNoStore', () => {
  it('sets cache-control: no-store, preserving the response otherwise', () => {
    const res = withNoStore(new Response('{}', { status: 201, headers: { 'x-test': 'y' } }));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-test')).toBe('y');
  });
});

describe('route', () => {
  it('sets cache-control: no-store on a success response', async () => {
    const res = await route(() => new Response('{"ok":true}', { status: 200 }))(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('sets cache-control: no-store on an HttpError response, preserving its other headers', async () => {
    const res = await route(() => {
      throw new HttpError(429, 'Too many requests', { 'Retry-After': '7' });
    })(ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('retry-after')).toBe('7');
  });

  it('sets cache-control: no-store on an unexpected error (500)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route(() => {
      throw new Error('boom');
    })(ctx);
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
