import { describe, it, expect } from 'vitest';
import { SITE_ORIGIN, siteUrl, labUrl } from './url';

describe('siteUrl', () => {
  it('builds absolute URLs on the site origin', () => {
    expect(SITE_ORIGIN).toBe('https://isaacjdessert.dev');
    expect(siteUrl('/about')).toBe('https://isaacjdessert.dev/about');
    expect(siteUrl('/')).toBe('https://isaacjdessert.dev/');
    expect(siteUrl('lab')).toBe('https://isaacjdessert.dev/lab');
  });
});

describe('labUrl', () => {
  it('returns the project root with trailing slash', () => {
    expect(labUrl('hello')).toBe('/lab/hello/');
  });

  it('joins sub-paths without doubling slashes', () => {
    expect(labUrl('hello', 'api/visits')).toBe('/lab/hello/api/visits');
    expect(labUrl('hello', '/api/visits')).toBe('/lab/hello/api/visits');
  });
});
