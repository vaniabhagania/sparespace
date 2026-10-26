"use server";

import { revalidatePath } from "next/cache";
import { runAsUser, type ActionState } from "@/lib/action";
import { isUuid } from "@/lib/ids";
import { sendMessage } from "@/lib/services/messages";

export async function sendMessageAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("conversation_id") ?? "");
  if (!isUuid(id)) return { error: "This conversation can't be found." };
  return runAsUser(`/messages/${id}`, async (user) => {
    const res = await sendMessage(id, user.id, String(fd.get("body") ?? ""));
    if (!res.ok) return { error: res.error };
    revalidatePath(`/messages/${id}`);
    revalidatePath("/", "layout");
    return res.masked ? { ok: "Sent. Phone numbers, emails and UPI IDs are hidden until a booking is confirmed." } : { ok: "" };
  });
}
