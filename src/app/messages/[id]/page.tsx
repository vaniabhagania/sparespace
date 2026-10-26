import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SetupNeeded } from "@/components/setup-needed";
import { Notice } from "@/components/status";
import { isDbConfigured } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { requireUser } from "@/lib/session";
import { listMessages } from "@/lib/services/messages";
import { formatDateTime } from "@/lib/time";
import { Poller } from "../poller";
import { sendMessageAction } from "../actions";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/messages/${id}`);
  const data = await listMessages(id, user.id);
  if (!data) notFound();
  const { head, messages } = data;
  const name = head.other_deleted ? "Former member" : head.other_name || (head.host_id === user.id ? "A driver" : "The host");

  return (
    <div className="shell py-6 md:py-10">
      <Poller />
      <div className="mx-auto max-w-2xl">
        <Link href="/messages" className="link text-sm">All messages</Link>
        <h1 className="mt-2 text-[clamp(2rem,6vw,3rem)]">{name}</h1>
        <p className="text-stone">About <Link className="link" href={`/spaces/${head.space_id}`}>{head.space_title}</Link></p>

        {!head.unlocked && (
          <div className="mt-4">
            <Notice>Phone numbers, emails and UPI IDs are hidden here until a booking is confirmed. Keeping things in the app means a report or review can protect you both.</Notice>
          </div>
        )}

        <ol className="mt-5 grid gap-2.5" aria-label="Conversation" aria-live="polite">
          {messages.length === 0 && <li className="text-stone">Say hello. Ask about access, timings or anything the listing doesn&apos;t cover.</li>}
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${mine ? "rounded-br-md bg-beige text-cocoa-950" : "rounded-bl-md bg-cocoa-800"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-xs ${mine ? "text-cocoa-700" : "text-stone"}`}>
                    <span className="sr-only">{mine ? "You, " : `${name}, `}</span>
                    <time dateTime={new Date(m.created_at).toISOString()}>{formatDateTime(new Date(m.created_at))}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {head.other_deleted ? (
          <p className="mt-6 text-stone">This person has left SpareSpace, so you can&apos;t send more messages.</p>
        ) : (
          <ActionForm action={sendMessageAction} resetOnOk className="mt-6 grid gap-3" ariaLabel="Send a message">
            <input type="hidden" name="conversation_id" value={id} />
            <label className="label" htmlFor="msg-body">Your message</label>
            <textarea id="msg-body" name="body" className="field min-h-24" required maxLength={500} />
            <div><SubmitButton pendingText="Sending…">Send</SubmitButton></div>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
