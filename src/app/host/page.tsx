import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { IconPin } from "@/components/icons";
import { SetupNeeded } from "@/components/setup-needed";
import { Notice, Stars, StatusBadge } from "@/components/status";
import { describeSchedule } from "@/lib/availability";
import { isDbConfigured } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { first, type RawParams } from "@/lib/search-params";
import { requireUser } from "@/lib/session";
import { listHostBookings } from "@/lib/services/bookings";
import { listHostSpaces } from "@/lib/services/spaces";
import { SPACE_KIND_LABELS } from "@/lib/services/types";
import { formatRange, istParts } from "@/lib/time";
import { toggleSpaceAction } from "./actions";

export const metadata: Metadata = { title: "Host" };

export default async function HostPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const sp = await searchParams;
  const user = await requireUser("/host");
  const [spaces, bookings] = await Promise.all([listHostSpaces(user.id), listHostBookings(user.id)]);

  const now = new Date();
  const ym = (d: Date) => { const p = istParts(d); return p.year * 12 + p.month; };
  const paid = bookings.filter((b) => b.payment_status === "paid");
  const thisMonth = paid.filter((b) => ym(new Date(b.start_at)) === ym(now)).reduce((n, b) => n + b.price_paise, 0);
  const allTime = paid.reduce((n, b) => n + b.price_paise, 0);

  const requests = bookings.filter((b) => b.status === "pending" && b.expires_at && new Date(b.expires_at) > now);
  const active = bookings
    .filter((b) => b.status === "confirmed" || b.status === "checked_in")
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
  const past = bookings.filter((b) => !["pending", "confirmed", "checked_in"].includes(b.status) || (b.status === "pending" && !(b.expires_at && new Date(b.expires_at) > now))).slice(0, 12);

  const Row = ({ b, cta }: { b: (typeof bookings)[number]; cta?: string }) => (
    <li className="panel relative transition-colors hover:bg-cocoa-700/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.5rem]">
            <Link href={`/bookings/${b.id}`} className="no-underline after:absolute after:inset-0 after:content-['']">{b.space_title}</Link>
          </h3>
          <p className="mt-1">{formatRange(new Date(b.start_at), new Date(b.end_at))}</p>
          <p className="mt-1 text-sm text-stone">
            {b.driver_name || "Guest driver"}, {b.vehicle_label}
            {b.driver_no_shows > 0 && <span className="text-flag"> · {b.driver_no_shows} past no-show{b.driver_no_shows > 1 ? "s" : ""}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={b.status} />
          <span className="font-display text-2xl font-extrabold leading-none">{formatINR(b.price_paise)}</span>
          {b.payment_status === "paid" && <span className="text-xs text-stone">Paid by {b.paid_via === "upi" ? "UPI" : "cash"}</span>}
          {b.payment_status === "disputed" && <span className="chip chip-flag">Payment flagged</span>}
          {cta && <span className="text-sm font-semibold text-beige">{cta}</span>}
        </div>
      </div>
    </li>
  );

  return (
    <div className="shell py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[clamp(2.4rem,7vw,4rem)]">Hosting</h1>
        <Link href="/host/new" className="btn btn-primary">List a space</Link>
      </div>

      {(first(sp.listed) || first(sp.saved)) && (
        <div className="mt-5 max-w-2xl">
          <Notice tone="ok">{first(sp.listed) ? "Your space is live. Drivers nearby can find it now." : "Changes saved."}</Notice>
        </div>
      )}
      {!user.upi_id && spaces.length > 0 && (
        <div className="mt-5 max-w-2xl">
          <Notice>Add your UPI ID in <Link className="link" href="/account">Account</Link> so drivers can pay you in one tap.</Notice>
        </div>
      )}

      {spaces.length === 0 ? (
        <div className="panel mt-8 max-w-2xl">
          <h2 className="text-3xl">An empty bay is money sitting still</h2>
          <p className="mt-2 text-stone">List a bay from your building, shop or office and set your own price and hours. Drivers pay you directly, in cash or UPI. You only need a mobile number.</p>
          <Link href="/host/new" className="btn btn-primary mt-5">List your first space</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10">
          <section aria-labelledby="earn-h">
            <h2 id="earn-h" className="sr-only">Earnings</h2>
            <dl className="grid max-w-2xl grid-cols-2 gap-3">
              <div className="panel"><dt className="text-stone">This month</dt><dd className="font-display text-4xl font-extrabold leading-none">{formatINR(thisMonth)}</dd></div>
              <div className="panel"><dt className="text-stone">All time</dt><dd className="font-display text-4xl font-extrabold leading-none">{formatINR(allTime)}</dd></div>
            </dl>
            <p className="mt-2 text-sm text-stone">Stays you&apos;ve recorded as paid. Money goes straight from drivers to you, never through us.</p>
          </section>

          {requests.length > 0 && (
            <section aria-labelledby="req-h">
              <h2 id="req-h" className="text-3xl">Requests waiting <span className="text-beige">({requests.length})</span></h2>
              <ul className="mt-3 grid max-w-3xl gap-3">{requests.map((b) => <Row key={b.id} b={b} cta="Review request" />)}</ul>
            </section>
          )}

          {active.length > 0 && (
            <section aria-labelledby="act-h">
              <h2 id="act-h" className="text-3xl">Coming up and in progress</h2>
              <ul className="mt-3 grid max-w-3xl gap-3">{active.map((b) => <Row key={b.id} b={b} />)}</ul>
            </section>
          )}

          <section aria-labelledby="sp-h">
            <h2 id="sp-h" className="text-3xl">Your spaces</h2>
            <ul className="mt-3 grid max-w-3xl gap-3">
              {spaces.map((s) => (
                <li key={s.id} className="panel">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[1.6rem]"><Link href={`/spaces/${s.id}`} className="no-underline hover:text-beige">{s.title}</Link></h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-stone"><IconPin width={14} height={14} />{s.area_label}<span aria-hidden="true">·</span>{SPACE_KIND_LABELS[s.kind]}</p>
                      <p className="mt-1 text-sm text-stone">{describeSchedule(s)}, {formatINR(s.price_hour_paise)}/hr, {s.capacity} {s.capacity === 1 ? "bay" : "bays"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {s.status === "active" && <span className="chip chip-beige">Live</span>}
                      {s.status === "paused" && <span className="chip chip-outline">Paused</span>}
                      {s.status === "suspended" && <span className="chip chip-flag">Suspended</span>}
                      <Stars value={s.rating_avg} count={s.rating_count} />
                    </div>
                  </div>
                  {s.status === "suspended" && <p className="mt-3 text-sm text-flag">Hidden while we look into a report. You can&apos;t edit it right now.</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {s.status !== "suspended" && <Link href={`/host/${s.id}/edit`} className="btn btn-ghost btn-sm">Edit</Link>}
                    {s.status !== "suspended" && (
                      <ActionForm action={toggleSpaceAction} className="inline-block">
                        <input type="hidden" name="space_id" value={s.id} />
                        <input type="hidden" name="active" value={s.status === "active" ? "0" : "1"} />
                        <SubmitButton className="btn btn-ghost btn-sm" pendingText="Saving…">{s.status === "active" ? "Pause" : "Go live"}</SubmitButton>
                      </ActionForm>
                    )}
                    {s.upcoming > 0 && <span className="text-sm text-stone">{s.upcoming} upcoming</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past-h">
              <details>
                <summary className="cursor-pointer text-3xl font-display font-extrabold" id="past-h">Past bookings</summary>
                <ul className="mt-3 grid max-w-3xl gap-3">{past.map((b) => <Row key={b.id} b={b} />)}</ul>
              </details>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
