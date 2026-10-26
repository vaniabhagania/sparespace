import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FitDiagram } from "@/components/fit-diagram";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { SetupNeeded } from "@/components/setup-needed";
import { Notice, StatusBadge } from "@/components/status";
import { isDbConfigured } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { getBookingView, type BookingView } from "@/lib/services/booking-view";
import { COMPLAINT_CATEGORIES } from "@/lib/services/types";
import { formatDateTime, formatDuration, formatRange } from "@/lib/time";
import {
  approveAction, cancelAction, checkInAction, completeAction, declineAction, disputeAction,
  markPaidAction, messageOtherAction, noShowAction, reportBookingAction, reviewAction,
} from "./actions";

export const metadata: Metadata = { title: "Booking" };

const HOUR = 3_600_000;
const MIN = 60_000;

function Hidden({ id }: { id: string }) {
  return <input type="hidden" name="booking_id" value={id} />;
}

function PaymentPanel({ v, hasUpi }: { v: BookingView; hasUpi: boolean }) {
  const { b, role, extra, dueTotalPaise, hostUpi, other } = v;
  const parkedOrDone = b.status === "checked_in" || b.status === "completed";
  const upiLink = hostUpi
    ? `upi://pay?${new URLSearchParams({ pa: hostUpi, pn: other.name ?? "SpareSpace host", am: (dueTotalPaise / 100).toFixed(2), cu: "INR", tn: "SpareSpace parking" })}`
    : null;
  return (
    <section className="panel" aria-labelledby="pay-h">
      <h2 id="pay-h" className="text-3xl">Payment</h2>
      <dl className="mt-3 grid gap-1.5 text-[0.97rem]">
        <div className="flex justify-between gap-4"><dt className="text-stone">Stay</dt><dd>{formatINR(b.price_paise)}</dd></div>
        {extra.paise > 0 && (
          <div className="flex justify-between gap-4"><dt className="text-stone">Extra time ({extra.minutes} min over)</dt><dd>{formatINR(extra.paise)}</dd></div>
        )}
        <div className="flex justify-between gap-4 border-t border-cocoa-600 pt-2 text-lg font-semibold"><dt>Total</dt><dd>{formatINR(dueTotalPaise)}</dd></div>
      </dl>

      {b.payment_status === "paid" && (
        <p className="mt-4 flex gap-2"><IconCheck width={20} height={20} className="mt-0.5 flex-none text-beige" />
          <span>{role === "host" ? "You recorded" : "The host recorded"} this as paid by {b.paid_via === "upi" ? "UPI" : "cash"}.</span></p>
      )}
      {b.payment_status === "disputed" && (
        <div className="mt-4"><Notice tone="error">This payment has been flagged and is being looked into.</Notice></div>
      )}

      {b.payment_status === "unpaid" && role === "driver" && (
        <div className="mt-4 grid gap-3">
          <p className="text-stone">Pay the host directly, in cash or by UPI. Nothing is taken in the app. Ask them to mark it paid so you both have a record.</p>
          {upiLink && (
            <>
              <a href={upiLink} className="btn btn-primary">Pay {formatINR(dueTotalPaise)} by UPI</a>
              <p className="text-sm text-stone">Or send it to <span className="select-all font-semibold text-cream">{hostUpi}</span>.</p>
            </>
          )}
        </div>
      )}

      {b.payment_status === "unpaid" && role === "host" && (
        parkedOrDone ? (
          <div className="mt-4">
            <p className="mb-3 text-stone">Once you&apos;ve been paid, record it here. The driver can see it and flag it if it&apos;s wrong.</p>
            <ActionForm action={markPaidAction} className="flex flex-wrap gap-2">
              <Hidden id={b.id} />
              <SubmitButton name="via" value="cash" className="btn btn-primary" pendingText="Saving…">Got cash</SubmitButton>
              <SubmitButton name="via" value="upi" className="btn btn-ghost" pendingText="Saving…">Got UPI</SubmitButton>
            </ActionForm>
            {!hasUpi && <p className="hint">Add your UPI ID in <Link className="link" href="/account">Account</Link> so drivers can pay you in one tap.</p>}
          </div>
        ) : (
          <p className="mt-4 text-stone">You can record payment once the driver has checked in.</p>
        )
      )}

      {b.payment_status === "paid" && role === "driver" && (
        <ActionForm action={disputeAction} className="mt-4">
          <Hidden id={b.id} />
          <SubmitButton className="link cursor-pointer bg-transparent text-sm" confirmText="Flag this payment record as wrong? We'll look into it." pendingText="Flagging…">This isn&apos;t right</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}

function ReviewBox({ id, who }: { id: string; who: string }) {
  return (
    <section className="panel" aria-labelledby="rev-h">
      <h2 id="rev-h" className="text-3xl">How was it?</h2>
      <ActionForm action={reviewAction} className="mt-3 grid gap-4">
        <Hidden id={id} />
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="label">Rate {who}</legend>
          <div className="flex flex-wrap gap-2">
            {[5, 4, 3, 2, 1].map((n) => (
              <label key={n} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-stone-dim px-3 has-[:checked]:border-beige has-[:checked]:bg-cocoa-700">
                <input type="radio" name="rating" value={n} required />
                <span>{n} {n === 1 ? "star" : "stars"}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="rv-comment">A few words <span className="font-normal text-stone">(optional)</span></label>
          <textarea id="rv-comment" name="comment" className="field" maxLength={600} placeholder="Easy to find? As described? Friendly?" />
        </div>
        <SubmitButton pendingText="Posting…">Post review</SubmitButton>
      </ActionForm>
    </section>
  );
}

function ReportBox({ id }: { id: string }) {
  return (
    <details className="panel-sunken border border-cocoa-700">
      <summary className="cursor-pointer font-semibold text-stone hover:text-cream"><IconAlert width={16} height={16} className="mr-1.5 inline align-[-3px]" />Report a problem</summary>
      <ActionForm action={reportBookingAction} className="mt-4 grid gap-4">
        <Hidden id={id} />
        <div>
          <label className="label" htmlFor="rb-cat">What happened?</label>
          <select id="rb-cat" name="category" className="field" required defaultValue="">
            <option value="" disabled>Choose one</option>
            {COMPLAINT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rb-details">Details</label>
          <textarea id="rb-details" name="details" className="field" required minLength={10} maxLength={1000} placeholder="What happened, and when?" />
        </div>
        <SubmitButton className="btn btn-ghost" pendingText="Sending…">Send report</SubmitButton>
      </ActionForm>
    </details>
  );
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/bookings/${id}`);
  const v = await getBookingView(id, user.id);
  if (!v) notFound();

  const { b, role, space, other, driverRep, reviews } = v;
  const start = new Date(b.start_at);
  const end = new Date(b.end_at);
  const now = Date.now();
  const otherName = other.deleted ? "Former member" : other.name || (role === "driver" ? "The host" : "The driver");
  const mine = reviews.find((r) => r.reviewer_id === user.id);
  const confirmedPlus = ["confirmed", "checked_in", "completed"].includes(b.status);
  const checkInOpen = now >= start.getTime() - 30 * MIN && now < end.getTime();
  const noShowOpen = now >= start.getTime() + 30 * MIN;
  const lateDriverCancel = b.status === "confirmed" && start.getTime() - now < 2 * HOUR;
  const bay = { max_length_cm: space.max_length_cm, max_width_cm: space.max_width_cm, max_height_cm: space.max_height_cm };
  const vehicle = { length_cm: b.v_length_cm, width_cm: b.v_width_cm, height_cm: b.v_height_cm, label: b.vehicle_label };
  const overBy = b.status === "checked_in" ? Math.floor((now - end.getTime()) / MIN) : 0;

  return (
    <div className="shell py-6 md:py-10">
      <Link href={role === "host" ? "/host" : "/bookings"} className="link text-sm">{role === "host" ? "Back to hosting" : "Back to your trips"}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[clamp(2.2rem,6vw,3.6rem)]">{b.space_title}</h1>
        <StatusBadge status={b.status} />
      </div>
      <p className="mt-2 text-lg">{formatRange(start, end)} <span className="text-stone">({formatDuration(start, end)})</span></p>
      <p className="text-stone">{b.area_label}</p>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 content-start gap-6">
          {/* ------- status messages ------- */}
          {b.status === "pending" && (
            <Notice>
              {role === "driver"
                ? `Waiting for ${otherName} to confirm. They have until ${b.expires_at ? formatDateTime(new Date(b.expires_at)) : "your start time"}. You'll get the exact address and your arrival code the moment they do.`
                : `Check the driver's vehicle and track record, then approve or decline. This request expires ${b.expires_at ? formatDateTime(new Date(b.expires_at)) : "at the start time"}.`}
            </Notice>
          )}
          {b.status === "declined" && <Notice tone="error">{role === "driver" ? "The host couldn't take this one. You weren't charged anything." : "You declined this request."}</Notice>}
          {b.status === "expired" && <Notice>{role === "driver" ? "The host didn't reply in time, so this request closed. You weren't charged." : "This request expired because it wasn't answered."}</Notice>}
          {b.status === "cancelled_by_driver" && <Notice>{role === "driver" ? "You cancelled this booking." : "The driver cancelled this booking."}</Notice>}
          {b.status === "cancelled_by_host" && <Notice tone="error">{role === "host" ? "You cancelled this booking." : "The host cancelled this booking. You weren't charged. Sorry about that: find another space below."}</Notice>}
          {b.status === "no_show" && <Notice tone="error">{role === "host" ? "You marked this driver as a no-show." : "This booking was marked as a no-show because you didn't arrive."}</Notice>}
          {role === "driver" && ["declined", "expired", "cancelled_by_host", "no_show", "cancelled_by_driver"].includes(b.status) && (
            <Link href="/" className="btn btn-primary w-fit">Find another space</Link>
          )}

          {overBy > 15 && (
            <Notice tone="error">
              {role === "driver"
                ? `You're ${overBy} minutes past your time. Extra time is charged at 1.5× the hourly rate (${formatINR(v.extra.paise)} so far). Please move your vehicle or ask the host.`
                : `The driver is ${overBy} minutes over. Extra time due: ${formatINR(v.extra.paise)}. You can message them or report an overstay below.`}
            </Notice>
          )}

          {/* ------- driver: the ticket ------- */}
          {role === "driver" && (b.status === "confirmed" || b.status === "checked_in") && (
            <section className="ticket overflow-hidden" aria-labelledby="ticket-h">
              <div className="p-5 sm:p-6">
                <h2 id="ticket-h" className="text-3xl">{b.status === "checked_in" ? "You're parked" : "You're confirmed"}</h2>
                {space.address_line && <p className="mt-2 text-lg font-semibold">{space.address_line}</p>}
                {space.access_notes && <p className="mt-1 text-stone"><span className="font-semibold text-cream">How to get in: </span>{space.access_notes}</p>}
              </div>
              {b.status === "confirmed" && (
                <div className="ticket-stub p-5 text-center sm:p-6">
                  <p className="text-stone">Arrival code</p>
                  <p className="code mt-1" aria-label={`Arrival code ${b.checkin_code.split("").join(" ")}`}>{b.checkin_code}</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-stone">Show this to the host when you arrive. Only share it in person: it&apos;s what proves you actually turned up.</p>
                </div>
              )}
            </section>
          )}

          {space.point && (
            <section aria-label="Location">
              <MapView height="16rem" label="Map showing the exact location of the space" center={space.point} zoom={17}
                points={[{ id: b.space_id, lat: space.point.lat, lng: space.point.lng, text: "Here", name: b.space_title }]} />
              {role === "host" && space.address_line && <p className="mt-2 text-sm text-stone">{space.address_line}</p>}
            </section>
          )}

          {/* ------- host: the driver ------- */}
          {role === "host" && (
            <section className="panel" aria-labelledby="drv-h">
              <h2 id="drv-h" className="text-3xl">{otherName}</h2>
              <p className="mt-1 text-stone">
                {b.vehicle_label}
                {confirmedPlus && b.vehicle_plate ? `, plate ${b.vehicle_plate}` : ""}
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center">
                <div className="rounded-xl bg-cocoa-950 p-3"><FitDiagram compact bay={bay} vehicle={vehicle} /></div>
                {driverRep && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.97rem]">
                    <div><dt className="text-stone">Completed stays</dt><dd className="font-semibold">{driverRep.stays}</dd></div>
                    <div><dt className="text-stone">Rating from hosts</dt><dd className="font-semibold">{driverRep.rating_count ? `${driverRep.rating_avg?.toFixed(1)} (${driverRep.rating_count})` : "New"}</dd></div>
                    <div><dt className="text-stone">No-shows</dt><dd className={`font-semibold ${driverRep.no_shows ? "text-flag" : ""}`}>{driverRep.no_shows}</dd></div>
                    <div><dt className="text-stone">Late cancellations</dt><dd className={`font-semibold ${driverRep.late_cancels ? "text-flag" : ""}`}>{driverRep.late_cancels}</dd></div>
                  </dl>
                )}
              </div>
            </section>
          )}

          {/* ------- review ------- */}
          {b.status === "completed" && !mine && <ReviewBox id={b.id} who={role === "driver" ? "this space" : "this driver"} />}
          {b.status === "completed" && mine && (
            <p className="flex gap-2 text-stone"><IconCheck width={18} height={18} className="mt-0.5 flex-none text-beige" />You reviewed this stay: {mine.rating} {mine.rating === 1 ? "star" : "stars"}.</p>
          )}

          <ReportBox id={b.id} />
        </div>

        {/* ------- right column: actions + payment ------- */}
        <aside className="grid content-start gap-6 lg:sticky lg:top-24 lg:self-start" aria-label="Actions">
          {role === "host" && b.status === "pending" && (
            <section className="panel" aria-labelledby="dec-h">
              <h2 id="dec-h" className="text-3xl">Your answer</h2>
              <p className="mt-2 text-stone">You earn {formatINR(b.price_paise)}, paid to you directly at the space.</p>
              <div className="mt-4 grid gap-2">
                <ActionForm action={approveAction}><Hidden id={b.id} /><SubmitButton className="btn btn-primary btn-block" pendingText="Approving…">Approve</SubmitButton></ActionForm>
                <ActionForm action={declineAction}><Hidden id={b.id} /><SubmitButton className="btn btn-ghost btn-block" confirmText="Decline this request?" pendingText="Declining…">Decline</SubmitButton></ActionForm>
              </div>
            </section>
          )}

          {role === "host" && b.status === "confirmed" && (
            <section className="panel" aria-labelledby="ci-h">
              <h2 id="ci-h" className="text-3xl">When they arrive</h2>
              {checkInOpen ? (
                <ActionForm action={checkInAction} className="mt-3 grid gap-3">
                  <Hidden id={b.id} />
                  <div>
                    <label className="label" htmlFor="ci-code">Ask for their 4-digit arrival code</label>
                    <input id="ci-code" name="code" className="field text-center font-display text-3xl font-extrabold tracking-[0.4em]" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" required />
                  </div>
                  <SubmitButton className="btn btn-primary btn-block" pendingText="Checking…">Check them in</SubmitButton>
                </ActionForm>
              ) : now < start.getTime() ? (
                <p className="mt-2 text-stone">Check-in opens at {formatDateTime(new Date(start.getTime() - 30 * MIN))}. The driver has a 4-digit code that confirms they&apos;ve arrived.</p>
              ) : (
                <p className="mt-2 text-stone">This booking has ended.</p>
              )}
              {noShowOpen && now < end.getTime() + 12 * HOUR && (
                <ActionForm action={noShowAction} className="mt-4 border-t border-cocoa-600 pt-4">
                  <Hidden id={b.id} />
                  <p className="mb-2 text-sm text-stone">Driver hasn&apos;t turned up? You can free the bay and mark a no-show.</p>
                  <SubmitButton className="btn btn-ghost btn-block" confirmText="Mark this driver as a no-show? This is recorded on their account." pendingText="Saving…">Mark as no-show</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {b.status === "checked_in" && (
            <section className="panel" aria-labelledby="fin-h">
              <h2 id="fin-h" className="text-3xl">{role === "driver" ? "Leaving?" : "Bay free again?"}</h2>
              <p className="mt-2 text-stone">{role === "driver" ? "Tell us when you've driven out so the host can use the bay." : "Tap this once the driver has left."}</p>
              <ActionForm action={completeAction} className="mt-3">
                <Hidden id={b.id} />
                <SubmitButton className="btn btn-primary btn-block" pendingText="Saving…">{role === "driver" ? "I've left" : "The driver has left"}</SubmitButton>
              </ActionForm>
            </section>
          )}

          {confirmedPlus && <PaymentPanel v={v} hasUpi={role === "host" ? Boolean(user.upi_id) : true} />}

          <section className="panel-sunken border border-cocoa-700" aria-label="More">
            <ActionForm action={messageOtherAction}>
              <Hidden id={b.id} />
              <SubmitButton className="btn btn-ghost btn-block" pendingText="Opening…">Message {otherName}</SubmitButton>
            </ActionForm>
            {(b.status === "pending" || b.status === "confirmed") && (
              <ActionForm action={cancelAction} className="mt-2">
                <Hidden id={b.id} />
                <SubmitButton
                  className="btn btn-danger btn-block"
                  pendingText="Cancelling…"
                  confirmText={
                    role === "driver"
                      ? lateDriverCancel ? "Cancelling this close to your start time counts as a late cancellation on your account. Cancel anyway?" : "Cancel this booking?"
                      : b.status === "confirmed" ? "Cancelling a confirmed booking counts against your host record. Cancel anyway?" : "Cancel this request?"
                  }
                >
                  {b.status === "pending" && role === "driver" ? "Withdraw request" : "Cancel booking"}
                </SubmitButton>
                {role === "driver" && b.status === "confirmed" && (
                  <p className="hint flex gap-1.5"><IconLock width={14} height={14} className="mt-0.5 flex-none" />Free to cancel until 2 hours before you start.</p>
                )}
              </ActionForm>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
