"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAsUser, type ActionState } from "@/lib/action";
import { isUuid } from "@/lib/ids";
import { endSession, getCurrentUser } from "@/lib/session";
import { deleteAccount, signOutEverywhere, updateProfile } from "@/lib/services/users";
import { addVehicle, deleteVehicle } from "@/lib/services/vehicles";
import { parseVehicleForm } from "@/lib/validation";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function saveProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAsUser("/account", async (user) => {
    const res = await updateProfile(user.id, { nickname: str(fd, "nickname"), upi_id: str(fd, "upi_id") });
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    return { ok: "Saved." };
  });
}

export async function addVehicleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAsUser("/account", async (user) => {
    const parsed = parseVehicleForm(fd);
    if (!parsed.ok) return { error: parsed.error };
    const res = await addVehicle(user.id, parsed.data);
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    return { ok: "Vehicle saved." };
  });
}

export async function deleteVehicleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "vehicle_id");
  if (!isUuid(id)) return { error: "Vehicle not found." };
  return runAsUser("/account", async (user) => {
    const res = await deleteVehicle(user.id, id);
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    return { ok: "Removed." };
  });
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function signOutEverywhereAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await signOutEverywhere(user.id);
  await endSession();
  redirect("/login");
}

export async function deleteAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "confirm").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  return runAsUser("/account", async (user) => {
    const res = await deleteAccount(user.id);
    if (!res.ok) return { error: res.error };
    await endSession();
    redirect("/?deleted=1");
  });
}
