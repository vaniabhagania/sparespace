import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconLock } from "@/components/icons";
import { Notice } from "@/components/status";
import { otpConfig } from "@/lib/otp";
import { getCurrentUser } from "@/lib/session";
import { safeNext } from "@/lib/text";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  let signedIn = false;
  try {
    signedIn = Boolean(await getCurrentUser());
  } catch {
    /* no database yet: just show the form */
  }
  if (signedIn) redirect(next);
  const cfg = otpConfig();

  return (
    <div className="shell py-10 md:py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-[clamp(2.4rem,9vw,3.6rem)]">Sign in with your mobile number</h1>
        <p className="mt-3 text-stone">
          No password and no email. New here? Entering your number creates your account.
        </p>
        <div className="panel mt-7">
          {cfg.blockedReason ? (
            <Notice tone="error">{cfg.blockedReason} Please check back soon.</Notice>
          ) : (
            <LoginForm next={next} demoMode={cfg.provider === "demo"} />
          )}
        </div>
        <p className="mt-5 flex gap-2.5 text-sm text-stone">
          <IconLock width={18} height={18} className="mt-0.5 flex-none" />
          <span>
            We don&apos;t store your number. We keep only a scrambled version that can&apos;t be turned back into it,
            and other people never see it. Chat and the arrival code happen inside the app.
          </span>
        </p>
      </div>
    </div>
  );
}
