"use client";

import { createContext, useActionState, useContext, useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-types";

const PendingContext = createContext(false);

/**
 * A form wired to a server action, with its error or confirmation shown under the buttons.
 * It submits through a transition instead of the `action` prop, because the `action` prop
 * wipes everything the person typed whenever the server says no.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnOk = false,
  ariaLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** Clear the fields after a success (for forms that stay on the page, like a chat box). */
  resetOnOk?: boolean;
  ariaLabel?: string;
}) {
  const [state, dispatch] = useActionState(action, {} as ActionState);
  const [pending, startTransition] = useTransition();
  const [resetKey, setResetKey] = useState(0);

  // An "ok" of any kind (even empty) means it worked; remount the form to clear what was typed.
  useEffect(() => {
    if (resetOnOk && state.ok !== undefined) setResetKey((k) => k + 1);
  }, [state, resetOnOk]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className={className} aria-label={ariaLabel} key={resetKey} aria-busy={pending}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state.error && <p className="err mt-2" role="alert">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-beige-soft" role="status">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary",
  name,
  value,
  confirmText,
  formNoValidate,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  confirmText?: string;
  formNoValidate?: boolean;
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      formNoValidate={formNoValidate}
      onClick={confirmText ? (e) => { if (!window.confirm(confirmText)) e.preventDefault(); } : undefined}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
