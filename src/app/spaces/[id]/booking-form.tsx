"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FitDiagram } from "@/components/fit-diagram";
import { IconBolt, IconLock } from "@/components/icons";
import { TimeRange } from "@/components/time-range";
import { describeSchedule, isAvailable } from "@/lib/availability";
import { checkFit, VEHICLE_KINDS, VEHICLE_PRESETS, type VehicleKind } from "@/lib/fit";
import { formatINR } from "@/lib/money";
import { billedHours, computePrice } from "@/lib/pricing";
import { parseIstInput } from "@/lib/time";
import type { VehicleRow } from "@/lib/services/vehicles";
import { bookAction } from "./actions";

interface Props {
  spaceId: string;
  signedIn: boolean;
  vehicles: VehicleRow[];
  /** `id:<uuid>` or `kind:<kind>`, from the search. */
  defaultVehicle: string;
  bay: { max_length_cm: number; max_width_cm: number; max_height_cm: number };
  priceHourPaise: number;
  priceDayPaise: number | null;
  instant: boolean;
  schedule: { days_mask: number; open_minute: number; close_minute: number };
  defaultStart: string;
  defaultEnd: string;
}

const presetOf = (k: string) => VEHICLE_PRESETS[(VEHICLE_KINDS as readonly string[]).includes(k) ? (k as VehicleKind) : "hatchback"];

export function BookingForm(p: Props) {
  const [state, action, pending] = useActionState(bookAction, {});
  const initialSel = p.defaultVehicle.startsWith("id:") && p.vehicles.some((v) => `id:${v.id}` === p.defaultVehicle)
    ? p.defaultVehicle
    : p.defaultVehicle.startsWith("kind:") ? `new:${p.defaultVehicle.slice(5)}` : p.vehicles[0] ? `id:${p.vehicles[0].id}` : "new:hatchback";
  const [sel, setSel] = useState(initialSel);
  const [times, setTimes] = useState({ start: p.defaultStart, end: p.defaultEnd });
  const seed = presetOf(sel.startsWith("new:") ? sel.slice(4) : "hatchback");
  const [nv, setNv] = useState({ label: seed.label, length: String(seed.dims.length_cm), width: String(seed.dims.width_cm), height: String(seed.dims.height_cm), plate: "" });

  function choose(v: string) {
    setSel(v);
    if (v.startsWith("new:")) {
      const pr = presetOf(v.slice(4));
      setNv((o) => ({ ...o, label: pr.label, length: String(pr.dims.length_cm), width: String(pr.dims.width_cm), height: String(pr.dims.height_cm) }));
    }
  }

  const saved = sel.startsWith("id:") ? p.vehicles.find((v) => `id:${v.id}` === sel) : undefined;
  const dims = saved
    ? { length_cm: saved.length_cm, width_cm: saved.width_cm, height_cm: saved.height_cm }
    : { length_cm: Number(nv.length) || 0, width_cm: Number(nv.width) || 0, height_cm: Number(nv.height) || 0 };
  const vehicleLabel = saved ? saved.label : nv.label || "Your vehicle";
  const fit = dims.length_cm && dims.width_cm && dims.height_cm ? checkFit(dims, p.bay) : null;

  const start = parseIstInput(times.start);
  const end = parseIstInput(times.end);
  const validTimes = Boolean(start && end && end.getTime() - start.getTime() >= 3_600_000);
  const open = start && end ? isAvailable(p.schedule, start, end) : true;
  const total = start && end && validTimes ? computePrice({ priceHourPaise: p.priceHourPaise, priceDayPaise: p.priceDayPaise, start, end }) : null;
  const hours = start && end && validTimes ? billedHours(start, end) : 0;

  const blocker = !validTimes
    ? "Stays are at least 1 hour."
    : !open
      ? `Closed for part of that time. ${describeSchedule(p.schedule)}.`
      : fit && !fit.fits
        ? `${vehicleLabel} won't fit: ${fit.reasons.join(", ")}.`
        : null;

  return (
    <form action={action} className="grid gap-4" aria-label="Book this space">
      <input type="hidden" name="space_id" value={p.spaceId} />
      <TimeRange defaultStart={p.defaultStart} defaultEnd={p.defaultEnd} onChange={(s, e) => setTimes((t) => (t.start === s && t.end === e ? t : { start: s, end: e }))} />

      <div>
        <label className="label" htmlFor="bf-vehicle">Your vehicle</label>
        <select id="bf-vehicle" name="vehicle" className="field" value={sel} onChange={(e) => choose(e.target.value)}>
          {p.vehicles.length > 0 && (
            <optgroup label="Saved vehicles">
              {p.vehicles.map((v) => <option key={v.id} value={`id:${v.id}`}>{v.label}</option>)}
            </optgroup>
          )}
          <optgroup label="Add a vehicle">
            {VEHICLE_KINDS.map((k) => <option key={k} value={`new:${k}`}>{VEHICLE_PRESETS[k].label}</option>)}
          </optgroup>
        </select>
      </div>

      {sel.startsWith("new:") && (
        <details className="rounded-xl border border-cocoa-600 px-3.5 py-2.5">
          <summary className="cursor-pointer text-[0.95rem] font-semibold text-beige">
            {vehicleLabel}, {dims.length_cm} × {dims.width_cm} × {dims.height_cm} cm. Edit size, name or plate
          </summary>
          <div className="mt-3 grid gap-3">
            <div>
              <label className="label" htmlFor="nv-label">Name</label>
              <input id="nv-label" name="nv_label" className="field" maxLength={40} value={nv.label} onChange={(e) => setNv({ ...nv, label: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([["length", "Length"], ["width", "Width"], ["height", "Height"]] as const).map(([k, l]) => (
                <div key={k}>
                  <label className="label" htmlFor={`nv-${k}`}>{l} (cm)</label>
                  <input id={`nv-${k}`} name={`nv_${k}_cm`} className="field px-2.5" inputMode="numeric" value={nv[k]} onChange={(e) => setNv({ ...nv, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                </div>
              ))}
            </div>
            <p className="hint -mt-1">We filled in typical sizes. Adjust them if yours is bigger, with a roof rack, say.</p>
            <div>
              <label className="label" htmlFor="nv-plate">Number plate <span className="font-normal text-stone">(optional)</span></label>
              <input id="nv-plate" name="nv_plate" className="field uppercase" maxLength={14} autoCapitalize="characters" autoComplete="off" value={nv.plate} onChange={(e) => setNv({ ...nv, plate: e.target.value })} />
              <p className="hint">Shown to the host only after they confirm you, so they can spot your car.</p>
            </div>
          </div>
        </details>
      )}

      <div className="rounded-xl bg-cocoa-950 p-3">
        <FitDiagram compact bay={p.bay} vehicle={fit ? { ...dims, label: vehicleLabel } : null} />
      </div>

      <div className="rounded-xl border border-cocoa-600 p-4" aria-live="polite">
        {total !== null ? (
          <>
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-stone">{hours} {hours === 1 ? "hour" : "hours"}{p.priceDayPaise && hours >= 24 ? ", day rate applied" : ` at ${formatINR(p.priceHourPaise)}`}</span>
              <span className="font-display text-4xl font-extrabold leading-none">{formatINR(total)}</span>
            </p>
            <p className="mt-2 flex gap-2 text-sm text-stone"><IconLock width={16} height={16} className="mt-0.5 flex-none" />You pay the host at the space, in cash or UPI. Nothing is charged here.</p>
          </>
        ) : (
          <p className="text-stone">Pick arrival and leave times to see the price.</p>
        )}
      </div>

      {blocker && <p className="err" role="alert">{blocker}</p>}
      {state.error && <p className="err" role="alert">{state.error}</p>}

      {!p.signedIn && <p className="text-sm text-stone">You&apos;ll sign in with your mobile number first, then come straight back here.</p>}
      <button className="btn btn-primary btn-block text-lg" disabled={pending || Boolean(blocker)}>
        {pending ? "One moment…" : !p.signedIn ? "Sign in to book" : p.instant ? (<><IconBolt width={18} height={18} />Book now</>) : "Send request"}
      </button>
      <p className="text-center text-sm text-stone">
        {p.instant ? "This host confirms instantly." : "The host has 24 hours to reply. You won't be charged either way."}
      </p>
      <p className="text-center text-xs text-stone">
        By booking you agree to the <Link href="/safety" className="link">house rules</Link>.
      </p>
    </form>
  );
}
