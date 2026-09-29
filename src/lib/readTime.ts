/** Rough reading time at ~200 words per minute (minimum 1). */
export function estimateReadTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
