import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomPhoneHash, resetDatabase, TEST_DB_URL } from "./helpers";

process.env.POSTGRES_URL = TEST_DB_URL;

import { db, closeDb } from "@/lib/db";
import { otpConfig, sendOtp, checkOtp } from "@/lib/otp";
import { hit } from "@/lib/rate-limit";

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closeDb();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const PHONE = "+919876543210";

describe("demo OTP", () => {
  it("sends a 6 digit code that works once", async () => {
    const hash = randomPhoneHash();
    const sent = await sendOtp(PHONE, hash);
    expect(sent.ok && sent.demoCode).toMatch(/^\d{6}$/);
    if (!sent.ok || !sent.demoCode) return;
    expect(await checkOtp(PHONE, hash, "000000" === sent.demoCode ? "111111" : "000000")).toBe(false);
    expect(await checkOtp(PHONE, hash, sent.demoCode)).toBe(true);
    expect(await checkOtp(PHONE, hash, sent.demoCode)).toBe(false); // spent
  });

  it("never stores the code itself", async () => {
    const hash = randomPhoneHash();
    const sent = await sendOtp(PHONE, hash);
    if (!sent.ok || !sent.demoCode) throw new Error("no code");
    const rows = await db.query<{ code_hash: string }>("select code_hash from otp_codes where phone_hash = $1", [hash]);
    expect(rows[0].code_hash).not.toContain(sent.demoCode);
    expect(rows[0].code_hash).toHaveLength(64);
  });

  it("a code is only good for the phone it was sent to", async () => {
    const a = randomPhoneHash(), b = randomPhoneHash();
    const sent = await sendOtp(PHONE, a);
    if (!sent.ok || !sent.demoCode) throw new Error("no code");
    expect(await checkOtp(PHONE, b, sent.demoCode)).toBe(false);
    expect(await checkOtp(PHONE, a, sent.demoCode)).toBe(true);
  });

  it("locks after 5 wrong guesses, even if the next guess is right", async () => {
    const hash = randomPhoneHash();
    const sent = await sendOtp(PHONE, hash);
    if (!sent.ok || !sent.demoCode) throw new Error("no code");
    const wrong = sent.demoCode === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) expect(await checkOtp(PHONE, hash, wrong)).toBe(false);
    expect(await checkOtp(PHONE, hash, sent.demoCode)).toBe(false);
  });

  it("parallel guessing can't beat the attempt cap", async () => {
    const hash = randomPhoneHash();
    const sent = await sendOtp(PHONE, hash);
    if (!sent.ok || !sent.demoCode) throw new Error("no code");
    const real = sent.demoCode;
    // 60 simultaneous guesses, one of which is the real code, fired among many wrong ones.
    const guesses = Array.from({ length: 60 }, (_, i) => String(i).padStart(6, "0")).filter((g) => g !== real);
    guesses.splice(40, 0, real);
    const results = await Promise.all(guesses.map((g) => checkOtp(PHONE, hash, g)));
    const [row] = await db.query<{ attempts: number }>("select attempts from otp_codes where phone_hash = $1", [hash]);
    expect(row.attempts).toBeLessThanOrEqual(5);
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it("expires after 5 minutes", async () => {
    const hash = randomPhoneHash();
    const sent = await sendOtp(PHONE, hash);
    if (!sent.ok || !sent.demoCode) throw new Error("no code");
    await db.query("update otp_codes set expires_at = now() - interval '1 second' where phone_hash = $1", [hash]);
    expect(await checkOtp(PHONE, hash, sent.demoCode)).toBe(false);
  });

  it("asking for a new code kills the old one", async () => {
    const hash = randomPhoneHash();
    const first = await sendOtp(PHONE, hash);
    const second = await sendOtp(PHONE, hash);
    if (!first.ok || !second.ok || !first.demoCode || !second.demoCode) throw new Error("no code");
    if (first.demoCode !== second.demoCode) expect(await checkOtp(PHONE, hash, first.demoCode)).toBe(false);
    expect(await checkOtp(PHONE, hash, second.demoCode)).toBe(true);
  });
});

describe("OTP configuration guards", () => {
  it("production refuses demo codes unless explicitly allowed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_PROVIDER", "demo");
    vi.stubEnv("ALLOW_DEMO_OTP", "false");
    expect(otpConfig().blockedReason).toMatch(/not switched on/);
    vi.stubEnv("ALLOW_DEMO_OTP", "true");
    expect(otpConfig().blockedReason).toBeNull();
  });
  it("production with no provider configured fails closed and sends nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_PROVIDER", "");
    vi.stubEnv("ALLOW_DEMO_OTP", "");
    const r = await sendOtp(PHONE, randomPhoneHash());
    expect(r.ok).toBe(false);
    expect(await checkOtp(PHONE, randomPhoneHash(), "123456")).toBe(false);
  });
  it("twilio needs all three credentials", () => {
    vi.stubEnv("OTP_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VAxxx");
    expect(otpConfig().blockedReason).not.toBeNull();
  });
});

describe("Twilio Verify adapter (mocked network)", () => {
  function setup(responses: { status: number; body: object }[]) {
    vi.stubEnv("OTP_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "secret-token");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VAtest");
    const calls: { url: string; init: RequestInit }[] = [];
    let i = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = responses[Math.min(i++, responses.length - 1)];
      return new Response(JSON.stringify(r.body), { status: r.status });
    });
    return calls;
  }

  it("sends the right request and never returns a code to the browser", async () => {
    const calls = setup([{ status: 201, body: { status: "pending" } }]);
    const r = await sendOtp(PHONE, randomPhoneHash());
    expect(r).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://verify.twilio.com/v2/Services/VAtest/Verifications");
    expect(String(calls[0].init.body)).toContain("To=%2B919876543210");
    expect(String(calls[0].init.body)).toContain("Channel=sms");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Basic " + Buffer.from("ACtest:secret-token").toString("base64"),
    );
  });

  it("only accepts an 'approved' verification", async () => {
    setup([{ status: 200, body: { status: "approved" } }]);
    expect(await checkOtp(PHONE, randomPhoneHash(), "123456")).toBe(true);
    setup([{ status: 200, body: { status: "pending" } }]);
    expect(await checkOtp(PHONE, randomPhoneHash(), "123456")).toBe(false);
    setup([{ status: 404, body: { code: 20404 } }]);
    expect(await checkOtp(PHONE, randomPhoneHash(), "123456")).toBe(false);
  });

  it("fails safely on rate limits and network errors", async () => {
    setup([{ status: 429, body: { code: 60203 } }]);
    const limited = await sendOtp(PHONE, randomPhoneHash());
    expect(!limited.ok && limited.error).toMatch(/Too many/);

    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    expect((await sendOtp(PHONE, randomPhoneHash())).ok).toBe(false);
    expect(await checkOtp(PHONE, randomPhoneHash(), "123456")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit, then blocks with a retry time", async () => {
    const key = "test:" + Math.random();
    for (let i = 0; i < 3; i++) expect((await hit(key, 3, 60)).allowed).toBe(true);
    const blocked = await hit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });
  it("keys are independent", async () => {
    const a = "test:a" + Math.random(), b = "test:b" + Math.random();
    for (let i = 0; i < 2; i++) await hit(a, 2, 60);
    expect((await hit(a, 2, 60)).allowed).toBe(false);
    expect((await hit(b, 2, 60)).allowed).toBe(true);
  });
  it("forgets old events once the window passes", async () => {
    const key = "test:w" + Math.random();
    await hit(key, 1, 60);
    expect((await hit(key, 1, 60)).allowed).toBe(false);
    await db.query("update rate_events set created_at = now() - interval '2 minutes' where key = $1", [key]);
    expect((await hit(key, 1, 60)).allowed).toBe(true);
  });
});
