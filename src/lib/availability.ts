import { formatMinuteOfDay, istParts } from "./time";

export interface Schedule {
  days_mask: number; // bit0 = Monday ... bit6 = Sunday
  open_minute: number; // minutes from midnight, India time
  close_minute: number; // 1440 = midnight; <= open_minute means the window runs overnight
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const STEP_MS = 15 * 60_000;

const hasDay = (mask: number, weekday: number) => (mask & (1 << weekday)) !== 0;

/** Is the space open at this exact instant? */
export function isOpenAt(s: Schedule, at: Date): boolean {
  const p = istParts(at);
  const m = p.hour * 60 + p.minute;
  const { open_minute: open, close_minute: close, days_mask: mask } = s;
  if (open < close) return hasDay(mask, p.weekday) && m >= open && m < close;
  // Overnight window: the evening part belongs to today, the morning part to yesterday's window.
  const prev = (p.weekday + 6) % 7;
  return (m >= open && hasDay(mask, p.weekday)) || (m < close && hasDay(mask, prev));
}

/**
 * True only if the space is open for the whole stay. Times are checked in 15-minute steps;
 * bookings and opening hours are both restricted to quarter hours, so this is exact.
 */
export function isAvailable(s: Schedule, start: Date, end: Date): boolean {
  if (!(end > start)) return false;
  for (let t = start.getTime(); t < end.getTime(); t += STEP_MS) {
    if (!isOpenAt(s, new Date(t))) return false;
  }
  return true;
}

export function describeSchedule(s: Schedule): string {
  const allDays = s.days_mask === 127;
  const days = allDays ? "Every day" : describeDays(s.days_mask);
  const allDay = s.open_minute === 0 && s.close_minute === 1440;
  if (allDay) return allDays ? "Every day, any time" : `${days}, any time`;
  const hours = `${formatMinuteOfDay(s.open_minute)} to ${formatMinuteOfDay(s.close_minute % 1440)}`;
  const overnight = s.close_minute <= s.open_minute;
  return `${days}, ${hours}${overnight ? " (overnight)" : ""}`;
}

function describeDays(mask: number): string {
  const on = DAY_NAMES.filter((_, i) => hasDay(mask, i));
  if (mask === 31) return "Mon to Fri";
  if (mask === 96) return "Sat and Sun";
  return on.join(", ");
}

export function maskFromDays(days: number[]): number {
  return days.reduce((m, d) => (d >= 0 && d <= 6 ? m | (1 << d) : m), 0);
}

export function daysFromMask(mask: number): number[] {
  return DAY_NAMES.map((_, i) => i).filter((i) => hasDay(mask, i));
}
