/**
 * SpareSpace launches in India, so every wall-clock time is India Standard Time
 * (UTC+05:30, no daylight saving). Instants are stored as timestamptz in the database.
 */
export const IST_OFFSET_MIN = 330;
const MIN = 60_000;

export interface IstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Monday ... 6 = Sunday
}

export function istParts(d: Date): IstParts {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * MIN);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: (shifted.getUTCDay() + 6) % 7,
  };
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Parse "YYYY-MM-DDTHH:mm" (what <input type="datetime-local"> submits) as India time. */
export function parseIstInput(value: string): Date | null {
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MIN * MIN;
  const date = new Date(utc);
  const back = istParts(date);
  // Reject overflow like 31 Feb or 25:00.
  if (back.year !== y || back.month !== mo || back.day !== d || back.hour !== h || back.minute !== mi) return null;
  return date;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toIstInput(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The next quarter hour at or after `from`, as an instant. */
export function ceilToQuarterHour(from: Date): Date {
  const q = 15 * MIN;
  return new Date(Math.ceil(from.getTime() / q) * q);
}

export function isQuarterHour(d: Date): boolean {
  return d.getTime() % (15 * MIN) === 0;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDate(d: Date): string {
  return dateFmt.format(d);
}

export function formatTime(d: Date): string {
  return timeFmt.format(d).replace(" ", " ").toLowerCase();
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function formatRange(start: Date, end: Date): string {
  const sp = istParts(start);
  const ep = istParts(end);
  const sameDay = sp.year === ep.year && sp.month === ep.month && sp.day === ep.day;
  return sameDay
    ? `${formatDate(start)}, ${formatTime(start)} to ${formatTime(end)}`
    : `${formatDateTime(start)} to ${formatDateTime(end)}`;
}

export function formatMinuteOfDay(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

export function formatDuration(start: Date, end: Date): string {
  const mins = Math.round((end.getTime() - start.getTime()) / MIN);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} day${d > 1 ? "s" : ""}`);
  if (h) parts.push(`${h} hr`);
  if (m) parts.push(`${m} min`);
  return parts.join(" ") || "0 min";
}

/** Sensible defaults for a booking form: arrive in about half an hour, stay two hours. */
export function defaultStay(now = new Date(), leadMin = 30, hours = 2): { start: string; end: string } {
  const s = ceilToQuarterHour(new Date(now.getTime() + leadMin * MIN));
  const e = new Date(s.getTime() + hours * 60 * MIN);
  return { start: toIstInput(s), end: toIstInput(e) };
}
