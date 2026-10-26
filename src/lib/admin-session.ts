import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const PROD = process.env.NODE_ENV === "production";
const COOKIE = PROD ? "__Host-ss_admin" : "ss_admin";
const MAX_AGE_SEC = 60 * 60 * 8;

/** Admin is off unless a long ADMIN_TOKEN is set. */
export function adminEnabled(): boolean {
  const t = process.env.ADMIN_TOKEN;
  return Boolean(t && t.length >= 16);
}

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (PROD) throw new Error("SESSION_SECRET is not set (needs 32+ characters).");
  }
  // Tying the key to ADMIN_TOKEN means changing the token signs every admin out.
  return createHmac("sha256", secret && secret.length >= 32 ? secret : "dev-only-session-secret-not-for-production!!")
    .update(`admin:${process.env.ADMIN_TOKEN ?? ""}`)
    .digest();
}

export function tokenMatches(given: string): boolean {
  const want = process.env.ADMIN_TOKEN ?? "";
  if (!adminEnabled()) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}

export async function startAdminSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: PROD, sameSite: "strict", path: "/", maxAge: MAX_AGE_SEC });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  if (!adminEnabled()) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}
