"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-types";
import { adminEnabled, endAdminSession, isAdmin, startAdminSession, tokenMatches } from "@/lib/admin-session";
import { isUuid } from "@/lib/ids";
import { hit, waitText } from "@/lib/rate-limit";
import { adminSetBanned, adminSetSpaceStatus, adminUpdateComplaint } from "@/lib/services/complaints";
import { clientIpHash } from "@/lib/session";

export async function adminLoginAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!adminEnabled()) return { error: "Admin isn't switched on for this site." };
  try {
    const rl = await hit(`admin_login:${await clientIpHash()}`, 6, 900);
    if (!rl.allowed) return { error: `Too many tries. Wait ${waitText(rl.retryAfterSec)}.` };
    if (!tokenMatches(String(fd.get("token") ?? ""))) return { error: "That token isn't right." };
    await startAdminSession();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[admin] login error", err instanceof Error ? err.message : err);
    return { error: "Something went wrong. Please try again." };
  }
  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}

async function guard(fn: () => Promise<ActionState>): Promise<ActionState> {
  if (!(await isAdmin())) redirect("/admin/login");
  try {
    const res = await fn();
    revalidatePath("/admin");
    return res;
  } catch (err) {
    unstable_rethrow(err);
    console.error("[admin] action error", err instanceof Error ? err.message : err);
    return { error: "Something went wrong." };
  }
}

export async function resolveComplaintAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("complaint_id") ?? "");
  if (!isUuid(id)) return { error: "Report not found." };
  return guard(async () => {
    const res = await adminUpdateComplaint(id, String(fd.get("status") ?? ""), String(fd.get("note") ?? ""));
    return res.ok ? { ok: "Updated." } : { error: res.error };
  });
}

export async function setSpaceStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("space_id") ?? "");
  const status = String(fd.get("status"));
  if (!isUuid(id) || (status !== "active" && status !== "suspended")) return { error: "Space not found." };
  return guard(async () => {
    const res = await adminSetSpaceStatus(id, status);
    return res.ok ? { ok: status === "active" ? "Space restored." : "Space suspended." } : { error: res.error };
  });
}

export async function setBannedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("user_id") ?? "");
  if (!isUuid(id)) return { error: "User not found." };
  const banned = String(fd.get("banned")) === "1";
  return guard(async () => {
    const res = await adminSetBanned(id, banned);
    return res.ok ? { ok: banned ? "User banned." : "User restored." } : { error: res.error };
  });
}
