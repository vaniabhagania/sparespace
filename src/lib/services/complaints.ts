import { db } from "../db";
import { hit, waitText } from "../rate-limit";
import { clean } from "../text";
import { loadBookingFor } from "./bookings";
import { COMPLAINT_CATEGORIES, fail, type Result } from "./types";

const VALID = new Set<string>(COMPLAINT_CATEGORIES.map((c) => c.id));
/** Reports about the listing itself. Enough independent reports pause it until someone looks. */
const LISTING_CATEGORIES = ["fake_listing", "unsafe", "wrong_details"];
const AUTO_SUSPEND_AT = 3;

export async function fileComplaint(input: {
  userId: string;
  spaceId?: string | null;
  bookingId?: string | null;
  category: string;
  details: string;
}): Promise<Result<{ id: string }>> {
  const details = clean(input.details);
  if (!VALID.has(input.category)) return fail("Choose what went wrong.");
  if (details.length < 10) return fail("Tell us a little more (at least 10 characters).");
  if (details.length > 1000) return fail("Please keep it under 1,000 characters.");

  return db.tx(async (q) => {
    const rl = await hit(`complaint:${input.userId}`, 6, 86_400, q);
    if (!rl.allowed) return fail(`You've sent several reports today. Try again in ${waitText(rl.retryAfterSec)}.`);

    let spaceId = input.spaceId ?? null;
    let against: string | null = null;
    let bookingId: string | null = null;

    if (input.bookingId) {
      const b = await loadBookingFor(input.bookingId, input.userId, q);
      if (!b) return fail("Booking not found.");
      bookingId = b.id;
      spaceId = b.space_id;
      against = b.driver_id === input.userId ? b.host_id : b.driver_id;
    } else if (spaceId) {
      const s = await q.query<{ host_id: string }>("select host_id from spaces where id = $1", [spaceId]);
      if (!s[0]) return fail("Space not found.");
      if (s[0].host_id === input.userId) return fail("You can't report your own space.");
      against = s[0].host_id;
    } else {
      return fail("Say which booking or space this is about.");
    }

    const rows = await q.query<{ id: string }>(
      `insert into complaints (filed_by, booking_id, space_id, against_user_id, category, details)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [input.userId, bookingId, spaceId, against, input.category, details],
    );

    if (spaceId && LISTING_CATEGORIES.includes(input.category)) {
      const n = await q.query<{ n: number }>(
        `select count(distinct filed_by)::int as n from complaints
          where space_id = $1 and category = any($2::text[]) and status in ('open','reviewing')
            and created_at > now() - interval '14 days'`,
        [spaceId, LISTING_CATEGORIES],
      );
      if (n[0].n >= AUTO_SUSPEND_AT) {
        await q.query("update spaces set status = 'suspended', updated_at = now() where id = $1 and status in ('active','paused')", [spaceId]);
      }
    }
    return { ok: true, id: rows[0].id };
  });
}

export interface AdminComplaint {
  id: string;
  category: string;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: Date;
  space_id: string | null;
  space_title: string | null;
  space_status: string | null;
  filed_by: string;
  against_user_id: string | null;
  against_banned: boolean;
}

export async function adminListComplaints(status: string | null): Promise<AdminComplaint[]> {
  return db.query<AdminComplaint>(
    `select c.id, c.category, c.details, c.status, c.admin_note, c.created_at, c.space_id,
            s.title as space_title, s.status as space_status, c.filed_by, c.against_user_id,
            (u.banned_at is not null) as against_banned
       from complaints c
       left join spaces s on s.id = c.space_id
       left join users u on u.id = c.against_user_id
      where ($1::text is null or c.status = $1)
      order by (c.status = 'open') desc, c.created_at desc limit 200`,
    [status],
  );
}

export async function adminUpdateComplaint(id: string, status: string, note: string): Promise<Result> {
  if (!["open", "reviewing", "resolved", "dismissed"].includes(status)) return fail("Unknown status.");
  const rows = await db.query<{ id: string }>(
    "update complaints set status = $2, admin_note = $3, updated_at = now() where id = $1 returning id",
    [id, status, clean(note).slice(0, 500) || null],
  );
  return rows.length ? { ok: true } : fail("Report not found.");
}

export async function adminSetSpaceStatus(spaceId: string, status: "active" | "suspended"): Promise<Result> {
  const rows = await db.query<{ id: string }>(
    "update spaces set status = $2, updated_at = now() where id = $1 returning id",
    [spaceId, status],
  );
  return rows.length ? { ok: true } : fail("Space not found.");
}

/** Banning signs the person out everywhere, pauses their listings and cancels their open bookings. */
export async function adminSetBanned(userId: string, banned: boolean): Promise<Result> {
  return db.tx(async (q) => {
    const rows = await q.query<{ id: string }>(
      `update users set banned_at = case when $2 then now() else null end,
              session_version = session_version + 1
        where id = $1 and deleted_at is null returning id`,
      [userId, banned],
    );
    if (!rows.length) return fail("User not found.");
    if (banned) {
      await q.query("update spaces set status = 'suspended', updated_at = now() where host_id = $1 and status in ('active','paused')", [userId]);
      await q.query("update bookings set status = 'cancelled_by_driver', updated_at = now() where driver_id = $1 and status in ('pending','confirmed')", [userId]);
      await q.query(
        `update bookings b set status = 'cancelled_by_host', updated_at = now() from spaces s
          where s.id = b.space_id and s.host_id = $1 and b.status in ('pending','confirmed')`,
        [userId],
      );
    }
    return { ok: true };
  });
}
