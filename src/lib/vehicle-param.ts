import { VEHICLE_KINDS, VEHICLE_PRESETS, type Dims, type VehicleKind } from "./fit";
import { isUuid } from "./ids";
import type { VehicleRow } from "./services/vehicles";

export interface ChosenVehicle {
  /** The value to put back in a URL or select: `id:<uuid>` or `kind:<kind>`. */
  value: string;
  label: string;
  dims: Dims;
}

/**
 * Works out which vehicle a search or booking page is about from `?v=`.
 * Falls back to the person's first saved vehicle, then to a typical hatchback.
 */
export function resolveVehicleParam(v: string | undefined, saved: VehicleRow[]): ChosenVehicle {
  if (v?.startsWith("id:")) {
    const id = v.slice(3);
    const found = isUuid(id) ? saved.find((s) => s.id === id) : undefined;
    if (found) return { value: v, label: found.label, dims: { length_cm: found.length_cm, width_cm: found.width_cm, height_cm: found.height_cm } };
  }
  if (v?.startsWith("kind:")) {
    const k = v.slice(5);
    if ((VEHICLE_KINDS as readonly string[]).includes(k)) {
      const p = VEHICLE_PRESETS[k as VehicleKind];
      return { value: v, label: p.label, dims: p.dims };
    }
  }
  if (saved[0]) {
    const s = saved[0];
    return { value: `id:${s.id}`, label: s.label, dims: { length_cm: s.length_cm, width_cm: s.width_cm, height_cm: s.height_cm } };
  }
  const p = VEHICLE_PRESETS.hatchback;
  return { value: "kind:hatchback", label: p.label, dims: p.dims };
}
