"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAsUser, type ActionState } from "@/lib/action";
import { isUuid } from "@/lib/ids";
import {
  cancelBooking, checkIn, completeBooking, disputePayment, hostDecision, loadBookingFor, markNoShow, markPaid,
} from "@/lib/services/bookings";
import { fileComplaint } from "@/lib/services/complaints";
import { getOrCreateConversation } from "@/lib/services/messages";
import { createReview } from "@/lib/services/reviews";
import type { Result } from "@/lib/services/types";
import type { CurrentUser } from "@/lib/session";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function withBooking(
  fd: FormData,
  okText: string,
  fn: (id: string, user: CurrentUser) => Promise<Result<object>>,
): Promise<ActionState> {
  const id = str(fd, "booking_id");
  if (!isUuid(id)) return { error: "This booking can't be found." };
  return runAsUser(`/bookings/${id}`, async (user) => {
    const res = await fn(id, user);
    if (!res.ok) return { error: res.error };
    revalidatePath("/", "layout");
    return { ok: okText };
  });
}

export async function approveAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "Approved. The driver has been told.", (id, u) => hostDecision(id, u.id, true));
}
export async function declineAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "Declined.", (id, u) => hostDecision(id, u.id, false));
}
export async function cancelAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "Cancelled.", (id, u) => cancelBooking(id, u.id));
}
export async function checkInAction(_p: ActionState, fd: FormData) {
  const code = str(fd, "code").replace(/\s/g, "");
  if (!/^\d{4}$/.test(code)) return { error: "Enter the 4-digit arrival code." };
  return withBooking(fd, "Checked in. Enjoy the stay.", (id, u) => checkIn(id, u.id, code));
}
export async function completeAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "Done. Thanks for using SpareSpace.", (id, u) => completeBooking(id, u.id));
}
export async function noShowAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "Marked as a no-show.", (id, u) => markNoShow(id, u.id));
}
export async function markPaidAction(_p: ActionState, fd: FormData) {
  const via = str(fd, "via");
  if (via !== "cash" && via !== "upi") return { error: "Choose cash or UPI." };
  return withBooking(fd, "Recorded as paid.", (id, u) => markPaid(id, u.id, via));
}
export async function disputeAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "We've flagged this payment for review.", (id, u) => disputePayment(id, u.id));
}

export async function reviewAction(_p: ActionState, fd: FormData) {
  const rating = Number(str(fd, "rating"));
  return withBooking(fd, "Thanks for your review.", (id, u) => createReview({ bookingId: id, reviewerId: u.id, rating, comment: str(fd, "comment") }));
}

export async function reportBookingAction(_p: ActionState, fd: FormData) {
  return withBooking(fd, "Thanks. We've received your report and will look into it.", (id, u) =>
    fileComplaint({ userId: u.id, bookingId: id, category: str(fd, "category"), details: str(fd, "details") }),
  );
}

export async function messageOtherAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "booking_id");
  if (!isUuid(id)) return { error: "This booking can't be found." };
  return runAsUser(`/bookings/${id}`, async (user) => {
    const b = await loadBookingFor(id, user.id);
    if (!b) return { error: "This booking can't be found." };
    const res = await getOrCreateConversation(b.space_id, b.driver_id);
    if (!res.ok) return { error: res.error };
    redirect(`/messages/${res.id}`);
  });
}
