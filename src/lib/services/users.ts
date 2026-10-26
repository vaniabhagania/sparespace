import { randomBytes } from "node:crypto";
import { db } from "../db";
import { clean } from "../text";
import { fail, type Result } from "./types";

export interface UpsertedUser {
  id: string;
  banned_at: Date | null;
  session_version: number;
  created: boolean;
}

export async function upsertUserByPhoneHash(phoneHash: string): Promise<UpsertedUser> {
  const rows = await db.query<UpsertedUser>(
    `insert into users (phone_hash) values ($1)
     on conflict (phone_hash) do update set phone_hash = excluded.phone_hash
     returning id, banned_at, session_version, (xmax = 0) as created`,
    [phoneHash],
  );
  return rows[0];
}

const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/;

export async function updateProfile(
  userId: string,
  input: { nickname: string; upi_id: string },
): Promise<Result> {
  const nickname = clean(input.nickname);
  if (nickname && (nickname.length < 2 || nickname.length > 30)) return fail("Use 2 to 30 characters for your name.");
  const upi = input.upi_id.trim();
  if (upi && !UPI_RE.test(upi)) return fail("That UPI ID doesn't look right. It should look like name@bank.");
  await db.query("update users set nickname = $2, upi_id = $3 where id = $1", [userId, nickname || null, upi || null]);
  return { ok: true };
}

export async function signOutEverywhere(userId: string): Promise<void> {
  await db.query("update users set session_version = session_version + 1 where id = $1", [userId]);
}

/**
 * Deletes a person's data while keeping other people's history intact: bookings and reviews
 * remain (attributed to "Former member"), but their number hash, name, UPI ID, vehicles,
 * plates and chats are removed, and the number becomes free to sign up again.
 */
export async function deleteAccount(userId: string): Promise<Result> {
  return db.tx(async (q) => {
    const user = await q.query<{ id: string }>("select id from users where id = $1 and deleted_at is null for update", [userId]);
    if (!user[0]) return fail("Account not found.");

    const live = await q.query(
      `select 1 from bookings b join spaces s on s.id = b.space_id
        where b.status = 'checked_in' and (b.driver_id = $1 or s.host_id = $1) limit 1`,
      [userId],
    );
    if (live.length) return fail("You have a stay in progress. Finish it before deleting your account.");

    await q.query(
      `update bookings set status = 'cancelled_by_driver', updated_at = now()
        where driver_id = $1 and status in ('pending','confirmed')`,
      [userId],
    );
    await q.query(
      `update bookings b set status = 'cancelled_by_host', updated_at = now()
         from spaces s
        where s.id = b.space_id and s.host_id = $1 and b.status in ('pending','confirmed')`,
      [userId],
    );
    await q.query("update bookings set vehicle_plate = null where driver_id = $1", [userId]);
    await q.query("update spaces set status = 'paused', updated_at = now() where host_id = $1", [userId]);
    await q.query("delete from vehicles where user_id = $1", [userId]);
    await q.query("delete from conversations where driver_id = $1 or host_id = $1", [userId]);
    await q.query(
      `update users set nickname = null, upi_id = null, deleted_at = now(),
              phone_hash = 'deleted:' || $2, session_version = session_version + 1
        where id = $1`,
      [userId, randomBytes(16).toString("hex")],
    );
    return { ok: true };
  });
}
