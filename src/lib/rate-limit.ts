import { db, type Queryable } from "./db";

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Sliding-window limiter backed by Postgres (works across serverless instances).
 * Counts first and only records the attempt when it is allowed.
 */
export async function hit(
  key: string,
  limit: number,
  windowSec: number,
  q: Queryable = db,
): Promise<RateResult> {
  const rows = await q.query<{ n: number; oldest: Date | null }>(
    `select count(*)::int as n, min(created_at) as oldest
       from rate_events
      where key = $1 and created_at > now() - make_interval(secs => $2)`,
    [key, windowSec],
  );
  const n = rows[0]?.n ?? 0;
  if (n >= limit) {
    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : Date.now();
    const retry = Math.max(1, Math.ceil((oldest + windowSec * 1000 - Date.now()) / 1000));
    return { allowed: false, retryAfterSec: retry };
  }
  await q.query("insert into rate_events (key) values ($1)", [key]);
  if (Math.random() < 0.02) {
    await q.query("delete from rate_events where created_at < now() - interval '2 days'").catch(() => {});
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function waitText(sec: number): string {
  if (sec < 90) return "a minute";
  if (sec < 3600) return `${Math.ceil(sec / 60)} minutes`;
  return `${Math.ceil(sec / 3600)} hours`;
}
