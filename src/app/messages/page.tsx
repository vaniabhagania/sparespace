import type { Metadata } from "next";
import Link from "next/link";
import { SetupNeeded } from "@/components/setup-needed";
import { isDbConfigured } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listConversations } from "@/lib/services/messages";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  if (!isDbConfigured()) return <SetupNeeded />;
  const user = await requireUser("/messages");
  const list = await listConversations(user.id);

  return (
    <div className="shell py-8 md:py-12">
      <h1 className="text-[clamp(2.4rem,7vw,4rem)]">Messages</h1>
      {list.length === 0 ? (
        <div className="panel mt-6 max-w-xl">
          <h2 className="text-3xl">Nothing here yet</h2>
          <p className="mt-2 text-stone">Open a space and tap &ldquo;Message host&rdquo; to ask a question before you book. Chats are kept inside SpareSpace.</p>
          <Link href="/" className="btn btn-primary mt-4">Find a space</Link>
        </div>
      ) : (
        <ul className="mt-6 grid max-w-3xl gap-3">
          {list.map((c) => (
            <li key={c.id} className="panel relative transition-colors hover:bg-cocoa-700/80">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[1.5rem]">
                    <Link href={`/messages/${c.id}`} className="no-underline after:absolute after:inset-0 after:content-['']">
                      {c.other_deleted ? "Former member" : c.other_name || (c.role === "driver" ? "The host" : "A driver")}
                    </Link>
                  </h2>
                  <p className="text-sm text-stone">{c.space_title}</p>
                  {c.last_body && <p className={`mt-1 truncate ${c.unread ? "font-semibold" : "text-stone"}`}>{c.last_body}</p>}
                </div>
                <div className="flex flex-none flex-col items-end gap-1 text-sm text-stone">
                  {c.last_at && <time dateTime={new Date(c.last_at).toISOString()}>{formatDateTime(new Date(c.last_at))}</time>}
                  {c.unread && <span className="chip chip-beige">New</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
