// Calendar Days in America/Chicago and day arithmetic. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

const CENTRAL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** A calendar date in `YYYY-MM-DD` form, with no time of day or zone of its own. */
export type Day = string;

/**
 * The calendar Day in America/Chicago containing `now`. Assembled from `formatToParts`'s
 * year/month/day values rather than the formatter's own date pattern, so the `YYYY-MM-DD` shape
 * can't shift with the locale's separator or field order.
 */
export function centralDay(now: Date): Day {
  const parts = CENTRAL_FORMATTER.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function toUtcMs(day: Day): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

function fromUtcMs(ms: number): Day {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const date = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

/** `day` shifted by `n` calendar days (negative moves earlier). */
export function addDays(day: Day, n: number): Day {
  return fromUtcMs(toUtcMs(day) + n * MS_PER_DAY);
}

/** The number of calendar days from `from` to `to` (`to − from`); negative if `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Whether `s` is a `YYYY-MM-DD` string naming a real calendar date. */
export function isDay(s: string): boolean {
  if (!DAY_PATTERN.test(s)) return false;
  const [year, month, date] = s.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, date));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === date;
}
