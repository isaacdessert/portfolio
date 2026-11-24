// Birth Details: validation, distances and Closest Winners. See
// docs/superpowers/specs/2026-11-19-baby-guess-birth-details-design.md "Builder's calls".

import { addDays, daysBetween, isDay, type Day } from './days';

export type BirthCategory = 'date' | 'time' | 'weight' | 'length';
export const BIRTH_CATEGORIES: readonly BirthCategory[] = ['date', 'time', 'weight', 'length'];

/** One Guesser's (or the real) birth date, time, weight (whole ounces) and length (inches, by halves). */
export interface BirthDetails {
  date: Day;
  time: string;
  weightOz: number;
  lengthIn: number;
}

/** How many days either side of the Due Date a guessed birth date may fall. */
export const DATE_WINDOW_DAYS = 30;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const GUESS_WEIGHT_MIN_OZ = 32;
const GUESS_WEIGHT_MAX_OZ = 239;
const GUESS_LENGTH_MIN_IN = 12;
const GUESS_LENGTH_MAX_IN = 26;
const REAL_WEIGHT_MIN_OZ = 8;
const REAL_WEIGHT_MAX_OZ = 320;
const REAL_LENGTH_MIN_IN = 8;
const REAL_LENGTH_MAX_IN = 32;

/** Whether `s` is a 24-hour `HH:MM` time of day. */
export function isTime(s: string): boolean {
  return TIME_PATTERN.test(s);
}

function isHalfInchMultiple(inches: number): boolean {
  return Number.isInteger(inches * 2);
}

function weightProblem(weightOz: number, min: number, max: number, message: string): string | null {
  return Number.isInteger(weightOz) && weightOz >= min && weightOz <= max ? null : message;
}

function lengthProblem(lengthIn: number, min: number, max: number, message: string): string | null {
  return isHalfInchMultiple(lengthIn) && lengthIn >= min && lengthIn <= max ? null : message;
}

/** The first problem with a Guess's Birth Details against `dueDate`'s window, or `null` if valid. */
export function guessBirthProblem(birth: BirthDetails, dueDate: Day): string | null {
  if (!isDay(birth.date)) return 'Pick a birth date.';
  const min = addDays(dueDate, -DATE_WINDOW_DAYS);
  const max = addDays(dueDate, DATE_WINDOW_DAYS);
  if (birth.date < min || birth.date > max) {
    return `Pick a birth date between ${formatShortDay(min)} and ${formatShortDay(max)}.`;
  }
  if (!isTime(birth.time)) return 'Pick a time of birth.';
  const weight = weightProblem(
    birth.weightOz,
    GUESS_WEIGHT_MIN_OZ,
    GUESS_WEIGHT_MAX_OZ,
    `Pick a weight between ${formatOz(GUESS_WEIGHT_MIN_OZ)} and ${formatOz(GUESS_WEIGHT_MAX_OZ)}.`,
  );
  if (weight) return weight;
  return lengthProblem(
    birth.lengthIn,
    GUESS_LENGTH_MIN_IN,
    GUESS_LENGTH_MAX_IN,
    `Pick a length between ${GUESS_LENGTH_MIN_IN} and ${GUESS_LENGTH_MAX_IN} in, in half inches.`,
  );
}

/** The first problem with the Host's real Birth Details (wider ranges than a Guess), or `null` if valid. */
export function realBirthProblem(birth: BirthDetails): string | null {
  if (!isDay(birth.date)) return 'Pick a birth date.';
  if (!isTime(birth.time)) return 'Pick a time of birth.';
  const weight = weightProblem(
    birth.weightOz,
    REAL_WEIGHT_MIN_OZ,
    REAL_WEIGHT_MAX_OZ,
    `The real weight must be between ${formatOz(REAL_WEIGHT_MIN_OZ)} and ${formatOz(REAL_WEIGHT_MAX_OZ)}.`,
  );
  if (weight) return weight;
  return lengthProblem(
    birth.lengthIn,
    REAL_LENGTH_MIN_IN,
    REAL_LENGTH_MAX_IN,
    `The real length must be between ${REAL_LENGTH_MIN_IN} and ${REAL_LENGTH_MAX_IN} in, in half inches.`,
  );
}

/** `category`'s value on a single numeric scale: date → days since 1970-01-01, time → minutes, weight → oz, length → in. */
export function birthValue(category: BirthCategory, birth: BirthDetails): number {
  if (category === 'date') return daysBetween('1970-01-01', birth.date);
  if (category === 'time') {
    const [hours, minutes] = birth.time.split(':').map(Number);
    return hours * 60 + minutes;
  }
  if (category === 'weight') return birth.weightOz;
  return birth.lengthIn;
}

/** How far `guess` is from `real` in `category`; time wraps around midnight. */
export function birthDistance(category: BirthCategory, guess: BirthDetails, real: BirthDetails): number {
  const diff = Math.abs(birthValue(category, guess) - birthValue(category, real));
  return category === 'time' ? Math.min(diff, 1440 - diff) : diff;
}

/** Per category, the Guessers closest to `real`, ties shared and listed alphabetically; Guesses without Birth Details are skipped. */
export function closestWinners(
  guesses: readonly { guesser: string; birth?: BirthDetails }[],
  real: BirthDetails,
): Record<BirthCategory, string[]> {
  const withBirth = guesses.filter((g): g is { guesser: string; birth: BirthDetails } => !!g.birth);
  const result = {} as Record<BirthCategory, string[]>;
  for (const category of BIRTH_CATEGORIES) {
    if (withBirth.length === 0) {
      result[category] = [];
      continue;
    }
    const distances = withBirth.map((g) => ({ guesser: g.guesser, distance: birthDistance(category, g.birth, real) }));
    const min = Math.min(...distances.map((d) => d.distance));
    result[category] = distances
      .filter((d) => d.distance === min)
      .map((d) => d.guesser)
      .sort((a, b) => a.localeCompare(b));
  }
  return result;
}

function formatOz(oz: number): string {
  const lb = Math.floor(oz / 16);
  const rem = oz - lb * 16;
  return `${lb} lb ${rem} oz`;
}

function formatTime(time: string): string {
  const [hh, mm] = time.split(':');
  const hour24 = Number(hh);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? 'am' : 'pm';
  return `${hour12}:${mm} ${period}`;
}

function formatLength(lengthIn: number): string {
  const whole = Math.trunc(lengthIn);
  return `${whole}${lengthIn % 1 !== 0 ? '½' : ''} in`;
}

/** `category`'s value formatted the way the copy shows it, e.g. '3:20 pm', '7 lb 8 oz', '20½ in'. */
export function formatBirthValue(category: BirthCategory, birth: BirthDetails): string {
  if (category === 'date') return formatShortDay(birth.date);
  if (category === 'time') return formatTime(birth.time);
  if (category === 'weight') return formatOz(birth.weightOz);
  return formatLength(birth.lengthIn);
}

/** All four Birth Details on one line, e.g. 'Apr 5 at 3:20 pm · 7 lb 8 oz · 20½ in'. */
export function formatBirthDetails(birth: BirthDetails): string {
  return `${formatBirthValue('date', birth)} at ${formatBirthValue('time', birth)} · ${formatBirthValue('weight', birth)} · ${formatBirthValue('length', birth)}`;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDay(day: Day, months: readonly string[]): string {
  const [, month, date] = day.split('-').map(Number);
  return `${months[month - 1]} ${date}`;
}

/** `day` as 'Apr 5'. Parses the `YYYY-MM-DD` string directly — never `Date`, so it can't shift with the viewer's time zone. */
export function formatShortDay(day: Day): string {
  return formatDay(day, MONTH_SHORT);
}

/** `day` as 'April 3'. Parses the `YYYY-MM-DD` string directly — never `Date`, so it can't shift with the viewer's time zone. */
export function formatLongDay(day: Day): string {
  return formatDay(day, MONTH_LONG);
}
