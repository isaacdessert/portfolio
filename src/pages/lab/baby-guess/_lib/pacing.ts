// Elimination pacing: how many Candidates are Eliminated as of a given Day. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §1.

import { addDays, daysBetween, type Day } from './days';

/** A re-settable starting point for pacing: `day` with `eliminated` already Eliminated. */
export interface Anchor {
  day: Day;
  eliminated: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** The count Eliminated as of `today`, per the spec's Pacing formula. */
export function eliminatedCount(total: number, anchor: Anchor, dueDate: Day, today: Day): number {
  const m = Math.max(1, daysBetween(anchor.day, dueDate));
  const r = total - anchor.eliminated;
  const k = clamp(daysBetween(anchor.day, today), 0, m);
  const extra = r <= m ? Math.max(0, r - (m - k)) : Math.floor((r * k) / m);
  return anchor.eliminated + extra;
}

/** Re-anchors at `today`, carrying forward what's already Eliminated under the old schedule. */
export function reanchor(total: number, anchor: Anchor, oldDueDate: Day, today: Day): Anchor {
  return { day: today, eliminated: eliminatedCount(total, anchor, oldDueDate, today) };
}

/** Each future Day whose midnight Eliminates at least one Candidate, in order, for the Host's schedule preview. */
export function upcoming(
  total: number,
  anchor: Anchor,
  dueDate: Day,
  today: Day,
): { day: Day; count: number }[] {
  const result: { day: Day; count: number }[] = [];
  let prev = eliminatedCount(total, anchor, dueDate, today);
  let day = today;
  while (prev < total) {
    day = addDays(day, 1);
    const next = eliminatedCount(total, anchor, dueDate, day);
    if (next > prev) result.push({ day, count: next - prev });
    prev = next;
  }
  return result;
}
