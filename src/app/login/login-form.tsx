"use client";

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { step: "phone" };

export function LoginForm({ next, demoMode }: { next: string; demoMode: boolean }) {
  const [state, dispatch] = useActionState(loginAction, initial);
  const [pending, startTransition] = useTransition();
  const otpRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const verifyRef = useRef<HTMLButtonElement>(null);

  // Submit through a transition so a wrong number or code doesn't blank the form.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }

  // Progressive enhancement: where the browser supports WebOTP, fill the code in from the SMS.
  useEffect(() => {
    if (state.step !== "code" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const code = (cred as unknown as { code?: string } | null)?.code;
        if (code && otpRef.current) {
          otpRef.current.value = code;
          formRef.current?.requestSubmit(verifyRef.current);
        }
      })
      .catch(() => {
        /* aborted, dismissed or unsupported: manual entry still works */
      });
    return () => ac.abort();
  }, [state.step, state.demoCode, state.notice]);

  useEffect(() => {
    if (state.step === "code") otpRef.current?.focus();
  }, [state.step]);

  // After a wrong code, clear the box and put the cursor back in it.
  useEffect(() => {
    if (state.step === "code" && state.error && otpRef.current) {
      otpRef.current.value = "";
      otpRef.current.focus();
    }
  }, [state.step, state.error]);

  if (state.step === "phone") {
    return (
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="intent" value="send" />
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
          <p id="phone-hint" className="hint mb-1.5 mt-0">We&apos;ll text you a 6-digit code.</p>
          <div className="flex">
            <span className="field flex w-auto items-center rounded-r-none border-r-0 text-stone" aria-hidden="true">+91</span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="field rounded-l-none"
              placeholder="98765 43210"
              maxLength={16}
              defaultValue={state.phoneInput}
              required
              autoFocus
              aria-describedby="phone-hint"
              aria-invalid={state.error ? true : undefined}
            />
          </div>
          {state.error && <p className="err mt-2" role="alert">{state.error}</p>}
        </div>
        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Sending code…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} ref={formRef} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="phone" value={state.phone} />
      <div>
        <label className="label" htmlFor="otp">Verification code</label>
        <p id="otp-hint" className="hint mb-1.5 mt-0">Enter the 6-digit code sent to {state.masked}.</p>
        <input
          ref={otpRef}
          id="otp"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          className="field text-center"
          style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.9rem", letterSpacing: "0.45em", paddingLeft: "0.45em" }}
          aria-describedby="otp-hint"
          aria-invalid={state.error ? true : undefined}
          required
        />
        {state.error && <p className="err mt-2" role="alert">{state.error}</p>}
        {state.notice && !state.error && <p className="hint" role="status">{state.notice}</p>}
      </div>
      {demoMode && state.demoCode && (
        <div className="rounded-xl border border-beige bg-cocoa-950 px-4 py-3 text-[0.95rem]" role="status">
          Demo mode. Your code is <strong className="font-display text-2xl tracking-widest text-beige">{state.demoCode}</strong>
        </div>
      )}
      <button ref={verifyRef} name="intent" value="verify" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Checking…" : "Verify and continue"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button name="intent" value="resend" className="link cursor-pointer bg-transparent" formNoValidate>
          Send a new code
        </button>
        <button name="intent" value="back" className="link cursor-pointer bg-transparent" formNoValidate>
          Use a different number
        </button>
      </div>
    </form>
  );
}
