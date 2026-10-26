"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAsUser, type ActionState } from "@/lib/action";
import { isUuid } from "@/lib/ids";
import { createSpace, setSpaceActive, updateSpace } from "@/lib/services/spaces";
import { parseSpaceForm } from "@/lib/validation";

export async function createSpaceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAsUser("/host/new", async (user) => {
    const parsed = parseSpaceForm(fd);
    if (!parsed.ok) return { error: parsed.error };
    const res = await createSpace(user.id, parsed.data);
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    redirect("/host?listed=1");
  });
}

export async function updateSpaceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("space_id") ?? "");
  if (!isUuid(id)) return { error: "This space can't be found." };
  return runAsUser(`/host/${id}/edit`, async (user) => {
    const parsed = parseSpaceForm(fd);
    if (!parsed.ok) return { error: parsed.error };
    const res = await updateSpace(user.id, id, parsed.data);
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    redirect("/host?saved=1");
  });
}

export async function toggleSpaceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("space_id") ?? "");
  if (!isUuid(id)) return { error: "This space can't be found." };
  const active = String(fd.get("active")) === "1";
  return runAsUser("/host", async (user) => {
    const res = await setSpaceActive(user.id, id, active);
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    return { ok: active ? "Live again." : "Paused. Drivers can't see it." };
  });
}
