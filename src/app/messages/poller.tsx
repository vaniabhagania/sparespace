"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Quietly refreshes the page every few seconds while it's visible, so new messages just appear. */
export function Poller({ everyMs = 8000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [router, everyMs]);
  return null;
}
