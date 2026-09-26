import { describe, it, expect } from 'vitest';
import { slugError, isValidSlug } from './slug-rules.mjs';
import { defineLab } from './meta';

describe('slug rules', () => {
  it.each(['hello', 'pixel-garden', 'a1', 'x-2-y'])('accepts %s', (slug) => {
    expect(slugError(slug)).toBeNull();
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    ['', 'required'],
    ['Pixel', 'kebab-case'],
    ['pixel_garden', 'kebab-case'],
    ['-lead', 'kebab-case'],
    ['trail-', 'kebab-case'],
    ['dou--ble', 'kebab-case'],
    ['a'.repeat(41), '40'],
    ['www', 'reserved'],
    ['api', 'reserved'],
    ['lab', 'reserved'],
  ])('rejects %j', (slug, fragment) => {
    expect(slugError(slug)).toContain(fragment);
    expect(isValidSlug(slug)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(slugError(undefined)).toContain('required');
  });
});

describe('defineLab', () => {
  const valid = {
    title: 'Pixel Garden',
    description: 'Grow a garden.',
    date: '2026-09-25',
    status: 'live' as const,
  };

  it('returns parsed metadata with default tags', () => {
    expect(defineLab(valid)).toEqual({ ...valid, tags: [] });
  });

  it('keeps provided tags', () => {
    expect(defineLab({ ...valid, tags: ['toy'] }).tags).toEqual(['toy']);
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ description: '' }, 'description'],
    [{ date: '09/25/2026' }, 'date'],
    [{ date: '2026-13-01' }, 'date'],
    [{ status: 'done' }, 'status'],
  ])('throws a descriptive error for %j', (override, field) => {
    expect(() => defineLab({ ...valid, ...override } as never)).toThrow(
      new RegExp(`Invalid lab _meta\\.ts.*${field}`),
    );
  });
});
