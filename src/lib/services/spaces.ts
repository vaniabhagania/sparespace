import { db, type Queryable } from "../db";
import { isAvailable } from "../availability";
import { peakOverlap } from "../capacity";
import { checkFit, type Dims, type FitResult } from "../fit";
import { approximatePoint, haversineKm } from "../geo";
import { computePrice } from "../pricing";
import { hit } from "../rate-limit";
import { clean } from "../text";
import { fail, type Result, type SpaceRow } from "./types";

export interface SpaceInput {
  title: string;
  description: string;
  kind: string;
  area_label: string;
  address_line: string;
  lat: number;
  lng: number;
  max_length_cm: number;
  max_width_cm: number;
  max_height_cm: number;
  capacity: number;
  price_hour_paise: number;
  price_day_paise: number | null;
  instant_book: boolean;
  days_mask: number;
  open_minute: number;
  close_minute: number;
  access_notes: string;
  amenities: string[];
  rights_confirmed: boolean;
}

const MAX_SPACES_PER_HOST = 10;

const ACTIVE_BOOKING_SQL = `(status in ('confirmed','checked_in') or (status = 'pending' and expires_at > now()))`;

export async function createSpace(hostId: string, input: SpaceInput): Promise<Result<{ id: string }>> {
  if (!input.rights_confirmed) return fail("Please confirm you have the right to rent out this space.");
  return db.tx(async (q) => {
    const host = await q.query("select 1 from users where id = $1 and banned_at is null and deleted_at is null", [hostId]);
    if (!host.length) return fail("This account can't list spaces.");
    const count = await q.query<{ n: number }>("select count(*)::int as n from spaces where host_id = $1", [hostId]);
    if (count[0].n >= MAX_SPACES_PER_HOST) return fail(`You can list up to ${MAX_SPACES_PER_HOST} spaces.`);
    const rl = await hit(`listing:${hostId}`, 5, 86_400, q);
    if (!rl.allowed) return fail("You've added several spaces today. Try again tomorrow.");

    const rows = await q.query<{ id: string }>(
      `insert into spaces (host_id, title, description, kind, area_label, address_line, lat, lng,
         max_length_cm, max_width_cm, max_height_cm, capacity, price_hour_paise, price_day_paise,
         instant_book, days_mask, open_minute, close_minute, access_notes, amenities, rights_confirmed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       returning id`,
      [
        hostId, clean(input.title), input.description.trim(), input.kind, clean(input.area_label),
        clean(input.address_line), input.lat, input.lng, input.max_length_cm, input.max_width_cm,
        input.max_height_cm, input.capacity, input.price_hour_paise, input.price_day_paise,
        input.instant_book, input.days_mask, input.open_minute, input.close_minute,
        input.access_notes.trim(), input.amenities, true,
      ],
    );
    return { ok: true, id: rows[0].id };
  });
}

/** Fields that, if changed, could strand a driver who has already booked. */
const LOCKED_WHEN_BOOKED: (keyof SpaceInput)[] = [
  "lat", "lng", "address_line", "max_length_cm", "max_width_cm", "max_height_cm",
  "capacity", "days_mask", "open_minute", "close_minute",
];

export async function updateSpace(hostId: string, spaceId: string, input: SpaceInput): Promise<Result> {
  return db.tx(async (q) => {
    const rows = await q.query<SpaceRow>("select * from spaces where id = $1 and host_id = $2 for update", [spaceId, hostId]);
    const cur = rows[0];
    if (!cur) return fail("Space not found.");
    if (cur.status === "suspended") return fail("This space is suspended while we look into a report. You can't edit it right now.");

    const changed = LOCKED_WHEN_BOOKED.filter((k) => String(cur[k]) !== String(input[k]));
    if (changed.length) {
      const upcoming = await q.query(
        `select 1 from bookings where space_id = $1 and end_at > now() and ${ACTIVE_BOOKING_SQL} limit 1`,
        [spaceId],
      );
      if (upcoming.length) {
        return fail("This space has upcoming bookings, so its size, location, hours and number of bays are locked. Price, photos and notes can still change.");
      }
    }
    await q.query(
      `update spaces set title=$3, description=$4, kind=$5, area_label=$6, address_line=$7, lat=$8, lng=$9,
         max_length_cm=$10, max_width_cm=$11, max_height_cm=$12, capacity=$13, price_hour_paise=$14,
         price_day_paise=$15, instant_book=$16, days_mask=$17, open_minute=$18, close_minute=$19,
         access_notes=$20, amenities=$21, updated_at=now()
       where id=$1 and host_id=$2`,
      [
        spaceId, hostId, clean(input.title), input.description.trim(), input.kind, clean(input.area_label),
        clean(input.address_line), input.lat, input.lng, input.max_length_cm, input.max_width_cm,
        input.max_height_cm, input.capacity, input.price_hour_paise, input.price_day_paise,
        input.instant_book, input.days_mask, input.open_minute, input.close_minute,
        input.access_notes.trim(), input.amenities,
      ],
    );
    return { ok: true };
  });
}

export async function setSpaceActive(hostId: string, spaceId: string, active: boolean): Promise<Result> {
  const rows = await db.query<{ id: string }>(
    `update spaces set status = $3, updated_at = now()
      where id = $1 and host_id = $2 and status in ('active','paused') returning id`,
    [spaceId, hostId, active ? "active" : "paused"],
  );
  return rows.length ? { ok: true } : fail("Space not found, or it is suspended.");
}

export async function listHostSpaces(hostId: string) {
  return db.query<
    SpaceRow & { rating_avg: number | null; rating_count: number; upcoming: number }
  >(
    `select s.*,
       (select round(avg(r.rating)::numeric, 1)::float from reviews r where r.space_id = s.id and r.direction = 'driver_to_space') as rating_avg,
       (select count(*)::int from reviews r where r.space_id = s.id and r.direction = 'driver_to_space') as rating_count,
       (select count(*)::int from bookings b where b.space_id = s.id and b.end_at > now()
          and (b.status in ('confirmed','checked_in') or (b.status = 'pending' and b.expires_at > now()))) as upcoming
     from spaces s where s.host_id = $1 order by s.created_at desc`,
    [hostId],
  );
}

export interface SpaceView extends SpaceRow {
  host_name: string | null;
  host_deleted: boolean;
  host_joined: Date;
  host_cancel_count: number;
  completed_count: number;
  rating_avg: number | null;
  rating_count: number;
  /** True when the viewer may see the exact location and access notes. */
  exact: boolean;
  point: { lat: number; lng: number };
}

export async function getSpaceView(spaceId: string, viewerId: string | null, q: Queryable = db): Promise<SpaceView | null> {
  const rows = await q.query<
    SpaceRow & {
      host_name: string | null; host_deleted: Date | null; host_banned: Date | null; host_joined: Date;
      host_cancel_count: number; completed_count: number; rating_avg: number | null; rating_count: number;
    }
  >(
    `select s.*, u.nickname as host_name, u.deleted_at as host_deleted, u.banned_at as host_banned,
            u.created_at as host_joined, u.host_cancel_count,
       (select count(*)::int from bookings b where b.space_id in (select id from spaces where host_id = s.host_id) and b.status = 'completed') as completed_count,
       (select round(avg(r.rating)::numeric, 1)::float from reviews r where r.space_id = s.id and r.direction = 'driver_to_space') as rating_avg,
       (select count(*)::int from reviews r where r.space_id = s.id and r.direction = 'driver_to_space') as rating_count
     from spaces s join users u on u.id = s.host_id where s.id = $1`,
    [spaceId],
  );
  const s = rows[0];
  if (!s) return null;
  const isHost = viewerId === s.host_id;
  if (!isHost && (s.status === "suspended" || s.host_banned || s.host_deleted)) return null;

  let exact = isHost;
  if (!exact && viewerId) {
    const b = await q.query(
      `select 1 from bookings where space_id = $1 and driver_id = $2
          and status in ('confirmed','checked_in','completed') and end_at > now() - interval '1 day' limit 1`,
      [spaceId, viewerId],
    );
    exact = b.length > 0;
  }
  const point = exact ? { lat: s.lat, lng: s.lng } : approximatePoint(s.lat, s.lng);
  return {
    ...s,
    host_name: s.host_name,
    host_deleted: Boolean(s.host_deleted),
    exact,
    point,
    address_line: exact ? s.address_line : "",
    access_notes: exact ? s.access_notes : "",
  };
}

export interface SearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  start: Date;
  end: Date;
  vehicle: Dims | null;
  viewerId: string | null;
  sort: "distance" | "price" | "rating";
}

export interface SearchHit {
  id: string;
  title: string;
  kind: string;
  area_label: string;
  distanceKm: number;
  totalPaise: number;
  price_hour_paise: number;
  rating_avg: number | null;
  rating_count: number;
  instant_book: boolean;
  amenities: string[];
  capacity: number;
  bay: { max_length_cm: number; max_width_cm: number; max_height_cm: number };
  fit: FitResult | null;
  point: { lat: number; lng: number };
}

export interface SearchResult {
  hits: SearchHit[];
  /** Nearby spaces left out, and why, so an empty list can still tell the driver something useful. */
  left_out: { too_small: number; closed: number; full: number };
}

export async function searchSpaces(p: SearchParams): Promise<SearchResult> {
  const dLat = p.radiusKm / 111;
  const dLng = p.radiusKm / (111 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
  const cands = await db.query<
    SpaceRow & { rating_avg: number | null; rating_count: number }
  >(
    `select s.*,
       (select round(avg(r.rating)::numeric, 1)::float from reviews r where r.space_id = s.id and r.direction = 'driver_to_space') as rating_avg,
       (select count(*)::int from reviews r where r.space_id = s.id and r.direction = 'driver_to_space') as rating_count
     from spaces s join users u on u.id = s.host_id
     where s.status = 'active' and u.banned_at is null and u.deleted_at is null
       and s.lat between $1 and $2 and s.lng between $3 and $4
       and ($5::uuid is null or s.host_id <> $5::uuid)
     order by ((s.lat - $6)^2 + ((s.lng - $7) * cos(radians($6)))^2)
     limit 300`,
    [p.lat - dLat, p.lat + dLat, p.lng - dLng, p.lng + dLng, p.viewerId, p.lat, p.lng],
  );
  const left_out = { too_small: 0, closed: 0, full: 0 };
  if (!cands.length) return { hits: [], left_out };

  const busy = await db.query<{ space_id: string; start_at: Date; end_at: Date }>(
    `select space_id, start_at, end_at from bookings
      where space_id = any($1::uuid[]) and start_at < $3 and end_at > $2
        and ${ACTIVE_BOOKING_SQL}`,
    [cands.map((c) => c.id), p.start, p.end],
  );
  const bySpace = new Map<string, { start: Date; end: Date }[]>();
  for (const b of busy) {
    const list = bySpace.get(b.space_id) ?? [];
    list.push({ start: new Date(b.start_at), end: new Date(b.end_at) });
    bySpace.set(b.space_id, list);
  }

  const hits: SearchHit[] = [];
  for (const c of cands) {
    const distanceKm = haversineKm({ lat: p.lat, lng: p.lng }, c);
    if (distanceKm > p.radiusKm) continue;
    const fit = p.vehicle
      ? checkFit(p.vehicle, { max_length_cm: c.max_length_cm, max_width_cm: c.max_width_cm, max_height_cm: c.max_height_cm })
      : null;
    if (fit && !fit.fits) { left_out.too_small++; continue; }
    if (!isAvailable(c, p.start, p.end)) { left_out.closed++; continue; }
    if (peakOverlap(bySpace.get(c.id) ?? [], p.start, p.end) >= c.capacity) { left_out.full++; continue; }
    hits.push({
      id: c.id,
      title: c.title,
      kind: c.kind,
      area_label: c.area_label,
      distanceKm,
      totalPaise: computePrice({ priceHourPaise: c.price_hour_paise, priceDayPaise: c.price_day_paise, start: p.start, end: p.end }),
      price_hour_paise: c.price_hour_paise,
      rating_avg: c.rating_avg,
      rating_count: c.rating_count,
      instant_book: c.instant_book,
      amenities: c.amenities,
      capacity: c.capacity,
      bay: { max_length_cm: c.max_length_cm, max_width_cm: c.max_width_cm, max_height_cm: c.max_height_cm },
      fit,
      point: approximatePoint(c.lat, c.lng),
    });
  }
  const cmp: Record<SearchParams["sort"], (a: SearchHit, b: SearchHit) => number> = {
    distance: (a, b) => a.distanceKm - b.distanceKm,
    price: (a, b) => a.totalPaise - b.totalPaise || a.distanceKm - b.distanceKm,
    rating: (a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0) || a.distanceKm - b.distanceKm,
  };
  hits.sort(cmp[p.sort]);
  return { hits: hits.slice(0, 40), left_out };
}
