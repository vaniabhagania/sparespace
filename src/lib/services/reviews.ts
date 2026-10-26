import { db } from "../db";
import { clean } from "../text";
import { loadBookingFor } from "./bookings";
import { fail, type Result } from "./types";

const REVIEW_WINDOW_DAYS = 14;

export async function createReview(input: {
  bookingId: string;
  reviewerId: string;
  rating: number;
  comment: string;
}): Promise<Result> {
  const { bookingId, reviewerId, rating } = input;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("Choose a rating from 1 to 5.");
  const comment = clean(input.comment).slice(0, 600);
  try {
    return await db.tx(async (q) => {
      const b = await loadBookingFor(bookingId, reviewerId, q);
      if (!b) return fail("Booking not found.");
      if (b.status !== "completed") return fail("You can review a stay once it's finished.");
      const doneAt = new Date(b.ended_at ?? b.end_at).getTime();
      if (Date.now() - doneAt > REVIEW_WINDOW_DAYS * 86_400_000) return fail("The review window for this stay has closed.");
      const isDriver = b.driver_id === reviewerId;
      await q.query(
        `insert into reviews (booking_id, space_id, reviewer_id, reviewee_id, direction, rating, comment)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [bookingId, b.space_id, reviewerId, isDriver ? b.host_id : b.driver_id,
         isDriver ? "driver_to_space" : "host_to_driver", rating, comment],
      );
      return { ok: true };
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return fail("You've already reviewed this stay.");
    throw err;
  }
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  created_at: Date;
  reviewer_name: string | null;
  reviewer_id: string;
  reviewer_deleted: boolean;
}

export async function listSpaceReviews(spaceId: string, limit = 20): Promise<PublicReview[]> {
  return db.query<PublicReview>(
    `select r.id, r.rating, r.comment, r.created_at, r.reviewer_id, u.nickname as reviewer_name,
            (u.deleted_at is not null) as reviewer_deleted
       from reviews r join users u on u.id = r.reviewer_id
      where r.space_id = $1 and r.direction = 'driver_to_space'
      order by r.created_at desc limit $2`,
    [spaceId, limit],
  );
}

/** What a host sees about a driver before approving a request. */
export async function driverReputation(driverId: string) {
  const rows = await db.query<{
    rating_avg: number | null; rating_count: number; stays: number; no_shows: number; late_cancels: number;
  }>(
    `select
       (select round(avg(rating)::numeric, 1)::float from reviews where reviewee_id = $1 and direction = 'host_to_driver') as rating_avg,
       (select count(*)::int from reviews where reviewee_id = $1 and direction = 'host_to_driver') as rating_count,
       (select count(*)::int from bookings where driver_id = $1 and status = 'completed') as stays,
       u.no_show_count as no_shows, u.late_cancel_count as late_cancels
     from users u where u.id = $1`,
    [driverId],
  );
  return rows[0];
}

export async function reviewsForBooking(bookingId: string) {
  return db.query<{ direction: string; rating: number; comment: string; reviewer_id: string }>(
    "select direction, rating, comment, reviewer_id from reviews where booking_id = $1",
    [bookingId],
  );
}
