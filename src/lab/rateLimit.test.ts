import { describe, it, expect, vi, beforeEach } from 'vitest';

const { limitMock, ctorSpy } = vi.hoisted(() => ({ limitMock: vi.fn(), ctorSpy: vi.fn() }));

vi.mock('./kv', () => ({ getRedis: () => ({ fake: 'redis' }) }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn((limit: number, window: string) => ({ limit, window }));
    limit = limitMock;
    constructor(opts: unknown) {
      ctorSpy(opts);
    }
  },
}));

import { clientIp, rateLimit } from './rateLimit';
import { HttpError } from './api';

const req = (headers: Record<string, string> = {}) => new Request('https://x.test/', { headers });

beforeEach(() => {
  limitMock.mockReset();
});

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
  });
  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientIp(req({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(req())).toBe('unknown');
  });
});

describe('rateLimit', () => {
  const opts = { slug: 'hello', id: 'visit', limit: 10, window: '1 m' as const };

  it('resolves when under the limit and keys by IP', async () => {
    limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    await expect(rateLimit(req({ 'x-real-ip': '9.9.9.9' }), opts)).resolves.toBeUndefined();
    expect(limitMock).toHaveBeenCalledWith('9.9.9.9');
    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'lab:hello:rl:visit', limiter: { limit: 10, window: '1 m' } }),
    );
  });

  it('throws 429 with Retry-After when limited', async () => {
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });
    const err = await rateLimit(req(), opts).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(Number(err.headers['Retry-After'])).toBeGreaterThanOrEqual(29);
    expect(Number(err.headers['Retry-After'])).toBeLessThanOrEqual(30);
  });

  it('reuses one limiter per slug/id/limit/window', async () => {
    limitMock.mockResolvedValue({ success: true, reset: Date.now() });
    const before = ctorSpy.mock.calls.length;
    await rateLimit(req(), { ...opts, id: 'reuse' });
    await rateLimit(req(), { ...opts, id: 'reuse' });
    expect(ctorSpy.mock.calls.length - before).toBe(1);
  });
});
