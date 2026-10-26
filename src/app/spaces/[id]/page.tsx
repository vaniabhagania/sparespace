import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FitDiagram } from "@/components/fit-diagram";
import { IconAlert, IconBolt, IconPin, IconShield } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { SetupNeeded } from "@/components/setup-needed";
import { Notice, Stars } from "@/components/status";
import { describeSchedule } from "@/lib/availability";
import { isDbConfigured } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { first, resolveWindow, type RawParams } from "@/lib/search-params";
import { displayName, getCurrentUser } from "@/lib/session";
import { listSpaceReviews } from "@/lib/services/reviews";
import { getSpaceView } from "@/lib/services/spaces";
import { AMENITIES, SPACE_KIND_LABELS } from "@/lib/services/types";
import { listVehicles } from "@/lib/services/vehicles";
import { formatDate } from "@/lib/time";
import { resolveVehicleParam } from "@/lib/vehicle-param";
import { messageHostAction } from "./actions";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Parking space" };

const m = (cm: number) => `${(cm / 100).toFixed(2).replace(/\.?0+$/, "")} m`;

export default async function SpacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawParams> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const user = await getCurrentUser();
  const space = await getSpaceView(id, user?.id ?? null);
  if (!space) notFound();

  const isHost = user?.id === space.host_id;
  const saved = user ? await listVehicles(user.id) : [];
  const chosen = resolveVehicleParam(first(sp.v), saved);
  const win = resolveWindow(first(sp.start), first(sp.end));
  const reviews = await listSpaceReviews(space.id, 12);
  const hostName = space.host_deleted ? "Former member" : space.host_name || `Guest ${space.host_id.slice(0, 4)}`;
  const bay = { max_length_cm: space.max_length_cm, max_width_cm: space.max_width_cm, max_height_cm: space.max_height_cm };
  const bookable = space.status === "active" && !isHost;

  return (
    <div className="shell py-6 md:py-10">
      {first(sp.reported) && <div className="mb-5"><Notice tone="ok">Thanks. We&apos;ve received your report and will look into it.</Notice></div>}
      {space.status === "suspended" && isHost && (
        <div className="mb-5"><Notice tone="error">This space is suspended while we look into a report, so nobody can see or book it. We&apos;ll be in touch through the app.</Notice></div>
      )}
      {space.status === "paused" && (
        <div className="mb-5"><Notice>{isHost ? "This space is paused, so drivers can't find or book it. Resume it from your host page." : "This space isn't taking bookings right now."}</Notice></div>
      )}

      <h1 className="text-[clamp(2.2rem,6vw,3.6rem)]">{space.title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-stone">
        <IconPin width={16} height={16} />
        <span>{space.area_label}</span>
        <span aria-hidden="true">·</span>
        <span>{SPACE_KIND_LABELS[space.kind]}</span>
        <span aria-hidden="true">·</span>
        <Stars value={space.rating_avg} count={space.rating_count} />
      </p>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="grid min-w-0 gap-9">
          <section aria-labelledby="size-h">
            <h2 id="size-h" className="text-3xl">Size and fit</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div className="rounded-xl bg-cocoa-800 p-4">
                <FitDiagram bay={bay} vehicle={{ ...chosen.dims, label: chosen.label }} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.97rem]">
                <div><dt className="text-stone">Longest</dt><dd className="font-semibold">{m(space.max_length_cm)}</dd></div>
                <div><dt className="text-stone">Widest</dt><dd className="font-semibold">{m(space.max_width_cm)}</dd></div>
                <div><dt className="text-stone">Height limit</dt><dd className="font-semibold">{m(space.max_height_cm)}</dd></div>
                <div><dt className="text-stone">Bays</dt><dd className="font-semibold">{space.capacity}</dd></div>
              </dl>
            </div>
          </section>

          <section aria-labelledby="when-h">
            <h2 id="when-h" className="text-3xl">Hours and price</h2>
            <dl className="mt-3 grid gap-3 text-[0.97rem] sm:grid-cols-3">
              <div><dt className="text-stone">Open</dt><dd className="font-semibold">{describeSchedule(space)}</dd></div>
              <div><dt className="text-stone">Per hour</dt><dd className="font-semibold">{formatINR(space.price_hour_paise)}</dd></div>
              <div><dt className="text-stone">Per day</dt><dd className="font-semibold">{space.price_day_paise ? formatINR(space.price_day_paise) : "Hourly only"}</dd></div>
            </dl>
            <p className="mt-3 text-sm text-stone">Billed per started hour. If you stay past your time by more than 15 minutes, the host can charge 1.5× the hourly rate for the extra time.</p>
            {space.amenities.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Features">
                {space.amenities.map((a) => <li key={a} className="chip">{AMENITIES.find((x) => x.id === a)?.label ?? a}</li>)}
              </ul>
            )}
          </section>

          {space.description && (
            <section aria-labelledby="about-h">
              <h2 id="about-h" className="text-3xl">About this space</h2>
              <p className="mt-3 whitespace-pre-line measure">{space.description}</p>
            </section>
          )}

          <section aria-labelledby="where-h">
            <h2 id="where-h" className="text-3xl">Where it is</h2>
            <div className="mt-4">
              <MapView
                height="18rem"
                label={space.exact ? "Map showing the exact location" : "Map showing the approximate area"}
                center={space.point}
                zoom={space.exact ? 17 : 15}
                approxRadius={space.exact ? undefined : 180}
                points={space.exact ? [{ id: space.id, lat: space.point.lat, lng: space.point.lng, text: "Here", name: space.title }] : []}
              />
            </div>
            {space.exact ? (
              <div className="panel mt-4">
                <p className="font-semibold">{space.address_line}</p>
                {space.access_notes ? <p className="mt-2 text-stone"><span className="font-semibold text-cream">How to get in: </span>{space.access_notes}</p> : null}
              </div>
            ) : (
              <p className="mt-3 flex gap-2 text-sm text-stone">
                <IconShield width={18} height={18} className="mt-0.5 flex-none" />
                The map shows the area, not the doorstep. The exact address and entry details unlock once your booking is confirmed, to keep hosts&apos; homes private.
              </p>
            )}
          </section>

          <section aria-labelledby="host-h">
            <h2 id="host-h" className="text-3xl">Your host</h2>
            <div className="panel mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">{hostName}</p>
                <p className="text-sm text-stone">
                  Joined {formatDate(space.host_joined)} <span aria-hidden="true">·</span> {space.completed_count} completed {space.completed_count === 1 ? "stay" : "stays"}
                  {space.host_cancel_count > 0 && <> <span aria-hidden="true">·</span> cancelled {space.host_cancel_count} confirmed {space.host_cancel_count === 1 ? "booking" : "bookings"}</>}
                </p>
              </div>
              {!isHost && (
                user ? (
                  <ActionForm action={messageHostAction}>
                    <input type="hidden" name="space_id" value={space.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingText="Opening…">Message host</SubmitButton>
                  </ActionForm>
                ) : (
                  <Link href={`/login?next=/spaces/${space.id}`} className="btn btn-ghost btn-sm">Sign in to message</Link>
                )
              )}
            </div>
          </section>

          <section aria-labelledby="rev-h">
            <h2 id="rev-h" className="text-3xl">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-stone">No reviews yet. Only drivers who actually parked here can leave one.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {reviews.map((r) => (
                  <li key={r.id} className="panel">
                    <div className="flex items-center justify-between gap-3">
                      <Stars value={r.rating} count={1} />
                      <span className="text-sm text-stone">{displayName({ id: r.reviewer_id, nickname: r.reviewer_name, deleted_at: r.reviewer_deleted ? new Date() : null })}</span>
                    </div>
                    {r.comment && <p className="mt-2">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!isHost && (
            <p className="text-sm text-stone">
              <IconAlert width={16} height={16} className="mr-1.5 inline align-[-3px]" />
              Something wrong with this listing?{" "}
              <Link className="link" href={user ? `/spaces/${space.id}/report` : `/login?next=/spaces/${space.id}/report`}>Report it</Link>
            </p>
          )}
        </div>

        <aside aria-label="Booking" className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
          <div className="panel">
            {isHost ? (
              <>
                <h2 className="text-3xl">This is your space</h2>
                <p className="mt-2 text-stone">This is what drivers see. You can&apos;t book your own space.</p>
                <Link href={`/host/${space.id}/edit`} className="btn btn-primary btn-block mt-4">Edit listing</Link>
              </>
            ) : bookable ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-4xl font-extrabold leading-none">{formatINR(space.price_hour_paise)}</span>
                  <span className="text-stone">per hour</span>
                  {space.instant_book && <span className="chip chip-beige ml-auto"><IconBolt width={13} height={13} />Instant</span>}
                </p>
                <div className="mt-4">
                  <BookingForm
                    spaceId={space.id}
                    signedIn={Boolean(user)}
                    vehicles={saved}
                    defaultVehicle={chosen.value}
                    bay={bay}
                    priceHourPaise={space.price_hour_paise}
                    priceDayPaise={space.price_day_paise}
                    instant={space.instant_book}
                    schedule={{ days_mask: space.days_mask, open_minute: space.open_minute, close_minute: space.close_minute }}
                    defaultStart={win.startInput}
                    defaultEnd={win.endInput}
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-3xl">Not bookable right now</h2>
                <p className="mt-2 text-stone">The host has paused this space. Try another nearby.</p>
                <Link href="/" className="btn btn-primary btn-block mt-4">Find another space</Link>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
