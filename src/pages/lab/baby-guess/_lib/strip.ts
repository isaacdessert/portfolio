// Layout math for a Birth Details results chart: a compact strip (dot) plot, one per category,
// with equal values stacked into levels. Pure and browser-safe — no DOM, no `_lib` imports. See
// docs/superpowers/specs/2026-11-19-baby-guess-birth-details-design.md "Charts".

/** One value to plot: a Guesser's name and their value on the category's numeric scale. */
export interface StripPoint {
  label: string;
  value: number;
}

/** A `StripPoint` positioned on the chart. `level` 0 is the bottom of a stack of equal values. */
export interface StripDot extends StripPoint {
  x: number;
  level: number;
}

export interface StripLayout {
  dots: StripDot[];
  /** The real value's x position, on the same scale as `dots`. */
  realX: number;
  min: number;
  max: number;
  /** The highest level used, plus one; 0 when there are no points. */
  levels: number;
}

const DEFAULT_PADDING = 12;

/**
 * Lays out `points` (and the real value) along a horizontal strip `options.width` px wide.
 * Equal values stack upward as levels 0, 1, 2…, ordered by `label.localeCompare` within a tie.
 * The domain is `options.domain` if given, else the min/max across every point and `real`,
 * widened by 1 on each side if they'd otherwise be equal (so nothing divides by zero).
 */
export function stripLayout(
  points: readonly StripPoint[],
  real: number,
  options: { width: number; padding?: number; domain?: [number, number] },
): StripLayout {
  const padding = options.padding ?? DEFAULT_PADDING;
  const { width } = options;

  let [min, max] = options.domain ?? defaultDomain(points, real);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const scale = (value: number): number => padding + ((value - min) / (max - min)) * (width - 2 * padding);

  const sorted = [...points].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
  const nextLevel = new Map<number, number>();
  const dots: StripDot[] = sorted.map((point) => {
    const level = nextLevel.get(point.value) ?? 0;
    nextLevel.set(point.value, level + 1);
    return { label: point.label, value: point.value, x: scale(point.value), level };
  });

  const levels = dots.length === 0 ? 0 : Math.max(...dots.map((dot) => dot.level)) + 1;

  return { dots, realX: scale(real), min, max, levels };
}

function defaultDomain(points: readonly StripPoint[], real: number): [number, number] {
  const values = [...points.map((point) => point.value), real];
  return [Math.min(...values), Math.max(...values)];
}
