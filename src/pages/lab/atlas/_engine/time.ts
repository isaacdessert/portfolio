const yearSpan = (y: number) => [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)] as const;

/** Fractional year → ISO date (UTC). */
export function yearToDate(year: number): string {
  const y = Math.floor(year);
  const [start, end] = yearSpan(y);
  return new Date(start + (year - y) * (end - start)).toISOString().slice(0, 10);
}

/** ISO date → fractional year (start of that day). */
export function dateToYear(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [start, end] = yearSpan(y);
  return y + (Date.UTC(y, m - 1, d) - start) / (end - start);
}
