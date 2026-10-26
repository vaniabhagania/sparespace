import { z } from "zod";
import { maskFromDays } from "./availability";
import { inIndia } from "./geo";
import { rupeesToPaise } from "./money";
import type { SpaceInput } from "./services/spaces";
import { AMENITIES, SPACE_KINDS } from "./services/types";

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

const kindIds = SPACE_KINDS.map((k) => k.id) as [string, ...string[]];
const amenityIds = new Set<string>(AMENITIES.map((a) => a.id));

const int = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min, `${label} needs at least ${min} characters.`).max(max, `${label} can be at most ${max} characters.`));

const spaceSchema = z.object({
  title: text("The title", 4, 80),
  description: text("The description", 0, 800),
  kind: z.enum(kindIds, { error: "Choose what kind of space this is." }),
  area_label: text("The area or landmark", 2, 80),
  address_line: text("The address", 5, 200),
  lat: z.coerce.number({ error: "Pin the space on the map." }).min(-90).max(90),
  lng: z.coerce.number({ error: "Pin the space on the map." }).min(-180).max(180),
  max_length_cm: int("Length", 100, 1500),
  max_width_cm: int("Width", 40, 300),
  max_height_cm: int("Height", 50, 450),
  capacity: int("Number of bays", 1, 20),
  open_minute: int("Opening time", 0, 1425),
  close_minute: int("Closing time", 15, 1440),
  access_notes: text("The access notes", 0, 400),
});

export function parseSpaceForm(fd: FormData): Parsed<SpaceInput> {
  const raw = Object.fromEntries(
    ["title", "description", "kind", "area_label", "address_line", "lat", "lng", "max_length_cm", "max_width_cm", "max_height_cm", "capacity", "open_minute", "close_minute", "access_notes"].map((k) => [k, String(fd.get(k) ?? "")]),
  );
  const base = spaceSchema.safeParse(raw);
  if (!base.success) return { ok: false, error: base.error.issues[0].message };
  const d = base.data;

  if (!raw.lat || !raw.lng) return { ok: false, error: "Pin the space on the map." };
  if (!inIndia(d.lat, d.lng)) return { ok: false, error: "SpareSpace is only in India for now. Pin a location in India." };
  if (d.open_minute % 15 !== 0 || d.close_minute % 15 !== 0) return { ok: false, error: "Opening hours must be on the quarter hour." };
  if (d.open_minute === d.close_minute) return { ok: false, error: "Opening and closing time can't be the same." };

  const hour = rupeesToPaise(String(fd.get("price_hour") ?? ""));
  if (hour === null || hour < 1000 || hour > 200_000) return { ok: false, error: "Set an hourly price between ₹10 and ₹2,000." };
  const dayRaw = String(fd.get("price_day") ?? "").trim();
  let day: number | null = null;
  if (dayRaw) {
    day = rupeesToPaise(dayRaw);
    if (day === null || day < 1000 || day > 2_000_000) return { ok: false, error: "Set a daily price between ₹10 and ₹20,000, or leave it empty." };
    if (day < hour) return { ok: false, error: "The daily price can't be lower than the hourly price." };
  }

  const days = fd.getAll("days").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (!days.length) return { ok: false, error: "Choose at least one day the space is available." };

  const amenities = [...new Set(fd.getAll("amenities").map(String).filter((a) => amenityIds.has(a)))];
  if (fd.get("rights_confirmed") !== "on") return { ok: false, error: "Please confirm you have the right to rent out this space." };

  return {
    ok: true,
    data: {
      ...d,
      price_hour_paise: hour,
      price_day_paise: day,
      instant_book: fd.get("instant_book") === "yes",
      days_mask: maskFromDays(days),
      amenities,
      rights_confirmed: true,
    },
  };
}

const vehicleSchema = z.object({
  label: text("The vehicle name", 1, 40),
  kind: z.enum(["bike", "hatchback", "sedan", "suv", "van", "truck"], { error: "Choose a vehicle type." }),
  length_cm: int("Length", 100, 1500),
  width_cm: int("Width", 40, 300),
  height_cm: int("Height", 50, 450),
  plate: z.string().trim().max(20).optional(),
});

export function parseVehicleForm(fd: FormData) {
  const r = vehicleSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!r.success) return { ok: false as const, error: r.error.issues[0].message };
  return { ok: true as const, data: { ...r.data, plate: r.data.plate || null } };
}
