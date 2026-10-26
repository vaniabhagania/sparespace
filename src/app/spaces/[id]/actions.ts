"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAsUser, type ActionState } from "@/lib/action";
import { VEHICLE_KINDS } from "@/lib/fit";
import { isUuid } from "@/lib/ids";
import { createBooking } from "@/lib/services/bookings";
import { fileComplaint } from "@/lib/services/complaints";
import { getOrCreateConversation } from "@/lib/services/messages";
import { addVehicle } from "@/lib/services/vehicles";
import { parseIstInput } from "@/lib/time";
import { parseVehicleForm } from "@/lib/validation";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function bookAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const spaceId = str(fd, "space_id");
  if (!isUuid(spaceId)) return { error: "This space can't be found." };
  const startRaw = str(fd, "start");
  const endRaw = str(fd, "end");
  const sel = str(fd, "vehicle");
  const kindForLink = sel.startsWith("new:") && (VEHICLE_KINDS as readonly string[]).includes(sel.slice(4)) ? `kind:${sel.slice(4)}` : sel.startsWith("id:") && isUuid(sel.slice(3)) ? sel : "";
  const returnTo = `/spaces/${spaceId}?${new URLSearchParams({ start: startRaw, end: endRaw, ...(kindForLink ? { v: kindForLink } : {}) })}`;

  return runAsUser(returnTo, async (user) => {
    const start = parseIstInput(startRaw);
    const end = parseIstInput(endRaw);
    if (!start || !end) return { error: "Choose when you'll arrive and leave." };
    if (end <= start) return { error: "Your leave time must be after your arrival." };

    let vehicleId: string;
    if (sel.startsWith("id:") && isUuid(sel.slice(3))) {
      vehicleId = sel.slice(3);
    } else if (sel.startsWith("new:")) {
      const nv = new FormData();
      nv.set("label", str(fd, "nv_label") || "My vehicle");
      nv.set("kind", sel.slice(4));
      nv.set("length_cm", str(fd, "nv_length_cm"));
      nv.set("width_cm", str(fd, "nv_width_cm"));
      nv.set("height_cm", str(fd, "nv_height_cm"));
      nv.set("plate", str(fd, "nv_plate"));
      const parsed = parseVehicleForm(nv);
      if (!parsed.ok) return { error: parsed.error };
      const added = await addVehicle(user.id, parsed.data);
      if (!added.ok) return { error: added.error };
      vehicleId = added.id;
    } else {
      return { error: "Choose the vehicle you're parking." };
    }

    const res = await createBooking({ driverId: user.id, spaceId, vehicleId, start, end });
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    redirect(`/bookings/${res.id}`);
  });
}

export async function messageHostAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const spaceId = str(fd, "space_id");
  if (!isUuid(spaceId)) return { error: "This space can't be found." };
  return runAsUser(`/spaces/${spaceId}`, async (user) => {
    const res = await getOrCreateConversation(spaceId, user.id);
    if (!res.ok) return { error: res.error };
    redirect(`/messages/${res.id}`);
  });
}

export async function reportSpaceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const spaceId = str(fd, "space_id");
  if (!isUuid(spaceId)) return { error: "This space can't be found." };
  return runAsUser(`/spaces/${spaceId}/report`, async (user) => {
    const res = await fileComplaint({ userId: user.id, spaceId, category: str(fd, "category"), details: str(fd, "details") });
    if (!res.ok) return { error: res.error };
    redirect(`/spaces/${spaceId}?reported=1`);
  });
}
