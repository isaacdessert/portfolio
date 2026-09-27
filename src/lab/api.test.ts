import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { z } from 'astro/zod';
import { HttpError, handler, json, readBody, requireEnv, readEnv } from './api';

const ctx = (request = new Request('https://x.test/')) => ({ request }) as APIContext;
const post = (body: string) =>
  new Request('https://x.test/', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('json', () => {
  it('serializes with JSON content type and passes init through', async () => {
    const res = json({ a: 1 }, { status: 201, headers: { 'x-test': 'y' } });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-test')).toBe('y');
    expect(await res.json()).toEqual({ a: 1 });
  });
});

describe('handler', () => {
  it('returns the wrapped response on success', async () => {
    const res = await handler(() => json({ ok: true }))(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('maps HttpError (4xx) to its status, message, and headers', async () => {
    const res = await handler(() => {
      throw new HttpError(429, 'Too many requests', { 'Retry-After': '30' });
    })(ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });

  it('hides HttpError (5xx) messages and logs them', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(() => {
      throw new HttpError(500, 'Missing environment variable SECRET');
    })(ctx());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });

  it('maps zod errors to 400 with issues', async () => {
    const res = await handler(() => {
      z.object({ n: z.number() }).parse({ n: 'x' });
      return json({});
    })(ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
    expect(body.issues[0].path).toBe('n');
  });

  it('maps unknown errors to a generic 500 without leaking the message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(() => {
      throw new Error('db password is hunter2');
    })(ctx());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('hunter2');
    expect(JSON.parse(text)).toEqual({ error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });
});

describe('readBody', () => {
  const schema = z.object({ prompt: z.string().max(5) });

  it('parses and validates JSON', async () => {
    expect(await readBody(post('{"prompt":"hi"}'), schema)).toEqual({ prompt: 'hi' });
  });

  it('throws HttpError 400 on malformed JSON', async () => {
    await expect(readBody(post('{nope'), schema)).rejects.toMatchObject({ status: 400 });
  });

  it('throws a ZodError on schema mismatch', async () => {
    await expect(readBody(post('{"prompt":"too long"}'), schema)).rejects.toHaveProperty('issues');
  });
});

describe('env helpers', () => {
  it('readEnv returns undefined for unset vars', () => {
    expect(readEnv('LAB_TEST_UNSET_VAR')).toBeUndefined();
  });

  it('requireEnv returns set values', () => {
    vi.stubEnv('LAB_TEST_VAR', 'value');
    expect(requireEnv('LAB_TEST_VAR')).toBe('value');
  });

  it('requireEnv throws a 500 HttpError naming the variable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => requireEnv('LAB_TEST_UNSET_VAR')).toThrow(/LAB_TEST_UNSET_VAR/);
    try {
      requireEnv('LAB_TEST_UNSET_VAR');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(500);
    }
  });
});
