import { randomInt } from "node:crypto";
import { db } from "./db";
import { hashCode, safeEqualHex } from "./phone";

export type OtpProvider = "twilio" | "demo";

export interface OtpConfig {
  provider: OtpProvider;
  /** null when usable; otherwise a plain-language reason sign-in is switched off. */
  blockedReason: string | null;
}

const CODE_TTL_MIN = 5;
const MAX_ATTEMPTS_PER_CODE = 5;

export function otpConfig(): OtpConfig {
  const prod = process.env.NODE_ENV === "production";
  const provider: OtpProvider = process.env.OTP_PROVIDER === "twilio" ? "twilio" : "demo";
  if (provider === "twilio") {
    const ok =
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID;
    return ok ? { provider, blockedReason: null } : { provider, blockedReason: "SMS is not set up yet." };
  }
  if (prod && process.env.ALLOW_DEMO_OTP !== "true") {
    return { provider, blockedReason: "SMS sign-in is not switched on yet." };
  }
  return { provider, blockedReason: null };
}

export type SendResult = { ok: true; demoCode?: string } | { ok: false; error: string };

export async function sendOtp(phoneE164: string, phoneHash: string): Promise<SendResult> {
  const cfg = otpConfig();
  if (cfg.blockedReason) return { ok: false, error: cfg.blockedReason };

  if (cfg.provider === "demo") {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.tx(async (q) => {
      await q.query("delete from otp_codes where phone_hash = $1", [phoneHash]);
      await q.query(
        `insert into otp_codes (phone_hash, code_hash, expires_at)
         values ($1, $2, now() + make_interval(mins => $3))`,
        [phoneHash, hashCode(phoneHash, code), CODE_TTL_MIN],
      );
    });
    return { ok: true, demoCode: code };
  }

  try {
    const res = await twilio(`/Verifications`, { To: phoneE164, Channel: "sms" });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    if (res.status === 429) return { ok: false, error: "Too many codes requested. Try again later." };
    console.error("[otp] twilio send failed", res.status, res.code);
    return { ok: false, error: "We couldn't send the code. Check the number and try again." };
  } catch (err) {
    console.error("[otp] twilio send error", err instanceof Error ? err.message : err);
    return { ok: false, error: "We couldn't reach the SMS service. Try again in a moment." };
  }
}

export async function checkOtp(phoneE164: string, phoneHash: string, code: string): Promise<boolean> {
  const cfg = otpConfig();
  if (cfg.blockedReason) return false;

  if (cfg.provider === "demo") {
    // Atomically spend an attempt first, so parallel guesses cannot exceed the cap.
    const rows = await db.query<{ id: string; code_hash: string }>(
      `update otp_codes set attempts = attempts + 1
        where id = (
          select id from otp_codes
           where phone_hash = $1 and consumed_at is null and expires_at > now() and attempts < $2
           order by created_at desc limit 1)
          and consumed_at is null and attempts < $2
        returning id, code_hash`,
      [phoneHash, MAX_ATTEMPTS_PER_CODE],
    );
    const row = rows[0];
    if (!row) return false;
    if (!safeEqualHex(row.code_hash, hashCode(phoneHash, code))) return false;
    const spent = await db.query(
      "update otp_codes set consumed_at = now() where id = $1 and consumed_at is null returning id",
      [row.id],
    );
    return spent.length === 1;
  }

  try {
    const res = await twilio(`/VerificationCheck`, { To: phoneE164, Code: code });
    return res.status === 200 && res.verifyStatus === "approved";
  } catch (err) {
    console.error("[otp] twilio check error", err instanceof Error ? err.message : err);
    return false;
  }
}

async function twilio(
  path: string,
  form: Record<string, string>,
): Promise<{ status: number; code?: number; verifyStatus?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}${path}`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  let body: { status?: string; code?: number } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, code: body.code, verifyStatus: body.status };
}
