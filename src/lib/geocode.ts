import { inIndia } from "./geo";

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Turn Nominatim's JSON into a short list of places inside India. Exported for tests. */
export function parsePlaces(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const out: Place[] = [];
  for (const r of json) {
    const lat = Number((r as { lat?: unknown }).lat);
    const lng = Number((r as { lon?: unknown }).lon);
    const name = String((r as { display_name?: unknown }).display_name ?? "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name || !inIndia(lat, lng)) continue;
    // "Phoenix Marketcity, Whitefield, Bengaluru, Karnataka, 560048, India" -> first three parts
    const label = name.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(", ");
    out.push({ label, lat, lng });
  }
  return out.slice(0, 5);
}

function userAgent(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return `SpareSpace/0.1 (${host ? `https://${host}` : "parking marketplace"})`;
}

export async function geocode(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 120) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("q", q);
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent(), "Accept-Language": "en" },
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 86_400 },
  });
  if (!res.ok) return [];
  return parsePlaces(await res.json());
}
