import { db } from "../db";
import { overstayCharge } from "../pricing";
import { driverReputation, reviewsForBooking } from "./reviews";
import { loadBookingFor, sweep } from "./bookings";
import type { BookingRow } from "./types";

export interface BookingView {
  b: BookingRow & { host_id: string; space_title: string; area_label: string };
  role: "driver" | "host";
  space: {
    id: string;
    max_length_cm: number;
    max_width_cm: number;
    max_height_cm: number;
    address_line: string;
    access_notes: string;
    point: { lat: number; lng: number } | null;
  };
  /** The other person in this booking. */
  other: { id: string; name: string | null; deleted: boolean };
  hostUpi: string | null;
  driverRep: Awaited<ReturnType<typeof driverReputation>> | null;
  reviews: { direction: string; rating: number; comment: string; reviewer_id: string }[];
  extra: { minutes: number; paise: number };
  dueTotalPaise: number;
}

/**
 * Everything the booking page needs, with privacy applied here rather than in the page:
 * the driver only gets the exact address while the booking is live, the host never sees
 * the arrival code (it isn't loaded into the view at all), and the host's UPI id is only
 * shown to a confirmed driver.
 */
export async function getBookingView(bookingId: string, userId: string): Promise<BookingView | null> {
  await sweep();
  const b = await loadBookingFor(bookingId, userId);
  if (!b) return null;
  const role = b.driver_id === userId ? "driver" : "host";

  const spaceRows = await db.query<{
    id: string; max_length_cm: number; max_width_cm: number; max_height_cm: number;
    address_line: string; access_notes: string; lat: number; lng: number;
  }>("select id, max_length_cm, max_width_cm, max_height_cm, address_line, access_notes, lat, lng from spaces where id = $1", [b.space_id]);
  const s = spaceRows[0];

  const live = b.status === "confirmed" || b.status === "checked_in";
  const recentlyDone = b.status === "completed" && Date.now() - new Date(b.ended_at ?? b.end_at).getTime() < 86_400_000;
  const showExact = role === "host" || live || recentlyDone;

  const otherId = role === "driver" ? b.host_id : b.driver_id;
  const others = await db.query<{ id: string; nickname: string | null; deleted: boolean; upi_id: string | null }>(
    "select id, nickname, (deleted_at is not null) as deleted, upi_id from users where id = $1",
    [otherId],
  );
  const o = others[0];

  const revs = await reviewsForBooking(b.id);
  const driverRep = role === "host" ? await driverReputation(b.driver_id) : null;

  const countsExtra = b.status === "checked_in" || b.status === "completed";
  const extra = countsExtra
    ? overstayCharge(b.price_hour_paise, new Date(b.end_at), b.ended_at ? new Date(b.ended_at) : new Date())
    : { minutes: 0, paise: 0 };

  // The booking row carries the arrival code; only the driver is allowed to see it.
  const safeBooking = { ...b, checkin_code: role === "driver" && live ? b.checkin_code : "" };

  return {
    b: safeBooking,
    role,
    space: {
      id: s.id,
      max_length_cm: s.max_length_cm,
      max_width_cm: s.max_width_cm,
      max_height_cm: s.max_height_cm,
      address_line: showExact ? s.address_line : "",
      access_notes: showExact ? s.access_notes : "",
      point: showExact ? { lat: s.lat, lng: s.lng } : null,
    },
    other: { id: o.id, name: o.nickname, deleted: o.deleted },
    hostUpi: role === "driver" && (live || b.status === "completed") && !o.deleted ? o.upi_id : null,
    driverRep,
    reviews: revs,
    extra,
    dueTotalPaise: b.price_paise + extra.paise,
  };
}
