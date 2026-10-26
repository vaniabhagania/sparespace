import { ceilToQuarterHour, parseIstInput, toIstInput, defaultStay } from "./time";

export type RawParams = Record<string, string | string[] | undefined>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export interface Window {
  start: Date;
  end: Date;
  startInput: string;
  endInput: string;
  /** Set when we had to change what the link asked for, so we can say so. */
  adjusted: string | null;
}

/**
 * Turns ?start=&end= (IST wall-clock strings) into a valid booking window:
 * on the quarter hour, not in the past, at least an hour long.
 */
export function resolveWindow(startRaw: string | undefined, endRaw: string | undefined, now = new Date()): Window {
  const s0 = startRaw ? parseIstInput(startRaw) : null;
  const e0 = endRaw ? parseIstInput(endRaw) : null;
  let adjusted: string | null = null;
  let start: Date;
  let end: Date;

  if (!s0 || !e0) {
    const d = defaultStay(now);
    start = parseIstInput(d.start)!;
    end = parseIstInput(d.end)!;
    if (startRaw || endRaw) adjusted = "We couldn't read those times, so we picked a sensible slot.";
  } else {
    start = ceilToQuarterHour(s0);
    end = ceilToQuarterHour(e0);
    if (start.getTime() < now.getTime() - 10 * 60_000) {
      const d = defaultStay(now);
      start = parseIstInput(d.start)!;
      end = new Date(start.getTime() + Math.max(2 * 3_600_000, end.getTime() - s0.getTime()));
      adjusted = "Those times had already passed, so we moved your search to the next free slot.";
    }
    if (end.getTime() - start.getTime() < 3_600_000) {
      end = new Date(start.getTime() + 3_600_000);
      adjusted = adjusted ?? "The minimum stay is 1 hour, so we set your leave time an hour after arrival.";
    }
  }
  return { start, end, startInput: toIstInput(start), endInput: toIstInput(end), adjusted };
}
