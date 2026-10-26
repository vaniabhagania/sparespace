import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { at, randomPhoneHash, resetDatabase, spaceDefaults, TEST_DB_URL } from "./helpers";

process.env.POSTGRES_URL = TEST_DB_URL;

import { db, closeDb } from "@/lib/db";
import { upsertUserByPhoneHash, deleteAccount, updateProfile } from "@/lib/services/users";
import { addVehicle } from "@/lib/services/vehicles";
import { createSpace, updateSpace, getSpaceView, searchSpaces, setSpaceActive, type SpaceInput } from "@/lib/services/spaces";
import {
  createBooking, hostDecision, cancelBooking, checkIn, completeBooking, markNoShow, markPaid,
  disputePayment, sweep,
} from "@/lib/services/bookings";
import { createReview } from "@/lib/services/reviews";
import { fileComplaint, adminSetBanned } from "@/lib/services/complaints";
import { getOrCreateConversation, sendMessage, listMessages } from "@/lib/services/messages";
import { HIDDEN_CONTACT } from "@/lib/text";
import { VEHICLE_PRESETS } from "@/lib/fit";
import { maskFromDays } from "@/lib/availability";

let counter = 0;
async function mkUser() {
  const u = await upsertUserByPhoneHash(randomPhoneHash());
  return u.id;
}
async function mkCar(userId: string, kind: "hatchback" | "sedan" | "suv" | "bike" = "hatchback") {
  const d = VEHICLE_PRESETS[kind].dims;
  const r = await addVehicle(userId, { label: `My ${kind} ${++counter}`, kind, ...d, plate: null });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}
/** Insert directly so tests are not slowed down by per-host listing limits. */
async function mkSpace(hostId: string, over: Partial<SpaceInput & { status: string }> = {}) {
  const s = { ...spaceDefaults, ...over };
  const rows = await db.query<{ id: string }>(
    `insert into spaces (host_id, title, description, kind, area_label, address_line, lat, lng, max_length_cm,
       max_width_cm, max_height_cm, capacity, price_hour_paise, price_day_paise, instant_book, days_mask,
       open_minute, close_minute, access_notes, amenities, rights_confirmed, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,true,$21) returning id`,
    [hostId, s.title, s.description, s.kind, s.area_label, s.address_line, s.lat, s.lng, s.max_length_cm,
     s.max_width_cm, s.max_height_cm, s.capacity, s.price_hour_paise, s.price_day_paise, s.instant_book,
     s.days_mask, s.open_minute, s.close_minute, s.access_notes, s.amenities, (over as { status?: string }).status ?? "active"],
  );
  return rows[0].id;
}
async function book(driverId: string, spaceId: string, vehicleId: string, startH: number, endH: number) {
  return createBooking({ driverId, spaceId, vehicleId, start: at(startH), end: at(endH) });
}
async function bookOk(driverId: string, spaceId: string, vehicleId: string, startH = 5, endH = 8) {
  const r = await book(driverId, spaceId, vehicleId, startH, endH);
  if (!r.ok) throw new Error("booking failed: " + r.error);
  return r.id;
}
const sql = (text: string, params: unknown[] = []) => db.query(text, params);

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closeDb();
});

describe("database setup", () => {
  it("migrates on first use and turns on row level security for every table", async () => {
    await db.query("select 1");
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'ss_migrations'`,
    );
    expect(tables.length).toBeGreaterThanOrEqual(10);
    expect(tables.filter((t) => !t.relrowsecurity)).toEqual([]);
  });
  it("is idempotent when several cold starts race", async () => {
    await closeDb();
    await Promise.all([db.query("select 1"), db.query("select 1"), db.query("select 1")]);
    const m = await db.query("select * from ss_migrations");
    expect(m).toHaveLength(1);
  });
  it("stores only a hash of the phone number, and sign-in is idempotent", async () => {
    const h = randomPhoneHash();
    const a = await upsertUserByPhoneHash(h);
    const b = await upsertUserByPhoneHash(h);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(a.id).toBe(b.id);
  });
});

describe("booking rules", () => {
  it("request, then approve, gives a confirmed booking with a 4-digit code", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver), space = await mkSpace(host);
    const id = await bookOk(driver, space, car);
    let [b] = await sql("select status, checkin_code, expires_at, price_paise from bookings where id = $1", [id]);
    expect(b.status).toBe("pending");
    expect(b.checkin_code).toMatch(/^\d{4}$/);
    expect(b.expires_at).not.toBeNull();
    expect(b.price_paise).toBe(15000); // 3h * 50
    expect((await hostDecision(id, host, true)).ok).toBe(true);
    [b] = await sql("select status, expires_at from bookings where id = $1", [id]);
    expect(b.status).toBe("confirmed");
    expect(b.expires_at).toBeNull();
  });

  it("only the host of that space can decide", async () => {
    const host = await mkUser(), other = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const id = await bookOk(driver, space, car);
    expect((await hostDecision(id, other, true)).ok).toBe(false);
    expect((await hostDecision(id, driver, true)).ok).toBe(false);
  });

  it("instant-book spaces confirm immediately", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const r = await book(driver, space, car, 5, 7);
    expect(r.ok && r.status).toBe("confirmed");
  });

  it("drivers with repeat no-shows always need approval, even on instant-book", async () => {
    const host = await mkUser(), driver = await mkUser();
    await sql("update users set no_show_count = 2 where id = $1", [driver]);
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const r = await book(driver, space, car, 5, 7);
    expect(r.ok && r.status).toBe("pending");
  });

  it("rejects bad times", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const q = (start: Date, end: Date) => createBooking({ driverId: driver, spaceId: space, vehicleId: car, start, end });
    expect((await q(at(-3), at(-1))).ok).toBe(false); // in the past
    expect((await q(at(5), at(5.25))).ok).toBe(false); // under an hour
    expect((await q(at(5), at(4))).ok).toBe(false); // ends before it starts
    expect((await q(new Date(at(5).getTime() + 7 * 60_000), at(8))).ok).toBe(false); // off the quarter hour
    expect((await q(at(5), at(5 + 24 * 31))).ok).toBe(false); // over 30 days
    expect((await q(at(24 * 100), at(24 * 100 + 2))).ok).toBe(false); // over 90 days ahead
  });

  it("rejects your own space, someone else's vehicle, and a vehicle that doesn't fit", async () => {
    const host = await mkUser(), driver = await mkUser(), stranger = await mkUser();
    const space = await mkSpace(host);
    expect((await book(host, space, await mkCar(host), 5, 7)).ok).toBe(false);
    expect((await book(driver, space, await mkCar(stranger), 5, 7)).ok).toBe(false);
    const suv = await mkCar(driver, "suv");
    const tooBig = await mkSpace(host, { max_length_cm: 440 });
    const r = await book(driver, tooBig, suv, 5, 7);
    expect(!r.ok && r.error).toMatch(/too long/);
  });

  it("respects opening hours", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver);
    const never = await mkSpace(host, { days_mask: maskFromDays([0, 1, 2, 3, 4, 5, 6]), open_minute: 0, close_minute: 15 });
    const r = await book(driver, never, car, 5, 7);
    expect(!r.ok && r.error).toMatch(/isn't open/);
  });

  it("paused and suspended spaces can't be booked", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver);
    const paused = await mkSpace(host, { status: "paused" });
    const suspended = await mkSpace(host, { status: "suspended" });
    expect((await book(driver, paused, car, 5, 7)).ok).toBe(false);
    expect((await book(driver, suspended, car, 5, 7)).ok).toBe(false);
  });

  it("banned drivers can't book", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver), space = await mkSpace(host);
    await adminSetBanned(driver, true);
    expect((await book(driver, space, car, 5, 7)).ok).toBe(false);
  });

  it("price is snapshotted: later price changes don't touch an existing booking", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver), space = await mkSpace(host);
    const id = await bookOk(driver, space, car, 5, 7);
    await sql("update spaces set price_hour_paise = 99000 where id = $1", [space]);
    const [b] = await sql("select price_paise from bookings where id = $1", [id]);
    expect(b.price_paise).toBe(10000);
  });

  it("limits unanswered requests to 3 per driver", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver);
    const spaces = await Promise.all([1, 2, 3, 4].map(() => mkSpace(host)));
    for (let i = 0; i < 3; i++) await bookOk(driver, spaces[i], car, 5 + i * 3, 7 + i * 3);
    const r = await book(driver, spaces[3], car, 30, 32);
    expect(!r.ok && r.error).toMatch(/3 requests/);
  });
});

describe("double booking is impossible", () => {
  it("20 drivers racing for the same single bay: exactly one wins", async () => {
    const host = await mkUser();
    const space = await mkSpace(host, { capacity: 1, instant_book: true });
    const drivers = await Promise.all(Array.from({ length: 20 }, () => mkUser()));
    const cars = await Promise.all(drivers.map((d) => mkCar(d)));
    const results = await Promise.all(drivers.map((d, i) => book(d, space, cars[i], 10, 12)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [n] = await sql("select count(*)::int as n from bookings where space_id = $1", [space]);
    expect(n.n).toBe(1);
  });

  it("a 3-bay space takes exactly 3 simultaneous bookings", async () => {
    const host = await mkUser();
    const space = await mkSpace(host, { capacity: 3, instant_book: true });
    const drivers = await Promise.all(Array.from({ length: 12 }, () => mkUser()));
    const cars = await Promise.all(drivers.map((d) => mkCar(d)));
    const results = await Promise.all(drivers.map((d, i) => book(d, space, cars[i], 10, 12)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });

  it("partially overlapping stays count as simultaneous, back-to-back stays do not", async () => {
    const host = await mkUser();
    const space = await mkSpace(host, { capacity: 1, instant_book: true });
    const [d1, d2, d3, d4] = await Promise.all([mkUser(), mkUser(), mkUser(), mkUser()]);
    const [c1, c2, c3, c4] = await Promise.all([d1, d2, d3, d4].map((d) => mkCar(d)));
    expect((await book(d1, space, c1, 10, 12)).ok).toBe(true);
    expect((await book(d2, space, c2, 11, 13)).ok).toBe(false); // overlaps
    expect((await book(d3, space, c3, 12, 14)).ok).toBe(true); // starts exactly when the first ends
    expect((await book(d4, space, c4, 9, 10)).ok).toBe(true); // ends exactly when the first starts
  });

  it("capacity counts the peak, not the number of overlapping bookings", async () => {
    const host = await mkUser();
    const space = await mkSpace(host, { capacity: 2, instant_book: true });
    const ds = await Promise.all([mkUser(), mkUser(), mkUser(), mkUser()]);
    const cs = await Promise.all(ds.map((d) => mkCar(d)));
    expect((await book(ds[0], space, cs[0], 10, 12)).ok).toBe(true);
    expect((await book(ds[1], space, cs[1], 12, 14)).ok).toBe(true); // sequential, so still 1 bay used
    // 10-14 touches both existing stays but never more than one bay at a time
    expect((await book(ds[2], space, cs[2], 10, 14)).ok).toBe(true);
    expect((await book(ds[3], space, cs[3], 11, 13)).ok).toBe(false); // now two bays are busy at 11-12
  });

  it("one driver can't hold two bays at once, even when requests race", async () => {
    const host = await mkUser(), driver = await mkUser();
    const car = await mkCar(driver);
    const spaces = await Promise.all([1, 2, 3, 4, 5].map(() => mkSpace(host, { instant_book: true })));
    const results = await Promise.all(spaces.map((s) => book(driver, s, car, 10, 12)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("an unanswered request holds the bay, then frees it when it expires", async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser();
    const space = await mkSpace(host), ca = await mkCar(a), cb = await mkCar(b);
    const first = await bookOk(a, space, ca, 10, 12);
    expect((await book(b, space, cb, 10, 12)).ok).toBe(false);
    await sql("update bookings set expires_at = now() - interval '1 minute' where id = $1", [first]);
    expect((await book(b, space, cb, 10, 12)).ok).toBe(true);
    await sweep();
    const [row] = await sql("select status from bookings where id = $1", [first]);
    expect(row.status).toBe("expired");
  });

  it("a host can't approve an expired request", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 10, 12);
    await sql("update bookings set expires_at = now() - interval '1 minute' where id = $1", [id]);
    const r = await hostDecision(id, host, true);
    expect(r.ok).toBe(false);
  });

  it("cancelling frees the bay for someone else", async () => {
    const host = await mkUser(), a = await mkUser(), b = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), ca = await mkCar(a), cb = await mkCar(b);
    const first = await bookOk(a, space, ca, 20, 22);
    expect((await book(b, space, cb, 20, 22)).ok).toBe(false);
    expect((await cancelBooking(first, a)).ok).toBe(true);
    expect((await book(b, space, cb, 20, 22)).ok).toBe(true);
  });
});

describe("cancellations and strikes", () => {
  it("free cancel well ahead, strike when late, strike on host when they cancel a confirmed booking", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);

    const early = await bookOk(driver, space, car, 30, 32);
    const r1 = await cancelBooking(early, driver);
    expect(r1.ok && r1.late).toBe(false);

    const soon = await bookOk(driver, space, car, 1, 3);
    const r2 = await cancelBooking(soon, driver);
    expect(r2.ok && r2.late).toBe(true);
    const [u] = await sql("select late_cancel_count from users where id = $1", [driver]);
    expect(u.late_cancel_count).toBe(1);

    const other = await bookOk(driver, space, car, 40, 42);
    expect((await cancelBooking(other, host)).ok).toBe(true);
    const [h] = await sql("select host_cancel_count from users where id = $1", [host]);
    expect(h.host_cancel_count).toBe(1);
  });

  it("strangers can't cancel and a booking can't be cancelled twice", async () => {
    const host = await mkUser(), driver = await mkUser(), stranger = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 30, 32);
    expect((await cancelBooking(id, stranger)).ok).toBe(false);
    expect((await cancelBooking(id, driver)).ok).toBe(true);
    expect((await cancelBooking(id, driver)).ok).toBe(false);
  });
});

describe("arrival, payment and finishing", () => {
  async function confirmedNow() {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 1, 4);
    // Move the booking so it started 10 minutes ago.
    await sql("update bookings set start_at = now() - interval '10 minutes', end_at = now() + interval '3 hours' where id = $1", [id]);
    const [b] = await sql("select checkin_code from bookings where id = $1", [id]);
    return { host, driver, id, code: b.checkin_code as string };
  }

  it("check-in needs the right code, and wrong guesses are capped", async () => {
    const { host, id, code } = await confirmedNow();
    const wrong = code === "0000" ? "1111" : "0000";
    for (let i = 0; i < 5; i++) expect((await checkIn(id, host, wrong)).ok).toBe(false);
    const locked = await checkIn(id, host, code);
    expect(locked.ok).toBe(false); // even the right code is refused after 5 misses
    expect(!locked.ok && locked.error).toMatch(/Too many/);
  });

  it("the right code checks the driver in; only the host can do it", async () => {
    const { host, driver, id, code } = await confirmedNow();
    expect((await checkIn(id, driver, code)).ok).toBe(false);
    expect((await checkIn(id, host, code)).ok).toBe(true);
    const [b] = await sql("select status, checked_in_at from bookings where id = $1", [id]);
    expect(b.status).toBe("checked_in");
    expect(b.checked_in_at).not.toBeNull();
    expect((await checkIn(id, host, code)).ok).toBe(false); // already in
  });

  it("check-in is not open too early or after the booking ended", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 6, 8);
    const [b] = await sql("select checkin_code from bookings where id = $1", [id]);
    const early = await checkIn(id, host, b.checkin_code);
    expect(!early.ok && early.error).toMatch(/Too early/);
    await sql("update bookings set start_at = now() - interval '3 hours', end_at = now() - interval '1 hour' where id = $1", [id]);
    const late = await checkIn(id, host, b.checkin_code);
    expect(!late.ok && late.error).toMatch(/ended/);
  });

  it("payment can only be recorded after check-in, by the host, once", async () => {
    const { host, driver, id, code } = await confirmedNow();
    expect((await markPaid(id, host, "cash")).ok).toBe(false); // not checked in yet
    await checkIn(id, host, code);
    expect((await markPaid(id, driver, "cash")).ok).toBe(false); // drivers can't mark themselves paid
    expect((await markPaid(id, host, "upi")).ok).toBe(true);
    expect((await markPaid(id, host, "cash")).ok).toBe(false); // already recorded
    const [b] = await sql("select payment_status, paid_via from bookings where id = $1", [id]);
    expect(b).toMatchObject({ payment_status: "paid", paid_via: "upi" });
  });

  it("a driver can dispute a recorded payment, which opens a complaint", async () => {
    const { host, driver, id, code } = await confirmedNow();
    await checkIn(id, host, code);
    expect((await disputePayment(id, driver)).ok).toBe(false); // nothing recorded yet
    await markPaid(id, host, "cash");
    expect((await disputePayment(id, driver)).ok).toBe(true);
    const [b] = await sql("select payment_status from bookings where id = $1", [id]);
    expect(b.payment_status).toBe("disputed");
    const c = await sql("select category, against_user_id from complaints where booking_id = $1", [id]);
    expect(c[0]).toMatchObject({ category: "payment", against_user_id: host });
  });

  it("no-shows can be marked only after a 30 minute grace period, and count against the driver", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 1, 3);
    expect((await markNoShow(id, host)).ok).toBe(false);
    await sql("update bookings set start_at = now() - interval '45 minutes', end_at = now() + interval '2 hours' where id = $1", [id]);
    expect((await markNoShow(id, driver)).ok).toBe(false);
    expect((await markNoShow(id, host)).ok).toBe(true);
    const [u] = await sql("select no_show_count from users where id = $1", [driver]);
    expect(u.no_show_count).toBe(1);
  });

  it("a checked-in driver can't be marked a no-show", async () => {
    const { host, id, code } = await confirmedNow();
    await sql("update bookings set start_at = now() - interval '2 hours' where id = $1", [id]);
    await checkIn(id, host, code);
    expect((await markNoShow(id, host)).ok).toBe(false);
  });

  it("finishing a stay, and automatic completion after 12 hours", async () => {
    const { host, driver, id, code } = await confirmedNow();
    expect((await completeBooking(id, driver)).ok).toBe(false); // not in progress yet
    await checkIn(id, host, code);
    expect((await completeBooking(id, driver)).ok).toBe(true);

    const other = await confirmedNow();
    await checkIn(other.id, other.host, other.code);
    await sql("update bookings set end_at = now() - interval '13 hours', start_at = now() - interval '16 hours' where id = $1", [other.id]);
    await sweep();
    const [b] = await sql("select status from bookings where id = $1", [other.id]);
    expect(b.status).toBe("completed");
  });
});

describe("reviews", () => {
  async function completedStay() {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 1, 4);
    await sql("update bookings set start_at = now() - interval '10 minutes', end_at = now() + interval '3 hours' where id = $1", [id]);
    const [b] = await sql("select checkin_code from bookings where id = $1", [id]);
    await checkIn(id, host, b.checkin_code);
    return { host, driver, id, space };
  }

  it("only after the stay is finished, only by the two people involved, once each", async () => {
    const { host, driver, id } = await completedStay();
    const stranger = await mkUser();
    expect((await createReview({ bookingId: id, reviewerId: driver, rating: 5, comment: "Great" })).ok).toBe(false); // still in progress
    await completeBooking(id, driver);
    expect((await createReview({ bookingId: id, reviewerId: stranger, rating: 1, comment: "Fake" })).ok).toBe(false);
    expect((await createReview({ bookingId: id, reviewerId: driver, rating: 5, comment: "Easy to find" })).ok).toBe(true);
    const dup = await createReview({ bookingId: id, reviewerId: driver, rating: 1, comment: "Changed my mind" });
    expect(!dup.ok && dup.error).toMatch(/already/);
    expect((await createReview({ bookingId: id, reviewerId: host, rating: 4, comment: "On time" })).ok).toBe(true);
  });

  it("rejects out-of-range ratings", async () => {
    const { driver, id } = await completedStay();
    await completeBooking(id, driver);
    for (const rating of [0, 6, 3.5, NaN]) {
      expect((await createReview({ bookingId: id, reviewerId: driver, rating, comment: "" })).ok).toBe(false);
    }
  });

  it("closes 14 days after the stay", async () => {
    const { driver, id } = await completedStay();
    await completeBooking(id, driver);
    await sql("update bookings set ended_at = now() - interval '15 days' where id = $1", [id]);
    expect((await createReview({ bookingId: id, reviewerId: driver, rating: 5, comment: "Late" })).ok).toBe(false);
  });

  it("the space rating is the average of driver reviews only", async () => {
    const { host, driver, id, space } = await completedStay();
    await completeBooking(id, driver);
    await createReview({ bookingId: id, reviewerId: driver, rating: 4, comment: "" });
    await createReview({ bookingId: id, reviewerId: host, rating: 1, comment: "" }); // about the driver, must not count
    const v = await getSpaceView(space, driver);
    expect(v?.rating_avg).toBe(4);
    expect(v?.rating_count).toBe(1);
  });
});

describe("reports and moderation", () => {
  it("three different people reporting a listing pauses it for review", async () => {
    const host = await mkUser();
    const space = await mkSpace(host);
    const reporters = await Promise.all([mkUser(), mkUser(), mkUser()]);
    for (let i = 0; i < 2; i++) {
      expect((await fileComplaint({ userId: reporters[i], spaceId: space, category: "fake_listing", details: "There is no such bay at this address." })).ok).toBe(true);
    }
    let [s] = await sql("select status from spaces where id = $1", [space]);
    expect(s.status).toBe("active");
    await fileComplaint({ userId: reporters[2], spaceId: space, category: "fake_listing", details: "Went there. Nothing like this exists." });
    [s] = await sql("select status from spaces where id = $1", [space]);
    expect(s.status).toBe("suspended");
  });

  it("one person reporting repeatedly doesn't trip the suspension", async () => {
    const host = await mkUser(), pest = await mkUser();
    const space = await mkSpace(host);
    for (let i = 0; i < 5; i++) {
      await fileComplaint({ userId: pest, spaceId: space, category: "unsafe", details: "I really don't like this place." });
    }
    const [s] = await sql("select status from spaces where id = $1", [space]);
    expect(s.status).toBe("active");
  });

  it("complaints are rate limited and validated", async () => {
    const host = await mkUser(), pest = await mkUser();
    const space = await mkSpace(host);
    expect((await fileComplaint({ userId: pest, spaceId: space, category: "nope", details: "valid details here" })).ok).toBe(false);
    expect((await fileComplaint({ userId: pest, spaceId: space, category: "other", details: "short" })).ok).toBe(false);
    expect((await fileComplaint({ userId: host, spaceId: space, category: "other", details: "reporting my own space" })).ok).toBe(false);
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await fileComplaint({ userId: pest, spaceId: space, category: "other", details: "Something odd happened here." }));
    expect(results.filter((r) => r.ok)).toHaveLength(6);
  });

  it("people outside a booking can't file a complaint about it", async () => {
    const host = await mkUser(), driver = await mkUser(), stranger = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 5, 7);
    expect((await fileComplaint({ userId: stranger, bookingId: id, category: "other", details: "I wasn't even there." })).ok).toBe(false);
    expect((await fileComplaint({ userId: driver, bookingId: id, category: "other", details: "Host was unresponsive." })).ok).toBe(true);
  });

  it("banning signs a person out, suspends their spaces and cancels their open bookings", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 30, 32);
    const [before] = await sql("select session_version from users where id = $1", [host]);
    expect((await adminSetBanned(host, true)).ok).toBe(true);
    const [after] = await sql("select session_version, banned_at from users where id = $1", [host]);
    expect(after.session_version).toBe(before.session_version + 1);
    expect(after.banned_at).not.toBeNull();
    const [s] = await sql("select status from spaces where id = $1", [space]);
    expect(s.status).toBe("suspended");
    const [b] = await sql("select status from bookings where id = $1", [id]);
    expect(b.status).toBe("cancelled_by_host");
    expect(await getSpaceView(space, driver)).toBeNull();
  });
});

describe("chat", () => {
  it("hides contact details until a booking is confirmed, then allows them", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    const conv = await getOrCreateConversation(space, driver);
    if (!conv.ok) throw new Error(conv.error);

    const r1 = await sendMessage(conv.id, driver, "Hi! Call me on 98765 43210 or pay me@okhdfc");
    expect(r1.ok && r1.masked).toBe(true);
    let t = await listMessages(conv.id, host);
    expect(t?.messages[0].body).toContain(HIDDEN_CONTACT);
    expect(t?.messages[0].body).not.toContain("98765");

    const id = await bookOk(driver, space, car, 5, 7);
    await hostDecision(id, host, true);
    const r2 = await sendMessage(conv.id, host, "Sure, my number is 98765 43210");
    expect(r2.ok && r2.masked).toBe(false);
    t = await listMessages(conv.id, driver);
    expect(t?.messages.at(-1)?.body).toContain("98765 43210");
  });

  it("only the two participants can read or write, and you can't chat with yourself", async () => {
    const host = await mkUser(), driver = await mkUser(), stranger = await mkUser();
    const space = await mkSpace(host);
    const conv = await getOrCreateConversation(space, driver);
    if (!conv.ok) throw new Error(conv.error);
    expect(await listMessages(conv.id, stranger)).toBeNull();
    expect((await sendMessage(conv.id, stranger, "hello")).ok).toBe(false);
    expect((await getOrCreateConversation(space, host)).ok).toBe(false);
  });

  it("conversations are reused, and limited to 500 characters", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host);
    const a = await getOrCreateConversation(space, driver), b = await getOrCreateConversation(space, driver);
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    if (!a.ok) return;
    expect((await sendMessage(a.id, driver, "x".repeat(501))).ok).toBe(false);
    expect((await sendMessage(a.id, driver, "   ")).ok).toBe(false);
  });
});

describe("search and privacy", () => {
  it("finds fitting, open, free spaces near a point, nearest first, with approximate locations", async () => {
    const host = await mkUser(), driver = await mkUser();
    const near = await mkSpace(host, { title: "Near", lat: 12.9716, lng: 77.5946 });
    const mid = await mkSpace(host, { title: "Mid spot", lat: 12.9816, lng: 77.6046 });
    await mkSpace(host, { title: "Far away", lat: 13.2, lng: 77.9 });
    const res = await searchSpaces({
      lat: 12.9716, lng: 77.5946, radiusKm: 5, start: at(10), end: at(12),
      vehicle: VEHICLE_PRESETS.hatchback.dims, viewerId: driver, sort: "distance",
    });
    expect(res.hits.map((h) => h.id)).toEqual([near, mid]);
    expect(res.hits[0].distanceKm).toBeLessThan(res.hits[1].distanceKm);
    expect(res.hits[0].totalPaise).toBe(10000);
    expect(res.hits[0].point).toEqual({ lat: 12.972, lng: 77.595 }); // rounded to about 100 m
  });

  it("explains what it left out, and never shows your own spaces", async () => {
    const host = await mkUser(), driver = await mkUser(), other = await mkUser();
    const base = { lat: 19.07, lng: 72.87 }; // Mumbai, away from the other search tests
    await mkSpace(host, { ...base, max_length_cm: 420 }); // too small for an SUV
    await mkSpace(host, { ...base, open_minute: 0, close_minute: 15 }); // closed
    const full = await mkSpace(host, { ...base, instant_book: true });
    const mine = await mkSpace(driver, base);
    await bookOk(other, full, await mkCar(other), 10, 12);
    const res = await searchSpaces({
      lat: base.lat, lng: base.lng, radiusKm: 3, start: at(10), end: at(12),
      vehicle: VEHICLE_PRESETS.suv.dims, viewerId: driver, sort: "distance",
    });
    expect(res.hits).toHaveLength(0);
    expect(res.left_out).toEqual({ too_small: 1, closed: 1, full: 1 });
    expect(res.hits.some((h) => h.id === mine)).toBe(false);
  });

  it("sorts by price and by rating", async () => {
    const host = await mkUser(), driver = await mkUser();
    const base = { lat: 28.61, lng: 77.2 }; // Delhi, away from the other search tests
    const pricey = await mkSpace(host, { ...base, price_hour_paise: 9000, price_day_paise: null });
    const cheap = await mkSpace(host, { ...base, price_hour_paise: 2000, price_day_paise: null });
    const res = await searchSpaces({
      lat: base.lat, lng: base.lng, radiusKm: 2, start: at(10), end: at(12), vehicle: null, viewerId: driver, sort: "price",
    });
    expect(res.hits.map((h) => h.id)).toEqual([cheap, pricey]);
  });

  it("hides the exact address and gate notes until a booking is confirmed", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    let v = await getSpaceView(space, driver);
    expect(v?.exact).toBe(false);
    expect(v?.address_line).toBe("");
    expect(v?.access_notes).toBe("");
    expect(v?.point.lat).toBe(12.978);
    expect((await getSpaceView(space, null))?.exact).toBe(false);

    const id = await bookOk(driver, space, car, 5, 7);
    v = await getSpaceView(space, driver);
    expect(v?.exact).toBe(false); // still just a request
    await hostDecision(id, host, true);
    v = await getSpaceView(space, driver);
    expect(v?.exact).toBe(true);
    expect(v?.address_line).toContain("Green Park");
    expect(v?.access_notes).toContain("4821");
    expect(v?.point.lat).toBe(12.9784);

    const hostView = await getSpaceView(space, host);
    expect(hostView?.exact).toBe(true);
  });

  it("suspended spaces are visible to their host only", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { status: "suspended" });
    expect(await getSpaceView(space, driver)).toBeNull();
    expect(await getSpaceView(space, null)).toBeNull();
    expect((await getSpaceView(space, host))?.status).toBe("suspended");
    expect((await setSpaceActive(host, space, true)).ok).toBe(false); // the host can't un-suspend
  });
});

describe("editing a listing", () => {
  const input = (over: Partial<SpaceInput> = {}): SpaceInput => ({ ...spaceDefaults, ...over });

  it("creates a listing, and requires the rights confirmation", async () => {
    const host = await mkUser();
    expect((await createSpace(host, input({ rights_confirmed: false }))).ok).toBe(false);
    expect((await createSpace(host, input())).ok).toBe(true);
  });

  it("limits how many listings someone can add in a day", async () => {
    const host = await mkUser();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await createSpace(host, input({ title: `Bay number ${i}` })));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("rejects values the database forbids instead of storing them", async () => {
    const host = await mkUser();
    await expect(createSpace(host, input({ price_hour_paise: 5 }))).rejects.toThrow();
    await expect(createSpace(host, input({ lat: 120 }))).rejects.toThrow();
  });

  it("locks size, hours and location while bookings are upcoming, but allows price changes", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host), car = await mkCar(driver);
    await bookOk(driver, space, car, 30, 32);
    const locked = await updateSpace(host, space, input({ max_height_cm: 150 }));
    expect(!locked.ok && locked.error).toMatch(/locked/);
    expect((await updateSpace(host, space, input({ price_hour_paise: 6000 }))).ok).toBe(true);
  });

  it("only the owner can edit", async () => {
    const host = await mkUser(), other = await mkUser();
    const space = await mkSpace(host);
    expect((await updateSpace(other, space, input({ title: "Hijacked listing" }))).ok).toBe(false);
  });
});

describe("account deletion", () => {
  it("removes personal data, keeps history, and frees the number", async () => {
    const hash = randomPhoneHash();
    const { id: userId } = await upsertUserByPhoneHash(hash);
    const host = await mkUser();
    const space = await mkSpace(host, { instant_book: true });
    const car = await mkCar(userId);
    await updateProfile(userId, { nickname: "Ravi", upi_id: "ravi@okhdfc" });
    const id = await bookOk(userId, space, car, 30, 32);
    const del = await deleteAccount(userId);
    expect(del.ok).toBe(true);
    const [u] = await sql("select nickname, upi_id, deleted_at, phone_hash from users where id = $1", [userId]);
    expect(u.nickname).toBeNull();
    expect(u.upi_id).toBeNull();
    expect(u.deleted_at).not.toBeNull();
    expect(u.phone_hash).not.toBe(hash);
    expect(await sql("select 1 from vehicles where user_id = $1", [userId])).toHaveLength(0);
    const [b] = await sql("select status, vehicle_plate from bookings where id = $1", [id]);
    expect(b.status).toBe("cancelled_by_driver");
    const again = await upsertUserByPhoneHash(hash);
    expect(again.created).toBe(true);
    expect(again.id).not.toBe(userId);
  });

  it("refuses while a stay is in progress", async () => {
    const host = await mkUser(), driver = await mkUser();
    const space = await mkSpace(host, { instant_book: true }), car = await mkCar(driver);
    const id = await bookOk(driver, space, car, 1, 4);
    await sql("update bookings set start_at = now() - interval '5 minutes', end_at = now() + interval '3 hours' where id = $1", [id]);
    const [b] = await sql("select checkin_code from bookings where id = $1", [id]);
    await checkIn(id, host, b.checkin_code);
    expect((await deleteAccount(driver)).ok).toBe(false);
  });
});

describe("profile", () => {
  it("validates UPI ids and nicknames", async () => {
    const u = await mkUser();
    expect((await updateProfile(u, { nickname: "Ravi K", upi_id: "ravi.k@okaxis" })).ok).toBe(true);
    expect((await updateProfile(u, { nickname: "R", upi_id: "" })).ok).toBe(false);
    expect((await updateProfile(u, { nickname: "Ravi", upi_id: "not a upi id" })).ok).toBe(false);
    expect((await updateProfile(u, { nickname: "Ravi", upi_id: "evil@x;drop" })).ok).toBe(false);
  });
});
