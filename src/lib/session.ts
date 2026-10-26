import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { hashIp } from "./phone";

const PROD = process.env.NODE_ENV === "production";
const COOKIE = PROD ? "__Host-ss_session" : "ss_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (PROD) throw new Error("SESSION_SECRET is not set (needs 32+ characters).");
  return new TextEncoder().encode("dev-only-session-secret-not-for-production!!");
}

export interface CurrentUser {
  id: string;
  nickname: string | null;
  upi_id: string | null;
  displayName: string;
}

export function displayName(u: { id: string; nickname: string | null; deleted_at?: Date | null }): string {
  if (u.deleted_at) return "Former member";
  return u.nickname || `Guest ${u.id.slice(0, 4)}`;
}

export async function startSession(userId: string, sessionVersion: number): Promise<void> {
  const token = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: PROD,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in user, re-checked against the database on every request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  let sub: string | undefined;
  let sv: unknown;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    sub = payload.sub;
    sv = payload.sv;
  } catch {
    return null;
  }
  if (!sub || typeof sv !== "number") return null;
  const rows = await db.query<{
    id: string;
    nickname: string | null;
    upi_id: string | null;
    session_version: number;
    banned_at: Date | null;
    deleted_at: Date | null;
  }>("select id, nickname, upi_id, session_version, banned_at, deleted_at from users where id = $1", [sub]);
  const u = rows[0];
  if (!u || u.banned_at || u.deleted_at || u.session_version !== sv) return null;
  return { id: u.id, nickname: u.nickname, upi_id: u.upi_id, displayName: displayName(u) };
});

export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-vercel-forwarded-for") || h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown";
  return hashIp(raw.trim());
}
