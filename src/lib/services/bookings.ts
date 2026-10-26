import { randomInt, timingSafeEqual } from "node:crypto";
import { db, type Queryable } from "../db";
import { isAvailable } from "../availability";
import { peakOverlap } from "../capacity";
import { checkFit } from "../fit";
import { isQuarterHour } from "../time";
import { computePrice } from "../pricing";
import { hit, waitText } from "../rate-limit";
import { fail, type BookingRow, type Result, type SpaceRow } from "./types";

const MIN_STAY_MS = 60 * 60_000;
const MAX_STAY_MS = 30 * 24 * 3_600_000;
const MAX_ADVANCE_MS = 90 * 24 * 3_600_000;
const PAST_SLACK_MS = 10 * 60_000;
const REQUEST_TTL_MS = 24 * 3_600_000;
const MAX_OPEN_REQUESTS = 3;
const CHECKIN_EARLY_MS = 30 * 60_000;
const NO_SHOW_AFTER_MS = 30 * 60_000;
const FREE_CANCEL_BEFORE_MS = 2 * 3_600_000;
const MAX_CODE_TRIES = 5;

const ACTIVE = `(status in ('confirmed','checked_in') or (status = 'pending' and expires_at > now()))`;

/** Housekeeping that runs lazily, so nothing depends on a cron job. */
export async function sweep(q: Queryable = db): Promise<void> {
  await q.query(`update bookings set status = 'expired', updated_at = now() where status = 'pending' and expires_at <= now()`);
  await q.query(
    `update bookings set status = 'completed', ended_at = end_at, updated_at = now()
      where status = 'checked_in' and end_at + interval '12 hours' <= now()`,
  );
}

export interface CreateBookingInput {
  driverId: string;
  spaceId: string;
  vehicleId: string;
  start: Date;
  end: Date;
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<Result<{ id: string; status: "pending" | "confirmed" }>> {
  const { driverId, spaceId, vehicleId, start, end } = input;
  const now = Date.now();

  if (!isQuarterHour(start) || !isQuarterHour(end)) return fail("Pick times on the quarter hour.");
  if (end.getTime() - start.getTime() < MIN_STAY_MS) return fail("The minimum stay is 1 hour.");
  if (end.getTime() - start.getTime() > MAX_STAY_MS) return fail("The longest stay is 30 days.");
  if (start.getTime() < now - PAST_SLACK_MS) return fail("That start time has already passed.");
  if (start.getTime() > now + MAX_ADVANCE_MS) return fail("You can book up to 90 days ahead.");

  return db.tx(async (q) => {
    // Lock order is always driver, then space. It keeps concurrent bookings from deadlocking.
    const drivers = await q.query<{ id: string; no_show_count: number }>(
      "select id, no_show_count from users where id = $1 and banned_at is null and deleted_at is null for update",
      [driverId],
    );
    const driver = drivers[0];
    if (!driver) return fail("This account can't make bookings.");

    const rl = await hit(`book:${driverId}`, 15, 3600, q);
    if (!rl.allowed) return fail(`You're booking very quickly. Try again in ${waitText(rl.retryAfterSec)}.`);

    const vehicles = await q.query<{
      id: string; label: string; kind: string; length_cm: number; width_cm: number; height_cm: number; plate: string | null;
    }>("select id, label, kind, length_cm, width_cm, height_cm, plate from vehicles where id = $1 and user_id = $2", [vehicleId, driverId]);
    const v = vehicles[0];
    if (!v) return fail("Choose one of your vehicles.");

    const spaces = await q.query<SpaceRow & { host_ok: boolean }>(
      `select s.*, (u.banned_at is null and u.deleted_at is null) as host_ok
         from spaces s join users u on u.id = s.host_id where s.id = $1 for update of s`,
      [spaceId],
    );
    const s = spaces[0];
    if (!s || s.status === "suspended" || !s.host_ok) return fail("This space isn't available.");
    if (s.status !== "active") return fail("This space isn't taking bookings right now.");
    if (s.host_id === driverId) return fail("You can't book your own space.");

    const fit = checkFit(
      { length_cm: v.length_cm, width_cm: v.width_cm, height_cm: v.height_cm },
      { max_length_cm: s.max_length_cm, max_width_cm: s.max_width_cm, max_height_cm: s.max_height_cm },
    );
    if (!fit.fits) return fail(`${v.label} won't fit here (${fit.reasons.join(", ")}).`);
    if (!isAvailable(s, start, end)) return fail("This space isn't open for the whole time you chose.");

    // One person can't hold two bays at once, and can't sit on a pile of unanswered requests.
    const mine = await q.query<{ status: string }>(
      `select status from bookings where driver_id = $1 and start_at < $3 and end_at > $2 and ${ACTIVE}`,
      [driverId, start, end],
    );
    if (mine.length) return fail("You already have a booking that overlaps this time.");
    const open = await q.query<{ n: number }>(
      "select count(*)::int as n from bookings where driver_id = $1 and status = 'pending' and expires_at > now()",
      [driverId],
    );
    if (open[0].n >= MAX_OPEN_REQUESTS) return fail("You have 3 requests waiting for an answer. Wait for a reply before sending more.");

    const busy = await q.query<{ start_at: Date; end_at: Date }>(
      `select start_at, end_at from bookings where space_id = $1 and start_at < $3 and end_at > $2 and ${ACTIVE}`,
      [spaceId, start, end],
    );
    const peak = peakOverlap(busy.map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) })), start, end);
    if (peak >= s.capacity) return fail("Someone just booked this space for that time. Try another time or space.");

    const price = computePrice({ priceHourPaise: s.price_hour_paise, priceDayPaise: s.price_day_paise, start, end });
    // Drivers with repeat no-shows always need the host's approval, even on instant-book spaces.
    const instant = s.instant_book && driver.no_show_count < 2;
    const code = String(randomInt(0, 10_000)).padStart(4, "0");
    const expires = instant ? null : new Date(Math.min(now + REQUEST_TTL_MS, start.getTime()));

    const rows = await q.query<{ id: string }>(
      `insert into bookings (space_id, driver_id, vehicle_id, vehicle_label, vehicle_kind, v_length_cm, v_width_cm,
         v_height_cm, vehicle_plate, start_at, end_at, status, price_paise, price_hour_paise, checkin_code, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
      [spaceId, driverId, v.id, v.label, v.kind, v.length_cm, v.width_cm, v.height_cm, v.plate, start, end,
       instant ? "confirmed" : "pending", price, s.price_hour_paise, code, expires],
    );
    return { ok: true, id: rows[0].id, status: instant ? "confirmed" : "pending" } as const;
  });
}

/** Loads a booking plus its space, only if the user is the driver or the host. */
export async function loadBookingFor(bookingId: string, userId: string, q: Queryable = db) {
  const rows = await q.query<BookingRow & { host_id: string; space_title: string; area_label: string }>(
    `select b.*, s.host_id, s.title as space_title, s.area_label
       from bookings b join spaces s on s.id = b.space_id
      where b.id = $1 and (b.driver_id = $2 or s.host_id = $2)`,
    [bookingId, userId],
  );
  return rows[0] ?? null;
}

export async function hostDecision(bookingId: string, hostId: string, approve: boolean): Promise<Result> {
  return db.tx(async (q) => {
    const pre = await q.query<{ space_id: string }>(
      "select b.space_id from bookings b join spaces s on s.id = b.space_id where b.id = $1 and s.host_id = $2",
      [bookingId, hostId],
    );
    if (!pre[0]) return fail("Booking not found.");
    await q.query("select id from spaces where id = $1 for update", [pre[0].space_id]);
    const rows = await q.query<BookingRow>("select * from bookings where id = $1 for update", [bookingId]);
    const b = rows[0];
    if (b.status !== "pending") return fail("This request has already been answered or has expired.");
    if (b.expires_at && new Date(b.expires_at).getTime() <= Date.now()) {
      await q.query("update bookings set status = 'expired', updated_at = now() where id = $1", [bookingId]);
      return fail("This request expired before it was answered.");
    }
    await q.query(
      "update bookings set status = $2, expires_at = null, updated_at = now() where id = $1",
      [bookingId, approve ? "confirmed" : "declined"],
    );
    return { ok: true };
  });
}

export async function cancelBooking(bookingId: string, userId: string): Promise<Result<{ late: boolean }>> {
  return db.tx(async (q) => {
    const b = await loadBookingFor(bookingId, userId, q);
    if (!b) return fail("Booking not found.");
    const locked = await q.query<BookingRow>("select * from bookings where id = $1 for update", [bookingId]);
    const cur = locked[0];
    if (!["pending", "confirmed"].includes(cur.status)) return fail("This booking can't be cancelled any more.");
    const isDriver = b.driver_id === userId;
    const msToStart = new Date(cur.start_at).getTime() - Date.now();

    if (isDriver) {
      const late = cur.status === "confirmed" && msToStart < FREE_CANCEL_BEFORE_MS;
      await q.query("update bookings set status = 'cancelled_by_driver', updated_at = now() where id = $1", [bookingId]);
      if (late) await q.query("update users set late_cancel_count = late_cancel_count + 1 where id = $1", [userId]);
      return { ok: true, late };
    }
    await q.query("update bookings set status = 'cancelled_by_host', updated_at = now() where id = $1", [bookingId]);
    if (cur.status === "confirmed") {
      await q.query("update users set host_cancel_count = host_cancel_count + 1 where id = $1", [userId]);
    }
    return { ok: true, late: false };
  });
}

/** The host enters the 4-digit arrival code the driver shows them. */
export async function checkIn(bookingId: string, hostId: string, code: string): Promise<Result<{ triesLeft?: number }>> {
  return db.tx(async (q) => {
    const rows = await q.query<BookingRow>(
      `select b.* from bookings b join spaces s on s.id = b.space_id
        where b.id = $1 and s.host_id = $2 for update of b`,
      [bookingId, hostId],
    );
    const b = rows[0];
    if (!b) return fail("Booking not found.");
    if (b.status === "checked_in") return fail("This driver is already checked in.");
    if (b.status !== "confirmed") return fail("Only confirmed bookings can be checked in.");
    const now = Date.now();
    if (now < new Date(b.start_at).getTime() - CHECKIN_EARLY_MS) return fail("Too early. Check-in opens 30 minutes before the start time.");
    if (now >= new Date(b.end_at).getTime()) return fail("This booking has ended.");
    if (b.checkin_attempts >= MAX_CODE_TRIES) {
      return fail("Too many wrong codes. Ask the driver to open their booking, or report a problem.");
    }
    const a = Buffer.from(b.checkin_code);
    const c = Buffer.from(code);
    const match = a.length === c.length && timingSafeEqual(a, c);
    if (!match) {
      await q.query("update bookings set checkin_attempts = checkin_attempts + 1, updated_at = now() where id = $1", [bookingId]);
      return { ok: false, error: `That code isn't right. ${MAX_CODE_TRIES - b.checkin_attempts - 1} tries left.` };
    }
    await q.query("update bookings set status = 'checked_in', checked_in_at = now(), updated_at = now() where id = $1", [bookingId]);
    return { ok: true };
  });
}

/** Driver says they've left, or the host confirms the bay is free again. */
export async function completeBooking(bookingId: string, userId: string): Promise<Result> {
  return db.tx(async (q) => {
    const b = await loadBookingFor(bookingId, userId, q);
    if (!b) return fail("Booking not found.");
    const rows = await q.query<{ id: string }>(
      "update bookings set status = 'completed', ended_at = now(), updated_at = now() where id = $1 and status = 'checked_in' returning id",
      [bookingId],
    );
    return rows.length ? { ok: true } : fail("Only a stay in progress can be finished.");
  });
}

export async function markNoShow(bookingId: string, hostId: string): Promise<Result> {
  return db.tx(async (q) => {
    const rows = await q.query<BookingRow>(
      `select b.* from bookings b join spaces s on s.id = b.space_id
        where b.id = $1 and s.host_id = $2 for update of b`,
      [bookingId, hostId],
    );
    const b = rows[0];
    if (!b) return fail("Booking not found.");
    if (b.status !== "confirmed") return fail("Only a confirmed booking that nobody checked in for can be a no-show.");
    if (Date.now() < new Date(b.start_at).getTime() + NO_SHOW_AFTER_MS) {
      return fail("You can mark a no-show 30 minutes after the start time.");
    }
    await q.query("update bookings set status = 'no_show', updated_at = now() where id = $1", [bookingId]);
    await q.query("update users set no_show_count = no_show_count + 1 where id = $1", [b.driver_id]);
    return { ok: true };
  });
}

export async function markPaid(bookingId: string, hostId: string, via: "cash" | "upi"): Promise<Result> {
  const rows = await db.query<{ id: string }>(
    `update bookings b set payment_status = 'paid', paid_via = $3, updated_at = now()
       from spaces s
      where b.id = $1 and s.id = b.space_id and s.host_id = $2
        and b.status in ('checked_in','completed') and b.payment_status = 'unpaid'
      returning b.id`,
    [bookingId, hostId, via],
  );
  return rows.length ? { ok: true } : fail("You can mark a stay as paid once the driver has checked in.");
}

/** Driver says "I didn't pay this" or "this amount is wrong". Creates a complaint for review. */
export async function disputePayment(bookingId: string, driverId: string): Promise<Result> {
  return db.tx(async (q) => {
    const rows = await q.query<BookingRow & { host_id: string }>(
      `select b.*, s.host_id from bookings b join spaces s on s.id = b.space_id
        where b.id = $1 and b.driver_id = $2 for update of b`,
      [bookingId, driverId],
    );
    const b = rows[0];
    if (!b) return fail("Booking not found.");
    if (b.payment_status !== "paid") return fail("There is nothing to dispute yet.");
    await q.query("update bookings set payment_status = 'disputed', updated_at = now() where id = $1", [bookingId]);
    await q.query(
      `insert into complaints (filed_by, booking_id, space_id, against_user_id, category, details)
       values ($1, $2, $3, $4, 'payment', 'Driver disputed the payment recorded by the host for this stay.')`,
      [driverId, bookingId, b.space_id, b.host_id],
    );
    return { ok: true };
  });
}

export async function listDriverBookings(driverId: string) {
  await sweep();
  return db.query<BookingRow & { space_title: string; area_label: string; host_id: string }>(
    `select b.*, s.title as space_title, s.area_label, s.host_id
       from bookings b join spaces s on s.id = b.space_id
      where b.driver_id = $1 order by b.start_at desc limit 100`,
    [driverId],
  );
}

export async function listHostBookings(hostId: string) {
  await sweep();
  return db.query<BookingRow & { space_title: string; area_label: string; driver_name: string | null; driver_no_shows: number }>(
    `select b.*, s.title as space_title, s.area_label, u.nickname as driver_name, u.no_show_count as driver_no_shows
       from bookings b join spaces s on s.id = b.space_id join users u on u.id = b.driver_id
      where s.host_id = $1 order by b.start_at desc limit 150`,
    [hostId],
  );
}
