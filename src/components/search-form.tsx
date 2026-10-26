import { VEHICLE_KINDS, VEHICLE_PRESETS } from "@/lib/fit";
import { IconSearch } from "./icons";
import { PlaceInput } from "./place-input";
import { TimeRange } from "./time-range";

export interface SavedVehicle {
  id: string;
  label: string;
  kind: string;
}

export function SearchForm({
  vehicles,
  defaults,
}: {
  vehicles: SavedVehicle[];
  defaults: { q?: string; lat?: number; lng?: number; start: string; end: string; v?: string };
}) {
  const selected = defaults.v ?? (vehicles[0] ? `id:${vehicles[0].id}` : "kind:hatchback");
  return (
    <form action="/search" method="get" className="grid gap-4" aria-label="Find a parking space">
      <PlaceInput defaultQuery={defaults.q} defaultLat={defaults.lat} defaultLng={defaults.lng} />
      <TimeRange defaultStart={defaults.start} defaultEnd={defaults.end} />
      <div>
        <label className="label" htmlFor="sf-vehicle">What are you parking?</label>
        <select id="sf-vehicle" name="v" className="field" defaultValue={selected}>
          {vehicles.length > 0 && (
            <optgroup label="Your vehicles">
              {vehicles.map((v) => (
                <option key={v.id} value={`id:${v.id}`}>{v.label}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={vehicles.length ? "Or a typical size" : "Typical size"}>
            {VEHICLE_KINDS.map((k) => (
              <option key={k} value={`kind:${k}`}>{VEHICLE_PRESETS[k].label}</option>
            ))}
          </optgroup>
        </select>
        <p className="hint">We only show spaces your vehicle fits.</p>
      </div>
      <button type="submit" className="btn btn-primary btn-block text-lg">
        <IconSearch width={20} height={20} />
        Find spaces
      </button>
    </form>
  );
}
