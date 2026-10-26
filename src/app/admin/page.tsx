import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SetupNeeded } from "@/components/setup-needed";
import { adminEnabled, isAdmin } from "@/lib/admin-session";
import { isDbConfigured } from "@/lib/db";
import { first, type RawParams } from "@/lib/search-params";
import { adminListComplaints } from "@/lib/services/complaints";
import { COMPLAINT_LABELS } from "@/lib/services/types";
import { formatDateTime } from "@/lib/time";
import { adminLogoutAction, resolveComplaintAction, setBannedAction, setSpaceStatusAction } from "./actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "reviewing", label: "Reviewing" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All" },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  if (!adminEnabled() || !(await isAdmin())) redirect("/admin/login");
  if (!isDbConfigured()) return <SetupNeeded />;
  const sp = await searchParams;
  const f = FILTERS.find((x) => x.id === first(sp.status))?.id ?? "open";
  const list = await adminListComplaints(f === "all" ? null : f);

  return (
    <div className="shell py-8 md:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[clamp(2.4rem,7vw,4rem)]">Reports</h1>
        <form action={adminLogoutAction}><button className="btn btn-ghost btn-sm">Sign out</button></form>
      </div>
      <nav aria-label="Filter reports" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.id} href={`/admin?status=${x.id}`} aria-current={f === x.id ? "true" : undefined}
            className={`chip min-h-9 px-3 no-underline ${f === x.id ? "chip-beige" : "chip-outline hover:border-beige hover:text-beige"}`}>{x.label}</Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="mt-8 text-stone">Nothing here.</p>
      ) : (
        <ul className="mt-6 grid max-w-3xl gap-4">
          {list.map((c) => (
            <li key={c.id} className="panel">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip chip-beige">{COMPLAINT_LABELS[c.category] ?? c.category}</span>
                <span className="chip chip-outline">{c.status}</span>
                <time className="text-sm text-stone" dateTime={new Date(c.created_at).toISOString()}>{formatDateTime(new Date(c.created_at))}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words">{c.details}</p>
              {c.space_id && (
                <p className="mt-2 text-sm text-stone">
                  Space: <Link className="link" href={`/spaces/${c.space_id}`}>{c.space_title ?? c.space_id}</Link> ({c.space_status})
                </p>
              )}
              {c.admin_note && <p className="mt-2 text-sm text-stone">Note: {c.admin_note}</p>}

              <ActionForm action={resolveComplaintAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end" ariaLabel="Update report">
                <input type="hidden" name="complaint_id" value={c.id} />
                <div>
                  <label className="label" htmlFor={`n-${c.id}`}>Note</label>
                  <input id={`n-${c.id}`} name="note" className="field" maxLength={500} defaultValue={c.admin_note ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor={`s-${c.id}`}>Status</label>
                  <select id={`s-${c.id}`} name="status" className="field" defaultValue={c.status}>
                    {["open", "reviewing", "resolved", "dismissed"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <SubmitButton className="btn btn-primary" pendingText="Saving…">Save</SubmitButton>
              </ActionForm>

              <div className="mt-3 flex flex-wrap gap-2">
                {c.space_id && (
                  <ActionForm action={setSpaceStatusAction}>
                    <input type="hidden" name="space_id" value={c.space_id} />
                    <input type="hidden" name="status" value={c.space_status === "suspended" ? "active" : "suspended"} />
                    <SubmitButton className="btn btn-ghost btn-sm" confirmText={c.space_status === "suspended" ? "Restore this space?" : "Suspend this space?"}>
                      {c.space_status === "suspended" ? "Restore space" : "Suspend space"}
                    </SubmitButton>
                  </ActionForm>
                )}
                {c.against_user_id && (
                  <ActionForm action={setBannedAction}>
                    <input type="hidden" name="user_id" value={c.against_user_id} />
                    <input type="hidden" name="banned" value={c.against_banned ? "0" : "1"} />
                    <SubmitButton className="btn btn-danger btn-sm" confirmText={c.against_banned ? "Restore this user?" : "Ban this user? This signs them out, suspends their spaces and cancels their open bookings."}>
                      {c.against_banned ? "Unban user" : "Ban user"}
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
