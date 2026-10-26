import { db } from "../db";
import { hit, waitText } from "../rate-limit";
import { clean, maskContactDetails } from "../text";
import { fail, type Result } from "./types";

export async function getOrCreateConversation(spaceId: string, driverId: string): Promise<Result<{ id: string }>> {
  return db.tx(async (q) => {
    const s = await q.query<{ host_id: string; status: string }>(
      `select s.host_id, s.status from spaces s join users u on u.id = s.host_id
        where s.id = $1 and u.banned_at is null and u.deleted_at is null`,
      [spaceId],
    );
    if (!s[0] || s[0].status === "suspended") return fail("Space not found.");
    if (s[0].host_id === driverId) return fail("This is your own space.");
    const rows = await q.query<{ id: string }>(
      `insert into conversations (space_id, driver_id, host_id) values ($1, $2, $3)
       on conflict (space_id, driver_id) do update set space_id = excluded.space_id returning id`,
      [spaceId, driverId, s[0].host_id],
    );
    return { ok: true, id: rows[0].id };
  });
}

export interface ConversationHead {
  id: string;
  space_id: string;
  space_title: string;
  driver_id: string;
  host_id: string;
  other_name: string | null;
  other_deleted: boolean;
  unlocked: boolean;
}

/** `unlocked` means a booking between these two people is confirmed, so contact details may be shared. */
export async function getConversationFor(conversationId: string, userId: string): Promise<ConversationHead | null> {
  const rows = await db.query<ConversationHead>(
    `select c.id, c.space_id, s.title as space_title, c.driver_id, c.host_id,
            o.nickname as other_name, (o.deleted_at is not null) as other_deleted,
            exists (select 1 from bookings b where b.space_id = c.space_id and b.driver_id = c.driver_id
                     and b.status in ('confirmed','checked_in','completed')) as unlocked
       from conversations c
       join spaces s on s.id = c.space_id
       join users o on o.id = case when c.driver_id = $2 then c.host_id else c.driver_id end
      where c.id = $1 and (c.driver_id = $2 or c.host_id = $2)`,
    [conversationId, userId],
  );
  return rows[0] ?? null;
}

export async function listMessages(conversationId: string, userId: string) {
  const head = await getConversationFor(conversationId, userId);
  if (!head) return null;
  const col = head.driver_id === userId ? "driver_last_read_at" : "host_last_read_at";
  await db.query(`update conversations set ${col} = now() where id = $1`, [conversationId]);
  const messages = await db.query<{ id: string; sender_id: string; body: string; masked: boolean; created_at: Date }>(
    "select id, sender_id, body, masked, created_at from messages where conversation_id = $1 order by created_at asc limit 300",
    [conversationId],
  );
  return { head, messages };
}

export async function sendMessage(conversationId: string, userId: string, raw: string): Promise<Result<{ masked: boolean }>> {
  const text = clean(raw);
  if (!text) return fail("Write a message first.");
  if (text.length > 500) return fail("Messages can be up to 500 characters.");
  const head = await getConversationFor(conversationId, userId);
  if (!head) return fail("Conversation not found.");
  if (head.other_deleted) return fail("This person has left SpareSpace.");

  const rl = await hit(`msg:${userId}`, 40, 3600);
  if (!rl.allowed) return fail(`You're sending messages very quickly. Try again in ${waitText(rl.retryAfterSec)}.`);

  const { text: body, masked } = head.unlocked ? { text, masked: false } : maskContactDetails(text);
  await db.tx(async (q) => {
    await q.query("insert into messages (conversation_id, sender_id, body, masked) values ($1,$2,$3,$4)", [conversationId, userId, body, masked]);
    const col = head.driver_id === userId ? "driver_last_read_at" : "host_last_read_at";
    await q.query(`update conversations set last_message_at = now(), ${col} = now() where id = $1`, [conversationId]);
  });
  return { ok: true, masked };
}

export async function listConversations(userId: string) {
  return db.query<{
    id: string; space_id: string; space_title: string; other_id: string; other_name: string | null; other_deleted: boolean;
    role: "driver" | "host"; last_body: string | null; last_at: Date | null; unread: boolean;
  }>(
    `select c.id, c.space_id, s.title as space_title, o.id as other_id, o.nickname as other_name, (o.deleted_at is not null) as other_deleted,
            case when c.driver_id = $1 then 'driver' else 'host' end as role,
            lm.body as last_body, c.last_message_at as last_at,
            coalesce(lm.sender_id <> $1 and lm.created_at > case when c.driver_id = $1 then c.driver_last_read_at else c.host_last_read_at end, false) as unread
       from conversations c
       join spaces s on s.id = c.space_id
       join users o on o.id = case when c.driver_id = $1 then c.host_id else c.driver_id end
       left join lateral (select body, sender_id, created_at from messages m where m.conversation_id = c.id order by created_at desc limit 1) lm on true
      where (c.driver_id = $1 or c.host_id = $1) and c.last_message_at is not null
      order by c.last_message_at desc limit 100`,
    [userId],
  );
}

export async function navCounts(userId: string): Promise<{ requests: number; unread: number }> {
  const rows = await db.query<{ requests: number; unread: number }>(
    `select
       (select count(*)::int from bookings b join spaces s on s.id = b.space_id
         where s.host_id = $1 and b.status = 'pending' and b.expires_at > now()) as requests,
       (select count(*)::int from conversations c
         where (c.driver_id = $1 and exists (select 1 from messages m where m.conversation_id = c.id and m.sender_id <> $1 and m.created_at > c.driver_last_read_at))
            or (c.host_id = $1 and exists (select 1 from messages m where m.conversation_id = c.id and m.sender_id <> $1 and m.created_at > c.host_last_read_at))) as unread`,
    [userId],
  );
  return rows[0];
}
