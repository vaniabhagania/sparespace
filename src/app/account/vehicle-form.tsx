"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { VEHICLE_KINDS, VEHICLE_PRESETS, type VehicleKind } from "@/lib/fit";
import { addVehicleAction } from "./actions";

export function VehicleForm() {
  const [kind, setKind] = useState<VehicleKind>("hatchback");
  const [label, setLabel] = useState(VEHICLE_PRESETS.hatchback.label);
  const [dims, setDims] = useState({ length_cm: "395", width_cm: "175", height_cm: "155" });

  function pick(k: VehicleKind) {
    const p = VEHICLE_PRESETS[k];
    setKind(k);
    setLabel(p.label);
    setDims({ length_cm: String(p.dims.length_cm), width_cm: String(p.dims.width_cm), height_cm: String(p.dims.height_cm) });
  }

  return (
    <ActionForm action={addVehicleAction} className="grid gap-3" ariaLabel="Add a vehicle">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="av-kind">Type</label>
          <select id="av-kind" name="kind" className="field" value={kind} onChange={(e) => pick(e.target.value as VehicleKind)}>
            {VEHICLE_KINDS.map((k) => <option key={k} value={k}>{VEHICLE_PRESETS[k].label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="av-label">Name</label>
          <input id="av-label" name="label" className="field" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([["length_cm", "Length"], ["width_cm", "Width"], ["height_cm", "Height"]] as const).map(([k, l]) => (
          <div key={k}>
            <label className="label" htmlFor={`av-${k}`}>{l} (cm)</label>
            <input id={`av-${k}`} name={k} className="field" inputMode="numeric" value={dims[k]} required
              onChange={(e) => setDims({ ...dims, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </div>
        ))}
      </div>
      <p className="hint -mt-1">Sizes are typical for that type. Change them if yours is bigger, like with a roof box.</p>
      <div className="sm:max-w-xs">
        <label className="label" htmlFor="av-plate">Number plate <span className="font-normal text-stone">(optional)</span></label>
        <input id="av-plate" name="plate" className="field uppercase" maxLength={14} autoCapitalize="characters" autoComplete="off" />
      </div>
      <div><SubmitButton className="btn btn-ghost" pendingText="Saving…">Save vehicle</SubmitButton></div>
    </ActionForm>
  );
}
