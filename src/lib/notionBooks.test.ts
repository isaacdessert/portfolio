import { describe, it, expect } from 'vitest';
import { pageToBook, sortBooks, type Book } from './notionBooks';

function makePage(properties: Record<string, any>) {
  return { properties };
}

describe('pageToBook', () => {
  it('reads the title from a "Title" property', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Staff Engineer' }] },
      Author: { type: 'rich_text', rich_text: [{ plain_text: 'Will Larson' }] },
      Status: { type: 'select', select: { name: 'Reading' } },
    });
    expect(pageToBook(page)).toEqual({
      title: 'Staff Engineer',
      author: 'Will Larson',
      status: 'reading',
      year: undefined,
      take: undefined,
      url: undefined,
    });
  });

  it('reads the title from a "Name" property (finds title by type, not by name)', () => {
    const page = makePage({
      Name: { type: 'title', title: [{ plain_text: 'An Elegant Puzzle' }] },
      Status: { type: 'select', select: { name: 'Read' } },
    });
    expect(pageToBook(page)?.title).toBe('An Elegant Puzzle');
  });

  it('is case-insensitive for status ("read")', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: { name: 'read' } },
    });
    expect(pageToBook(page)?.status).toBe('read');
  });

  it('is case-insensitive for status ("READ")', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: { name: 'READ' } },
    });
    expect(pageToBook(page)?.status).toBe('read');
  });

  it('returns null when the title is empty', () => {
    const page = makePage({
      Title: { type: 'title', title: [] },
      Status: { type: 'select', select: { name: 'Read' } },
    });
    expect(pageToBook(page)).toBeNull();
  });

  it('returns null when there is no title property at all', () => {
    const page = makePage({
      Status: { type: 'select', select: { name: 'Read' } },
    });
    expect(pageToBook(page)).toBeNull();
  });

  it('returns null when status is missing', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: null },
    });
    expect(pageToBook(page)).toBeNull();
  });

  it('returns null when status is an unknown value', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: { name: 'Abandoned' } },
    });
    expect(pageToBook(page)).toBeNull();
  });

  it('leaves optional fields undefined when Year is null, Take is empty, and Link is null', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: { name: 'Want' } },
      Year: { type: 'number', number: null },
      Take: { type: 'rich_text', rich_text: [] },
      Link: { type: 'url', url: null },
    });
    const book = pageToBook(page);
    expect(book?.year).toBeUndefined();
    expect(book?.take).toBeUndefined();
    expect(book?.url).toBeUndefined();
  });

  it('maps Year, Take, and Link when present', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: { name: 'Read' } },
      Year: { type: 'number', number: 2024 },
      Take: { type: 'rich_text', rich_text: [{ plain_text: 'Great read.' }] },
      Link: { type: 'url', url: 'https://example.com/book' },
    });
    expect(pageToBook(page)).toEqual({
      title: 'Book',
      author: '',
      status: 'read',
      year: 2024,
      take: 'Great read.',
      url: 'https://example.com/book',
    });
  });

  it('defaults author to an empty string when missing', () => {
    const page = makePage({
      Title: { type: 'title', title: [{ plain_text: 'Book' }] },
      Status: { type: 'select', select: { name: 'Want' } },
    });
    expect(pageToBook(page)?.author).toBe('');
  });
});

describe('sortBooks', () => {
  const a: Book = { title: 'B Book', author: '', status: 'read', year: 2023 };
  const b: Book = { title: 'A Book', author: '', status: 'read', year: 2023 };
  const c: Book = { title: 'Newest', author: '', status: 'read', year: 2024 };
  const d: Book = { title: 'No Year', author: '', status: 'want' };
  const e: Book = { title: 'Also No Year', author: '', status: 'want' };

  it('orders by year descending', () => {
    const sorted = sortBooks([a, c, b]);
    expect(sorted.map((x) => x.title)).toEqual(['Newest', 'A Book', 'B Book']);
  });

  it('puts books without a year last', () => {
    const sorted = sortBooks([d, c]);
    expect(sorted.map((x) => x.title)).toEqual(['Newest', 'No Year']);
  });

  it('breaks ties by title A to Z', () => {
    const sorted = sortBooks([a, b]);
    expect(sorted.map((x) => x.title)).toEqual(['A Book', 'B Book']);
  });

  it('breaks ties by title A to Z among books without a year', () => {
    const sorted = sortBooks([d, e]);
    expect(sorted.map((x) => x.title)).toEqual(['Also No Year', 'No Year']);
  });

  it('returns a new array without mutating the input', () => {
    const input = [a, c, b];
    const originalOrder = [...input];
    const sorted = sortBooks(input);
    expect(input).toEqual(originalOrder);
    expect(sorted).not.toBe(input);
  });
});
