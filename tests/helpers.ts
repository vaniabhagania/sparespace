import pg from "pg";
import { randomUUID } from "node:crypto";

export const TEST_DB_URL = process.env.TEST_POSTGRES_URL || "postgres://postgres@127.0.0.1:54329/sparespace_test";

/** Wipe the database so each test file starts from nothing. */
export async function resetDatabase(): Promise<void> {
  const c = new pg.Client({ connectionString: TEST_DB_URL });
  await c.connect();
  await c.query("drop schema public cascade; create schema public;");
  await c.end();
}

const MIN = 60_000;

/** A future instant on the quarter hour, `hours` from now. */
export function at(hours: number): Date {
  const t = Date.now() + hours * 60 * MIN;
  return new Date(Math.ceil(t / (15 * MIN)) * 15 * MIN);
}

export function randomPhoneHash(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

export const spaceDefaults = {
  title: "Covered bay near the metro",
  description: "Quiet and easy to find.",
  kind: "apartment",
  area_label: "Indiranagar",
  address_line: "Block B, Green Park Apartments, 12th Main",
  lat: 12.9784,
  lng: 77.6408,
  max_length_cm: 495,
  max_width_cm: 225,
  max_height_cm: 200,
  capacity: 1,
  price_hour_paise: 5000,
  price_day_paise: 30000 as number | null,
  instant_book: false,
  days_mask: 127,
  open_minute: 0,
  close_minute: 1440,
  access_notes: "Gate code 4821. Bay 14.",
  amenities: ["covered", "cctv"],
  rights_confirmed: true,
};
