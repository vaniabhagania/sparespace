/**
 * The most bookings that are active at the same instant inside [start, end).
 * Windows are half-open ([start, end)), so back-to-back stays never overlap.
 * A space with N bays can take another booking only if this peak is below N.
 */
export function peakOverlap(
  windows: { start: Date; end: Date }[],
  start: Date,
  end: Date,
): number {
  const s = start.getTime();
  const e = end.getTime();
  const events: [number, number][] = [];
  for (const w of windows) {
    const ws = Math.max(w.start.getTime(), s);
    const we = Math.min(w.end.getTime(), e);
    if (we <= ws) continue;
    events.push([ws, 1], [we, -1]);
  }
  // At equal times process ends (-1) before starts (+1).
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let peak = 0;
  for (const [, d] of events) {
    cur += d;
    if (cur > peak) peak = cur;
  }
  return peak;
}
