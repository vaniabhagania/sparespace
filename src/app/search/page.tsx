import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapView, type MapPoint } from "@/components/map-view";
import { IconBolt, IconPin } from "@/components/icons";
import { SearchForm } from "@/components/search-form";
import { SetupNeeded } from "@/components/setup-needed";
import { Notice, Stars } from "@/components/status";
import { geocode, type Place } from "@/lib/geocode";
import { formatDistance, inIndia } from "@/lib/geo";
import { formatINR } from "@/lib/money";
import { first, resolveWindow, type RawParams } from "@/lib/search-params";
import { getCurrentUser } from "@/lib/session";
import { isDbConfigured } from "@/lib/db";
import { searchSpaces, type SearchHit } from "@/lib/services/spaces";
import { AMENITIES, SPACE_KIND_LABELS } from "@/lib/services/types";
import { listVehicles, type VehicleRow } from "@/lib/services/vehicles";
import { formatDuration, formatRange } from "@/lib/time";
import { resolveVehicleParam } from "@/lib/vehicle-param";

export const metadata: Metadata = { title: "Spaces near you" };

const RADII = [2, 4, 10, 25];
const SORTS = [
  { id: "distance", label: "Nearest" },
  { id: "price", label: "Cheapest" },
  { id: "rating", label: "Best rated" },
] as const;

function fitNote(hit: SearchHit): { text: string; tight: boolean } | null {
  if (!hit.fit) return null;
  const c = hit.fit.clearance;
  const tight = c.width_cm < 20 || c.length_cm < 10 || c.height_cm < 5;
  const side = Math.floor(c.width_cm / 2);
  return { text: tight ? `Tight fit: ${side} cm each side` : `${side} cm spare each side`, tight };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").slice(0, 120).trim();

  let lat = Number(first(sp.lat));
  let lng = Number(first(sp.lng));
  const hasPoint = first(sp.lat) !== undefined && first(sp.lng) !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && inIndia(lat, lng);
  let alternatives: Place[] = [];
  let placeLabel = q || "your pin";
  let geocodeFailed = false;

  if (!hasPoint) {
    if (!q) redirect("/");
    let found: Place[] = [];
    try {
      found = await geocode(q);
    } catch {
      geocodeFailed = true;
    }
    if (found[0]) {
      lat = found[0].lat;
      lng = found[0].lng;
      placeLabel = found[0].label;
      alternatives = found.slice(1, 4);
    }
  }

  const win = resolveWindow(first(sp.start), first(sp.end));
  const user = await getCurrentUser();
  const saved: VehicleRow[] = user ? await listVehicles(user.id) : [];
  const chosen = resolveVehicleParam(first(sp.v), saved);
  const sort = SORTS.find((s) => s.id === first(sp.sort))?.id ?? "distance";
  const radius = RADII.includes(Number(first(sp.r))) ? Number(first(sp.r)) : 4;

  const located = Number.isFinite(lat) && Number.isFinite(lng) && inIndia(lat, lng);
  const result = located
    ? await searchSpaces({ lat, lng, radiusKm: radius, start: win.start, end: win.end, vehicle: chosen.dims, viewerId: user?.id ?? null, sort })
    : null;

  const base = new URLSearchParams();
  if (located) { base.set("lat", String(lat)); base.set("lng", String(lng)); }
  base.set("q", q || placeLabel);
  base.set("start", win.startInput);
  base.set("end", win.endInput);
  base.set("v", chosen.value);
  const withParams = (extra: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    if (sort !== "distance" && !("sort" in extra)) p.set("sort", sort);
    if (radius !== 4 && !("r" in extra)) p.set("r", String(radius));
    return `/search?${p.toString()}`;
  };
  const detailQuery = new URLSearchParams({ start: win.startInput, end: win.endInput, v: chosen.value }).toString();

  const points: MapPoint[] = (result?.hits ?? []).map((h) => ({
    id: h.id, lat: h.point.lat, lng: h.point.lng, text: formatINR(h.totalPaise), name: `${h.title}, ${formatINR(h.totalPaise)}`, href: `/spaces/${h.id}?${detailQuery}`,
  }));
  const lo = result?.left_out;
  const leftOutBits = lo
    ? [
        lo.too_small && `${lo.too_small} too small for your ${chosen.label.toLowerCase()}`,
        lo.closed && `${lo.closed} closed at that time`,
        lo.full && `${lo.full} already booked`,
      ].filter(Boolean)
    : [];

  return (
    <div className="shell py-6 md:py-9">
      <h1 className="text-[clamp(2rem,6vw,3.2rem)]">Spaces near {placeLabel}</h1>
      <p className="mt-2 text-stone">
        {formatRange(win.start, win.end)} <span aria-hidden="true">·</span> {formatDuration(win.start, win.end)} <span aria-hidden="true">·</span> {chosen.label}
      </p>

      <details className="panel-sunken mt-4 border border-cocoa-700">
        <summary className="cursor-pointer font-semibold text-beige">Change place, time or vehicle</summary>
        <div className="mt-4 max-w-xl">
          <SearchForm
            vehicles={saved}
            defaults={{ q: q || undefined, lat: located ? lat : undefined, lng: located ? lng : undefined, start: win.startInput, end: win.endInput, v: chosen.value }}
          />
        </div>
      </details>

      {win.adjusted && <div className="mt-4"><Notice>{win.adjusted}</Notice></div>}

      {!located && (
        <div className="mt-6 max-w-xl">
          <Notice tone="error">
            {geocodeFailed
              ? "Place search isn't responding right now. Try again in a moment, or use the location button to search from where you are."
              : `We couldn't find "${q}" in India. Try adding the area or city, like "Phoenix Mall, Whitefield".`}
          </Notice>
        </div>
      )}

      {result && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <section aria-label="Results">
            {alternatives.length > 0 && (
              <p className="mb-4 text-sm text-stone">
                Not the right place?{" "}
                {alternatives.map((a, i) => (
                  <span key={`${a.lat},${a.lng}`}>
                    {i > 0 && ", "}
                    <Link className="link" href={withParams({ lat: String(a.lat), lng: String(a.lng), q: a.label })}>{a.label}</Link>
                  </span>
                ))}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold" aria-live="polite">
                {result.hits.length === 0 ? "No spaces available" : `${result.hits.length} ${result.hits.length === 1 ? "space" : "spaces"} within ${radius} km`}
              </p>
              <nav aria-label="Sort results" className="flex gap-1.5">
                {SORTS.map((s) => (
                  <Link key={s.id} href={withParams({ sort: s.id })} aria-current={sort === s.id ? "true" : undefined}
                    className={`chip min-h-9 px-3 no-underline ${sort === s.id ? "chip-beige" : "chip-outline hover:border-beige hover:text-beige"}`}>
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>

            {result.hits.length === 0 ? (
              <div className="panel mt-4">
                <h2 className="text-3xl">Nothing free here at that time</h2>
                <p className="mt-2 text-stone">
                  {leftOutBits.length ? `Nearby, we left out ${leftOutBits.join(", ")}.` : "No hosts have listed a space this close yet."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {RADII.filter((r) => r > radius).slice(0, 2).map((r) => (
                    <Link key={r} href={withParams({ r: String(r) })} className="btn btn-primary btn-sm">Search within {r} km</Link>
                  ))}
                  <Link href="/host/new" className="btn btn-ghost btn-sm">Have a spare space? List it</Link>
                </div>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3">
                {result.hits.map((h) => {
                  const fn = fitNote(h);
                  return (
                    <li key={h.id} className="panel relative transition-colors hover:bg-cocoa-700/80">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="text-[1.7rem]">
                            <Link href={`/spaces/${h.id}?${detailQuery}`} className="no-underline after:absolute after:inset-0 after:content-['']">{h.title}</Link>
                          </h2>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-stone">
                            <IconPin width={15} height={15} />
                            <span>{h.area_label}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDistance(h.distanceKm)} away</span>
                            <span aria-hidden="true">·</span>
                            <span>{SPACE_KIND_LABELS[h.kind]}</span>
                          </p>
                        </div>
                        <div className="flex-none text-right">
                          <p className="font-display text-3xl font-extrabold leading-none">{formatINR(h.totalPaise)}</p>
                          <p className="mt-1 text-xs text-stone">{formatINR(h.price_hour_paise)} / hr</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Stars value={h.rating_avg} count={h.rating_count} />
                        {h.instant_book && <span className="chip chip-beige"><IconBolt width={13} height={13} />Instant</span>}
                        {fn && <span className={`chip ${fn.tight ? "chip-flag" : "chip-outline"}`}>{fn.text}</span>}
                        {h.amenities.slice(0, 3).map((a) => (
                          <span key={a} className="chip chip-outline">{AMENITIES.find((x) => x.id === a)?.label ?? a}</span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {result.hits.length > 0 && leftOutBits.length > 0 && (
              <p className="mt-4 text-sm text-stone">Also nearby but not shown: {leftOutBits.join(", ")}.</p>
            )}
          </section>

          <aside aria-label="Map" className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
            <MapView
              height="clamp(12rem, 30vh, 28rem)"
              label="Map of available spaces. Locations are approximate until you book."
              center={{ lat, lng }}
              zoom={14}
              points={points}
              showCenter
            />
            <p className="mt-2 text-xs text-stone">Pins show the price for your stay and an approximate spot. The exact address unlocks once you&apos;re confirmed.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
