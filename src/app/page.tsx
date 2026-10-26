import Link from "next/link";
import { FitDiagram } from "@/components/fit-diagram";
import { IconArrowRight, IconLock, IconPin, IconShield, IconStar, IconTrips } from "@/components/icons";
import { SearchForm, type SavedVehicle } from "@/components/search-form";
import { BAY_PRESETS, VEHICLE_PRESETS } from "@/lib/fit";
import { getCurrentUser } from "@/lib/session";
import { listVehicles } from "@/lib/services/vehicles";
import { defaultStay } from "@/lib/time";

export default async function Home() {
  let vehicles: SavedVehicle[] = [];
  try {
    const user = await getCurrentUser();
    if (user) vehicles = await listVehicles(user.id);
  } catch {
    /* browsing works without a database; saved vehicles just won't appear */
  }
  const stay = defaultStay();
  const bay = BAY_PRESETS.find((b) => b.id === "sedan")!.dims;

  return (
    <>
      <section className="bays relative overflow-hidden border-b border-cocoa-700">
        <div className="shell grid items-center gap-10 py-10 md:grid-cols-[1.15fr_1fr] md:py-16 lg:gap-16">
          <div>
            <h1>Someone nearby has a bay sitting empty.</h1>
            <p className="mt-5 text-lg text-cream/90 measure">
              Book a spare parking spot in an apartment block, mall or office before you leave. Or earn from the one you aren&apos;t using.
            </p>
            <div className="panel-sunken mt-8 max-w-xl border border-cocoa-700">
              <SearchForm vehicles={vehicles} defaults={{ start: stay.start, end: stay.end }} />
            </div>
          </div>
          <div className="hidden md:block" aria-hidden="false">
            <div className="mx-auto max-w-[19rem] overflow-hidden rounded-2xl bg-cocoa-800 p-5">
              <FitDiagram
                animate
                bay={{ max_length_cm: bay.length_cm, max_width_cm: bay.width_cm, max_height_cm: bay.height_cm }}
                vehicle={{ ...VEHICLE_PRESETS.hatchback.dims, label: "A hatchback" }}
              />
            </div>
            <p className="mx-auto mt-3 max-w-[19rem] text-sm text-stone">
              Every space is drawn to scale against your vehicle, so you know it fits before you go.
            </p>
          </div>
        </div>
      </section>

      <section className="shell py-14 md:py-20">
        <h2 className="max-w-[18ch]">Park first, pay at the space</h2>
        <div className="mt-8 grid gap-0 md:grid-cols-3 md:gap-8">
          {[
            {
              icon: <IconPin />,
              title: "Tell us where and what you drive",
              body: "Search near wherever you're headed. We only show spaces your vehicle fits, with the spare centimetres spelled out.",
            },
            {
              icon: <IconTrips />,
              title: "Book the time you need",
              body: "Some hosts confirm instantly, others approve each request. Either way you get a 4-digit arrival code.",
            },
            {
              icon: <IconLock />,
              title: "Show your code, pay the host",
              body: "Cash or UPI straight to the host when you arrive. Nothing is charged in the app, and the exact address unlocks once you're confirmed.",
            },
          ].map((s) => (
            <div key={s.title} className="border-t-2 border-dashed border-cocoa-600 py-6 md:py-7">
              <span className="text-beige">{s.icon}</span>
              <h3 className="mt-3">{s.title}</h3>
              <p className="mt-2 text-stone">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-cocoa-700 bg-cocoa-950/50">
        <div className="shell grid gap-8 py-14 md:grid-cols-[1.2fr_1fr] md:items-center md:py-20">
          <div>
            <h2 className="max-w-[20ch]">Your bay is empty all day. Let it earn.</h2>
            <p className="mt-4 text-cream/90 measure">
              Apartment visitor spots, a mall bay you don&apos;t use, an office slot on weekends. Pin it on the map, set the size, hours and price, then choose whether drivers book instantly or need your approval. No bank details needed to start; drivers pay you at the space.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/host/new" className="btn btn-primary">
                List a space <IconArrowRight width={18} height={18} />
              </Link>
              <Link href="/safety" className="btn btn-ghost">How payments and safety work</Link>
            </div>
          </div>
          <ul className="grid gap-3 text-[0.98rem]">
            <li className="flex gap-3"><IconShield className="mt-0.5 flex-none text-beige" /><span>Your exact address stays hidden until you confirm a booking.</span></li>
            <li className="flex gap-3"><IconLock className="mt-0.5 flex-none text-beige" /><span>You see each driver&apos;s vehicle size and track record before you approve.</span></li>
            <li className="flex gap-3"><IconStar className="mt-0.5 flex-none text-beige" /><span>Reviews only come from people who actually parked, confirmed by the arrival code.</span></li>
          </ul>
        </div>
      </section>

      <section className="shell py-14 md:py-20">
        <h2 className="max-w-[16ch]">Built to be fair to both sides</h2>
        <dl className="mt-8 grid gap-x-12 md:grid-cols-2">
          {[
            ["The arrival code", "Hosts check drivers in with the code on their booking. It proves they turned up, and it's what unlocks reviews."],
            ["Approximate until booked", "Before you're confirmed, a space shows as a rough area, so a host's home isn't pinpointed for everyone who browses."],
            ["No-shows and late cancels count", "Repeat no-shows lose instant booking. Hosts who cancel confirmed bookings get it on their record."],
            ["Reports are reviewed", "Report a space or a person from any booking. Several independent reports pause a listing until it's checked."],
          ].map(([t, d]) => (
            <div key={t} className="border-t border-cocoa-700 py-5">
              <dt className="font-display text-2xl font-extrabold">{t}</dt>
              <dd className="mt-1.5 text-stone">{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
