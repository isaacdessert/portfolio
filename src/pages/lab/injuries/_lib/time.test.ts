import { describe, it, expect } from 'vitest';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('returns "just now" for under a minute', () => {
    expect(timeAgo('2026-09-29T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-09-29T12:00:00Z', now)).toBe('just now');
  });

  it('returns minutes for under an hour', () => {
    expect(timeAgo('2026-09-29T11:55:00Z', now)).toBe('5m');
    expect(timeAgo('2026-09-29T11:01:00Z', now)).toBe('59m');
  });

  it('returns hours for under a day', () => {
    expect(timeAgo('2026-09-29T09:00:00Z', now)).toBe('3h');
    expect(timeAgo('2026-09-28T13:00:00Z', now)).toBe('23h');
  });

  it('returns days for a day or more', () => {
    expect(timeAgo('2026-09-27T12:00:00Z', now)).toBe('2d');
    expect(timeAgo('2026-09-01T12:00:00Z', now)).toBe('28d');
  });
});
