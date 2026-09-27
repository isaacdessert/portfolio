import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './kv';
import { HttpError } from './api';

export type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

export interface RateLimitOptions {
  slug: string;
  id: string;
  limit: number;
  window: Duration;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

const limiters = new Map<string, Ratelimit>();

function getLimiter({ slug, id, limit, window }: RateLimitOptions): Ratelimit {
  const key = `${slug}:${id}:${limit}:${window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `lab:${slug}:rl:${id}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/** Per-IP sliding-window limit. Throws HttpError(429) with Retry-After when exceeded. */
export async function rateLimit(request: Request, options: RateLimitOptions): Promise<void> {
  const { success, reset } = await getLimiter(options).limit(clientIp(request));
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    throw new HttpError(429, 'Too many requests', { 'Retry-After': String(retryAfter) });
  }
}
