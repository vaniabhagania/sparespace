import { db } from "../db";
import { VEHICLE_KINDS } from "../fit";
import { clean } from "../text";
import { fail, type Result } from "./types";

export interface VehicleRow {
  id: string;
  label: string;
  kind: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  plate: string | null;
}

const MAX_VEHICLES = 5;

export async function listVehicles(userId: string): Promise<VehicleRow[]> {
  return db.query<VehicleRow>(
    "select id, label, kind, length_cm, width_cm, height_cm, plate from vehicles where user_id = $1 order by created_at asc",
    [userId],
  );
}

export async function addVehicle(userId: string, v: Omit<VehicleRow, "id">): Promise<Result<{ id: string }>> {
  if (!(VEHICLE_KINDS as readonly string[]).includes(v.kind)) return fail("Choose a vehicle type.");
  const plate = v.plate ? v.plate.replace(/[\s-]/g, "").toUpperCase() : null;
  if (plate && !/^[A-Z0-9]{4,14}$/.test(plate)) return fail("The number plate should be letters and digits only.");
  return db.tx(async (q) => {
    const n = await q.query<{ n: number }>("select count(*)::int as n from vehicles where user_id = $1", [userId]);
    if (n[0].n >= MAX_VEHICLES) return fail(`You can save up to ${MAX_VEHICLES} vehicles.`);
    const rows = await q.query<{ id: string }>(
      `insert into vehicles (user_id, label, kind, length_cm, width_cm, height_cm, plate)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [userId, clean(v.label), v.kind, v.length_cm, v.width_cm, v.height_cm, plate],
    );
    return { ok: true, id: rows[0].id };
  });
}

export async function deleteVehicle(userId: string, vehicleId: string): Promise<Result> {
  const rows = await db.query<{ id: string }>("delete from vehicles where id = $1 and user_id = $2 returning id", [vehicleId, userId]);
  return rows.length ? { ok: true } : fail("Vehicle not found.");
}
