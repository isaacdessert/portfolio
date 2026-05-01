import { describe, it, expect } from 'vitest';
import { toSlug } from './slug';

describe('toSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toSlug('Hello World')).toBe('hello-world');
  });

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(toSlug('My Post: A Story!')).toBe('my-post-a-story');
  });

  it('collapses multiple spaces into one hyphen', () => {
    expect(toSlug('Too   Many   Spaces')).toBe('too-many-spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(toSlug('  padded  ')).toBe('padded');
  });

  it('handles hyphens already in the title', () => {
    expect(toSlug('Well-Known Pattern')).toBe('well-known-pattern');
  });

  it('returns empty string for blank input', () => {
    expect(toSlug('')).toBe('');
  });
});
