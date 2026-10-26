"use server";

import { redirect } from "next/navigation";
import { DbNotConfiguredError } from "@/lib/db";
import { checkOtp, sendOtp } from "@/lib/otp";
import { hashPhone, maskPhone, normalizePhone } from "@/lib/phone";
import { hit, waitText } from "@/lib/rate-limit";
import { clientIpHash, startSession } from "@/lib/session";
import { upsertUserByPhoneHash } from "@/lib/services/users";
import { safeNext } from "@/lib/text";

export interface LoginState {
  step: "phone" | "code";
  phone?: string;
  masked?: string;
  demoCode?: string;
  error?: string;
  notice?: string;
  /** What was typed in the number box, so it can be shown again after an error. */
  phoneInput?: string;
}

const BAD_PHONE = "Enter a 10-digit Indian mobile number, like 98765 43210.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "send");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (intent === "back") return { step: "phone" };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: BAD_PHONE, phoneInput: String(formData.get("phone") ?? "").slice(0, 16) };
  const phoneHash = hashPhone(phone);
  const masked = maskPhone(phone);

  let signedIn = false;
  let result: LoginState;

  try {
    const ip = await clientIpHash();

    if (intent === "send" || intent === "resend") {
      const limits = [
        await hit(`otp_send:phone:${phoneHash}`, 3, 600),
        await hit(`otp_send:phone-day:${phoneHash}`, 8, 86_400),
        await hit(`otp_send:ip:${ip}`, 15, 3600),
      ];
      const blocked = limits.find((l) => !l.allowed);
      if (blocked) {
        result = {
          step: intent === "resend" ? "code" : "phone",
          phone,
          masked,
          error: `Too many codes requested. Try again in ${waitText(blocked.retryAfterSec)}.`,
        };
      } else {
        const sent = await sendOtp(phone, phoneHash);
        result = sent.ok
          ? { step: "code", phone, masked, demoCode: sent.demoCode, notice: intent === "resend" ? "We sent a new code." : undefined }
          : { step: "phone", error: sent.error, phoneInput: phone.replace(/^\+91/, "") };
      }
    } else {
      const code = String(formData.get("otp") ?? "").replace(/\s/g, "");
      const base = { step: "code" as const, phone, masked };
      if (!/^\d{6}$/.test(code)) {
        result = { ...base, error: "Enter the 6-digit code." };
      } else {
        const limits = [await hit(`otp_verify:phone:${phoneHash}`, 10, 600), await hit(`otp_verify:ip:${ip}`, 40, 3600)];
        const blocked = limits.find((l) => !l.allowed);
        if (blocked) {
          result = { ...base, error: `Too many attempts. Try again in ${waitText(blocked.retryAfterSec)}.` };
        } else if (!(await checkOtp(phone, phoneHash, code))) {
          result = { ...base, error: "That code didn't work. Check it and try again, or ask for a new one." };
        } else {
          const user = await upsertUserByPhoneHash(phoneHash);
          if (user.banned_at) {
            result = { step: "phone", error: "This number can't be used on SpareSpace." };
          } else {
            await startSession(user.id, user.session_version);
            signedIn = true;
            result = base;
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return { step: "phone", error: "SpareSpace isn't connected to its database yet, so sign-in isn't available." };
    }
    console.error("[login] unexpected error", err instanceof Error ? err.message : err);
    return { step: "phone", error: "Something went wrong on our side. Please try again." };
  }

  if (signedIn) redirect(next); // redirect() throws, so it stays outside the try/catch
  return result;
}
