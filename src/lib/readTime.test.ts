import { describe, it, expect } from 'vitest';
import { estimateReadTime } from './readTime';

describe('estimateReadTime', () => {
  it('returns at least 1 minute', () => {
    expect(estimateReadTime('')).toBe(1);
    expect(estimateReadTime('one two three')).toBe(1);
  });

  it('rounds words / 200', () => {
    expect(estimateReadTime(Array(1000).fill('w').join(' '))).toBe(5);
    expect(estimateReadTime(Array(500).fill('w').join('  \n'))).toBe(3);
  });
});
