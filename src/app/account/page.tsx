import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { IconLock } from "@/components/icons";
import { SetupNeeded } from "@/components/setup-needed";
import { isDbConfigured } from "@/lib/db";
import { VEHICLE_KIND_LABELS } from "@/lib/fit";
import { requireUser } from "@/lib/session";
import { listVehicles } from "@/lib/services/vehicles";
import { deleteAccountAction, deleteVehicleAction, saveProfileAction, signOutAction, signOutEverywhereAction } from "./actions";
import { VehicleForm } from "./vehicle-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  if (!isDbConfigured()) return <SetupNeeded />;
  const user = await requireUser("/account");
  const vehicles = await listVehicles(user.id);

  return (
    <div className="shell py-8 md:py-12">
      <div className="mx-auto grid max-w-2xl gap-10">
        <div>
          <h1 className="text-[clamp(2.4rem,7vw,3.8rem)]">Your account</h1>
          <p className="mt-2 flex gap-2 text-stone"><IconLock width={18} height={18} className="mt-0.5 flex-none" />You signed in with your mobile number. We don&apos;t keep the number itself, and nobody else ever sees it.</p>
        </div>

        <section aria-labelledby="prof-h">
          <h2 id="prof-h" className="text-3xl">Profile</h2>
          <ActionForm action={saveProfileAction} className="panel mt-3 grid gap-4">
            <div>
              <label className="label" htmlFor="ac-name">Name shown to others <span className="font-normal text-stone">(optional)</span></label>
              <input id="ac-name" name="nickname" className="field" defaultValue={user.nickname ?? ""} maxLength={30} autoComplete="nickname" placeholder="A first name or nickname is fine" />
              <p className="hint">If you leave it empty, you appear as &ldquo;Guest {user.id.slice(0, 4)}&rdquo;.</p>
            </div>
            <div>
              <label className="label" htmlFor="ac-upi">UPI ID <span className="font-normal text-stone">(optional, for hosts)</span></label>
              <input id="ac-upi" name="upi_id" className="field" defaultValue={user.upi_id ?? ""} maxLength={80} autoCapitalize="none" autoComplete="off" placeholder="name@bank" />
              <p className="hint">Shown only to drivers with a confirmed booking at your space, so they can pay you in one tap.</p>
            </div>
            <div><SubmitButton pendingText="Saving…">Save</SubmitButton></div>
          </ActionForm>
        </section>

        <section aria-labelledby="veh-h">
          <h2 id="veh-h" className="text-3xl">Your vehicles</h2>
          {vehicles.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {vehicles.map((v) => (
                <li key={v.id} className="panel flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div>
                    <p className="font-semibold">{v.label}{v.plate ? <span className="font-normal text-stone">, {v.plate}</span> : null}</p>
                    <p className="text-sm text-stone">{VEHICLE_KIND_LABELS[v.kind]}, {v.length_cm} × {v.width_cm} × {v.height_cm} cm</p>
                  </div>
                  <ActionForm action={deleteVehicleAction}>
                    <input type="hidden" name="vehicle_id" value={v.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" confirmText={`Remove ${v.label}?`} pendingText="Removing…">Remove</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-stone">No vehicles saved yet. Add one and searches only show spaces it fits.</p>
          )}
          <div className="panel mt-3">
            <h3 className="mb-3 text-2xl">Add a vehicle</h3>
            <VehicleForm />
          </div>
        </section>

        <section aria-labelledby="sess-h">
          <h2 id="sess-h" className="text-3xl">Sign out</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={signOutAction}><button className="btn btn-ghost">Sign out</button></form>
            <form action={signOutEverywhereAction}><button className="btn btn-ghost">Sign out on all devices</button></form>
          </div>
        </section>

        <section aria-labelledby="del-h">
          <h2 id="del-h" className="text-3xl">Delete my account</h2>
          <details className="panel-sunken mt-3 border border-cocoa-700">
            <summary className="cursor-pointer font-semibold text-flag">I want to delete my account</summary>
            <div className="mt-4 grid gap-3">
              <p className="text-stone">This removes your name, UPI ID, vehicles, plates and chats, cancels anything upcoming and pauses your spaces. Past bookings and reviews stay for the other person&apos;s records, shown as &ldquo;Former member&rdquo;. It can&apos;t be undone.</p>
              <ActionForm action={deleteAccountAction} className="grid gap-3">
                <div>
                  <label className="label" htmlFor="del-confirm">Type DELETE to confirm</label>
                  <input id="del-confirm" name="confirm" className="field max-w-xs" autoComplete="off" autoCapitalize="characters" required />
                </div>
                <div><SubmitButton className="btn btn-danger" pendingText="Deleting…">Delete my account</SubmitButton></div>
              </ActionForm>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
