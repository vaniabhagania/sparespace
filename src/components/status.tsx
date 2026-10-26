import type { ReactNode } from "react";
import { IconAlert, IconCheck, IconClock, IconX } from "./icons";

const MAP: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  pending: { label: "Waiting for host", cls: "chip-outline", icon: <IconClock width={14} height={14} /> },
  confirmed: { label: "Confirmed", cls: "chip-beige", icon: <IconCheck width={14} height={14} /> },
  checked_in: { label: "Parked", cls: "chip-beige", icon: <IconCheck width={14} height={14} /> },
  completed: { label: "Completed", cls: "", icon: <IconCheck width={14} height={14} /> },
  declined: { label: "Declined", cls: "chip-flag", icon: <IconX width={14} height={14} /> },
  expired: { label: "Expired", cls: "chip-outline", icon: <IconClock width={14} height={14} /> },
  cancelled_by_driver: { label: "Cancelled", cls: "chip-outline", icon: <IconX width={14} height={14} /> },
  cancelled_by_host: { label: "Cancelled by host", cls: "chip-flag", icon: <IconX width={14} height={14} /> },
  no_show: { label: "No-show", cls: "chip-flag", icon: <IconAlert width={14} height={14} /> },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, cls: "chip-outline", icon: null };
  return (
    <span className={`chip ${m.cls}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "border-flag text-flag"
      : tone === "ok"
        ? "border-beige text-beige-soft"
        : "border-stone-dim text-cream";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border bg-cocoa-950/60 px-4 py-3 text-[0.95rem] ${cls}`}>
      <span className="mt-0.5 flex-none">{tone === "error" ? <IconAlert width={18} height={18} /> : <IconCheck width={18} height={18} />}</span>
      <div>{children}</div>
    </div>
  );
}

export function Stars({ value, count }: { value: number | null; count: number }) {
  if (!value || !count) return <span className="text-sm text-stone">New</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-beige"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8Z" /></svg></span>
      <span className="font-semibold">{value.toFixed(1)}</span>
      <span className="text-stone">({count})</span>
      <span className="sr-only">{`rated ${value.toFixed(1)} out of 5 by ${count} ${count === 1 ? "person" : "people"}`}</span>
    </span>
  );
}
