export const VEHICLE_KINDS = ["bike", "hatchback", "sedan", "suv", "van", "truck"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export interface Dims {
  length_cm: number;
  width_cm: number;
  height_cm: number;
}

/** Typical outside dimensions, used to pre-fill forms so nobody needs a tape measure. */
export const VEHICLE_PRESETS: Record<VehicleKind, { label: string; dims: Dims }> = {
  bike: { label: "Bike or scooter", dims: { length_cm: 200, width_cm: 80, height_cm: 120 } },
  hatchback: { label: "Hatchback", dims: { length_cm: 395, width_cm: 175, height_cm: 155 } },
  sedan: { label: "Sedan", dims: { length_cm: 450, width_cm: 180, height_cm: 145 } },
  suv: { label: "SUV", dims: { length_cm: 480, width_cm: 190, height_cm: 180 } },
  van: { label: "Van or MUV", dims: { length_cm: 520, width_cm: 200, height_cm: 210 } },
  truck: { label: "Pickup or small truck", dims: { length_cm: 700, width_cm: 220, height_cm: 260 } },
};

export const VEHICLE_KIND_LABELS: Record<string, string> = Object.fromEntries(
  VEHICLE_KINDS.map((k) => [k, VEHICLE_PRESETS[k].label]),
);

/** Bay sizes offered to hosts: the biggest vehicle that should fit, with room to open doors. */
export const BAY_PRESETS: { id: string; label: string; dims: Dims }[] = [
  { id: "bike", label: "Bikes and scooters", dims: { length_cm: 230, width_cm: 110, height_cm: 160 } },
  { id: "hatchback", label: "Up to a hatchback", dims: { length_cm: 440, width_cm: 215, height_cm: 200 } },
  { id: "sedan", label: "Up to a sedan", dims: { length_cm: 470, width_cm: 225, height_cm: 200 } },
  { id: "suv", label: "Up to an SUV", dims: { length_cm: 500, width_cm: 235, height_cm: 220 } },
  { id: "van", label: "Up to a van", dims: { length_cm: 580, width_cm: 245, height_cm: 250 } },
];

export interface FitResult {
  fits: boolean;
  reasons: string[];
  /** Spare room in cm on each axis (negative means it does not fit). */
  clearance: Dims;
}

export function checkFit(vehicle: Dims, bay: { max_length_cm: number; max_width_cm: number; max_height_cm: number }): FitResult {
  const clearance: Dims = {
    length_cm: bay.max_length_cm - vehicle.length_cm,
    width_cm: bay.max_width_cm - vehicle.width_cm,
    height_cm: bay.max_height_cm - vehicle.height_cm,
  };
  const reasons: string[] = [];
  if (clearance.length_cm < 0) reasons.push(`${-clearance.length_cm} cm too long`);
  if (clearance.width_cm < 0) reasons.push(`${-clearance.width_cm} cm too wide`);
  if (clearance.height_cm < 0) reasons.push(`${-clearance.height_cm} cm too tall`);
  return { fits: reasons.length === 0, reasons, clearance };
}
