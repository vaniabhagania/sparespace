import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Indian mobile numbers only for now. Accepts "98765 43210", "+91 98765 43210",
 * "919876543210" or "09876543210" and returns E.164 ("+919876543210"), or null.
 */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) {
    if (!s.startsWith("+91")) return null;
    s = s.slice(3);
  } else if (s.length === 12 && s.startsWith("91")) {
    s = s.slice(2);
  } else if (s.length === 11 && s.startsWith("0")) {
    s = s.slice(1);
  }
  return /^[6-9]\d{9}$/.test(s) ? `+91${s}` : null;
}

export function maskPhone(e164: string): string {
  return `+91 ${e164.slice(3, 4)}••••••${e164.slice(-3)}`;
}

function pepper(): string {
  const p = process.env.PHONE_PEPPER;
  if (p && p.length >= 16) return p;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PHONE_PEPPER is not set (needs 16+ characters).");
  }
  return "dev-only-phone-pepper-not-secret";
}

/** One-way, keyed hash. This is all we keep of a phone number. */
export function hashPhone(e164: string): string {
  return createHmac("sha256", pepper()).update(`phone:${e164}`).digest("hex");
}

export function hashIp(ip: string): string {
  return createHmac("sha256", pepper()).update(`ip:${ip}`).digest("hex");
}

export function hashCode(phoneHash: string, code: string): string {
  return createHmac("sha256", pepper()).update(`otp:${phoneHash}:${code}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
