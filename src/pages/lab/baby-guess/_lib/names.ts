// Guess and Candidate name rules. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

const CURLY_APOSTROPHE_PATTERN = /[‘’]/g;
const COMBINING_MARK_PATTERN = /\p{M}/gu;
const TITLE_CASE_PATTERN = /(^|[ '-])(\S)/gu;
const NAME_PART_PATTERN = /^[\p{L}\p{M}' -]+$/u;
const CONTROL_CHAR_PATTERN = /\p{Cc}/u;

/** Trims, collapses internal whitespace to one space, and straightens curly apostrophes. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(CURLY_APOSTROPHE_PATTERN, "'");
}

/** Case- and accent-insensitive comparison key: the Candidate key and the Guesser id. */
export function normalize(raw: string): string {
  return cleanName(raw).normalize('NFD').replace(COMBINING_MARK_PATTERN, '').toLowerCase();
}

/** Title-cases all-lower or all-upper input; leaves deliberate mixed case (e.g. "McKenzie") unchanged. */
export function displaySpelling(raw: string): string {
  const cleaned = cleanName(raw);
  const isAllLower = cleaned === cleaned.toLowerCase();
  const isAllUpper = cleaned === cleaned.toUpperCase();
  if (!isAllLower && !isAllUpper) return cleaned;
  return cleaned.toLowerCase().replace(TITLE_CASE_PATTERN, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** A first or middle name part: 1–30 characters of letters/marks, spaces, hyphens and apostrophes. */
export function isNamePart(raw: string): boolean {
  const cleaned = cleanName(raw);
  return cleaned.length >= 1 && cleaned.length <= 30 && NAME_PART_PATTERN.test(cleaned);
}

/** A Guesser's display name: 1–50 printable characters. */
export function isGuesserName(raw: string): boolean {
  const cleaned = cleanName(raw);
  return cleaned.length >= 1 && cleaned.length <= 50 && !CONTROL_CHAR_PATTERN.test(cleaned);
}
