"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FitDiagram } from "@/components/fit-diagram";
import { MapView } from "@/components/map-view";
import { PlaceInput } from "@/components/place-input";
import { DAY_NAMES } from "@/lib/availability";
import { BAY_PRESETS, checkFit, VEHICLE_PRESETS, type VehicleKind } from "@/lib/fit";
import { formatMinuteOfDay } from "@/lib/time";
import { AMENITIES, SPACE_KINDS } from "@/lib/services/types";
import { createSpaceAction, updateSpaceAction } from "./actions";

export interface SpaceFormInitial {
  id?: string;
  title: string;
  description: string;
  kind: string;
  area_label: string;
  address_line: string;
  lat: number | null;
  lng: number | null;
  max_length_cm: number;
  max_width_cm: number;
  max_height_cm: number;
  capacity: number;
  price_hour: string;
  price_day: string;
  instant_book: boolean;
  days: number[];
  open_minute: number;
  close_minute: number;
  access_notes: string;
  amenities: string[];
}

export const EMPTY_SPACE: SpaceFormInitial = {
  title: "", description: "", kind: "apartment", area_label: "", address_line: "", lat: null, lng: null,
  max_length_cm: BAY_PRESETS[2].dims.length_cm, max_width_cm: BAY_PRESETS[2].dims.width_cm, max_height_cm: BAY_PRESETS[2].dims.height_cm,
  capacity: 1, price_hour: "", price_day: "", instant_book: true, days: [0, 1, 2, 3, 4, 5, 6],
  open_minute: 0, close_minute: 1440, access_notes: "", amenities: [],
};

const HOURS_PRESETS = [
  { label: "All day, every day", open: 0, close: 1440, days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Weekdays, office hours", open: 540, close: 1080, days: [0, 1, 2, 3, 4] },
  { label: "Nights and early mornings", open: 1200, close: 480, days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Weekends", open: 480, close: 1200, days: [5, 6] },
];

function timeOptions(from: number, to: number, extra: number) {
  const set = new Set<number>(extra % 30 === 0 ? [] : [extra]);
  for (let m = from; m <= to; m += 30) set.add(m);
  return [...set].sort((a, b) => a - b);
}
const label = (m: number) => (m === 1440 ? "12 am (midnight)" : formatMinuteOfDay(m));

export function SpaceForm({ initial, locked = false }: { initial: SpaceFormInitial; locked?: boolean }) {
  const editing = Boolean(initial.id);
  const [pt, setPt] = useState<{ lat: number | null; lng: number | null }>({ lat: initial.lat, lng: initial.lng });
  const [bay, setBay] = useState({ l: String(initial.max_length_cm), w: String(initial.max_width_cm), h: String(initial.max_height_cm) });
  const [days, setDays] = useState<number[]>(initial.days);
  const [open, setOpen] = useState(initial.open_minute);
  const [close, setClose] = useState(initial.close_minute);

  const bayDims = { max_length_cm: Number(bay.l) || 0, max_width_cm: Number(bay.w) || 0, max_height_cm: Number(bay.h) || 0 };
  const bayOk = bayDims.max_length_cm >= 100 && bayDims.max_width_cm >= 40 && bayDims.max_height_cm >= 50;
  const biggest = bayOk
    ? (["van", "suv", "sedan", "hatchback", "bike"] as VehicleKind[]).find((k) => checkFit(VEHICLE_PRESETS[k].dims, bayDims).fits)
    : undefined;
  const activePreset = BAY_PRESETS.find((p) => p.dims.length_cm === bayDims.max_length_cm && p.dims.width_cm === bayDims.max_width_cm && p.dims.height_cm === bayDims.max_height_cm);

  function toggleDay(d: number) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }

  return (
    <ActionForm action={editing ? updateSpaceAction : createSpaceAction} className="grid gap-9" ariaLabel={editing ? "Edit your space" : "List a space"}>
      {editing && <input type="hidden" name="space_id" value={initial.id} />}
      <input type="hidden" name="lat" value={pt.lat ?? ""} />
      <input type="hidden" name="lng" value={pt.lng ?? ""} />
      <input type="hidden" name="open_minute" value={open} />
      <input type="hidden" name="close_minute" value={close} />

      <section className="grid gap-4" aria-labelledby="f-basics">
        <h2 id="f-basics" className="text-3xl">What is it?</h2>
        <div>
          <label className="label" htmlFor="f-title">Title</label>
          <input id="f-title" name="title" className="field" defaultValue={initial.title} maxLength={80} required placeholder="Covered bay near Indiranagar metro" />
        </div>
        <div>
          <label className="label" htmlFor="f-kind">Type of space</label>
          <select id="f-kind" name="kind" className="field" defaultValue={initial.kind}>
            {SPACE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-desc">Description <span className="font-normal text-stone">(optional)</span></label>
          <textarea id="f-desc" name="description" className="field" defaultValue={initial.description} maxLength={800} placeholder="Anything a driver should know: which level, how to find you, who it suits." />
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="f-where">
        <h2 id="f-where" className="text-3xl">Where is it?</h2>
        <PlaceInput label="Find it on the map" required={false} emitHidden={false} placeholder="Search your building, mall or street" onPlace={(p) => setPt({ lat: p.lat, lng: p.lng })} />
        <div>
          <MapView
            height="18rem"
            label="Map. Click or drag the pin to the exact spot."
            center={{ lat: pt.lat ?? 20.59, lng: pt.lng ?? 78.96 }}
            zoom={pt.lat === null ? 5 : 17}
            pick={{ lat: pt.lat, lng: pt.lng, onPick: (lat, lng) => setPt({ lat, lng }) }}
          />
          <p className="hint">{pt.lat === null ? "Search above, or click the map to drop a pin." : "Drag the pin onto your space. Drivers only see the area until they're booked in."}</p>
        </div>
        <div>
          <label className="label" htmlFor="f-area">Area or landmark <span className="font-normal text-stone">(public)</span></label>
          <input id="f-area" name="area_label" className="field" defaultValue={initial.area_label} maxLength={80} required placeholder="Indiranagar, near the metro" />
        </div>
        <div>
          <label className="label" htmlFor="f-addr">Full address <span className="font-normal text-stone">(private)</span></label>
          <input id="f-addr" name="address_line" className="field" defaultValue={initial.address_line} maxLength={200} required placeholder="Block B, Green Park Apartments, 12th Main" autoComplete="street-address" />
          <p className="hint">Only confirmed drivers see this.</p>
        </div>
        <div>
          <label className="label" htmlFor="f-notes">How to get in <span className="font-normal text-stone">(private, optional)</span></label>
          <textarea id="f-notes" name="access_notes" className="field min-h-24" defaultValue={initial.access_notes} maxLength={400} placeholder="Gate 2, tell the guard you're a SpareSpace guest. Bay 14, level B1." />
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="f-size">
        <h2 id="f-size" className="text-3xl">How big is the bay?</h2>
        <p className="text-stone">Measure the clear space, not the painted lines. Pick the closest match, then adjust.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Bay size presets">
          {BAY_PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={activePreset?.id === p.id}
              onClick={() => setBay({ l: String(p.dims.length_cm), w: String(p.dims.width_cm), h: String(p.dims.height_cm) })}
              className={`chip min-h-10 cursor-pointer px-3.5 ${activePreset?.id === p.id ? "chip-beige" : "chip-outline hover:border-beige hover:text-beige"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([["l", "max_length_cm", "Length"], ["w", "max_width_cm", "Width"], ["h", "max_height_cm", "Height limit"]] as const).map(([k, name, l]) => (
            <div key={k}>
              <label className="label" htmlFor={`f-${k}`}>{l} (cm)</label>
              <input id={`f-${k}`} name={name} className="field" inputMode="numeric" value={bay[k]} required
                onChange={(e) => setBay({ ...bay, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-cocoa-800 p-3.5">
          <div className="flex-none rounded-lg bg-cocoa-950 p-2"><FitDiagram compact bay={bayDims} vehicle={null} /></div>
          <p aria-live="polite" className="text-[0.97rem]">
            {biggest ? <>Biggest vehicle that fits: <strong>{VEHICLE_PRESETS[biggest].label.toLowerCase()}</strong>. Anything larger won&apos;t see this space.</> : bayOk ? "Fits bikes and scooters only." : "Enter the size to see what fits."}
          </p>
        </div>
        <div className="max-w-40">
          <label className="label" htmlFor="f-cap">Number of bays</label>
          <input id="f-cap" name="capacity" type="number" min={1} max={20} className="field" defaultValue={initial.capacity} required />
          <p className="hint">Identical bays you rent out.</p>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="f-hours">
        <h2 id="f-hours" className="text-3xl">When can drivers use it?</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Hours presets">
          {HOURS_PRESETS.map((p) => {
            const on = p.open === open && p.close === close && p.days.join() === days.join();
            return (
              <button key={p.label} type="button" aria-pressed={on} onClick={() => { setOpen(p.open); setClose(p.close); setDays(p.days); }}
                className={`chip min-h-10 cursor-pointer px-3.5 ${on ? "chip-beige" : "chip-outline hover:border-beige hover:text-beige"}`}>{p.label}</button>
            );
          })}
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="label">Days</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((n, i) => (
              <label key={n} className="flex min-h-11 min-w-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-stone-dim px-3 has-[:checked]:border-beige has-[:checked]:bg-cocoa-700">
                <input type="checkbox" name="days" value={i} checked={days.includes(i)} onChange={() => toggleDay(i)} className="sr-only" />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label className="label" htmlFor="f-open">From</label>
            <select id="f-open" className="field" value={open} onChange={(e) => setOpen(Number(e.target.value))}>
              {timeOptions(0, 1410, open).map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-close">Until</label>
            <select id="f-close" className="field" value={close} onChange={(e) => setClose(Number(e.target.value))}>
              {timeOptions(30, 1440, close).map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </div>
        </div>
        {close <= open && close !== open && <p className="hint">That runs overnight: from {label(open)} until {label(close % 1440)} the next morning.</p>}
      </section>

      <section className="grid gap-4" aria-labelledby="f-price">
        <h2 id="f-price" className="text-3xl">What do you charge?</h2>
        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-lg">
          <div>
            <label className="label" htmlFor="f-ph">Per hour (₹)</label>
            <input id="f-ph" name="price_hour" className="field" inputMode="decimal" defaultValue={initial.price_hour} required placeholder="40" />
          </div>
          <div>
            <label className="label" htmlFor="f-pd">Per day (₹) <span className="font-normal text-stone">(optional)</span></label>
            <input id="f-pd" name="price_day" className="field" inputMode="decimal" defaultValue={initial.price_day} placeholder="300" />
          </div>
        </div>
        <p className="hint -mt-2">Drivers pay you directly, in cash or UPI. A day rate caps what long stays cost. Stays are billed per started hour; going over by more than 15 minutes is charged at 1.5× hourly.</p>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="label">New bookings</legend>
          <div className="grid gap-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg p-1.5 hover:bg-cocoa-700/50"><input type="radio" name="instant_book" value="yes" defaultChecked={initial.instant_book} className="mt-1" /><span><strong>Confirm instantly</strong><br /><span className="text-stone">Best if you&apos;re not always on your phone. Drivers with repeated no-shows still need your approval.</span></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg p-1.5 hover:bg-cocoa-700/50"><input type="radio" name="instant_book" value="no" defaultChecked={!initial.instant_book} className="mt-1" /><span><strong>I approve each request</strong><br /><span className="text-stone">You see the driver&apos;s record first. Requests lapse after 24 hours.</span></span></label>
          </div>
        </fieldset>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="label">Features</legend>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-stone-dim px-3 has-[:checked]:border-beige has-[:checked]:bg-cocoa-700">
                <input type="checkbox" name="amenities" value={a.id} defaultChecked={initial.amenities.includes(a.id)} />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="grid gap-4" aria-labelledby="f-rights">
        <h2 id="f-rights" className="text-3xl">One last thing</h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cocoa-600 p-4">
          <input type="checkbox" name="rights_confirmed" defaultChecked={editing} required className="mt-1" />
          <span>I own this space, or I have permission to let other people park here for payment. For a flat or society that means your association or landlord. For a mall or office, the management.</span>
        </label>
        {locked && (
          <p className="text-sm text-stone">This space has upcoming bookings, so its location, size, hours and number of bays are locked. You can still change the price, description, access notes and features.</p>
        )}
        <div>
          <SubmitButton className="btn btn-primary text-lg" pendingText="Saving…">{editing ? "Save changes" : "List my space"}</SubmitButton>
        </div>
      </section>
    </ActionForm>
  );
}
