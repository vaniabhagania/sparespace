"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconCrosshair, IconPin } from "./icons";

interface Place {
  label: string;
  lat: number;
  lng: number;
}

/**
 * A place box that suggests Indian locations as you type, and can use the phone's location.
 * It submits `q` (the text) and, once a place is picked, `lat`, `lng`. If only `q` arrives,
 * the search page looks the text up itself.
 */
export function PlaceInput({
  defaultQuery = "",
  defaultLat,
  defaultLng,
  label = "Where are you headed?",
  required = true,
  emitHidden = true,
  onPlace,
  placeholder = "A mall, metro station, office or area",
}: {
  defaultQuery?: string;
  defaultLat?: number;
  defaultLng?: number;
  label?: string;
  required?: boolean;
  /** Set false when a parent form keeps its own lat and lng fields. */
  emitHidden?: boolean;
  onPlace?: (p: Place) => void;
  placeholder?: string;
}) {
  const id = useId();
  const [q, setQ] = useState(defaultQuery);
  const [lat, setLat] = useState<number | undefined>(defaultLat);
  const [lng, setLng] = useState<number | undefined>(defaultLng);
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    abort.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onType(v: string) {
    setQ(v);
    setLat(undefined);
    setLng(undefined);
    setActive(-1);
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    if (v.trim().length < 3) {
      setPlaces([]);
      setOpen(false);
      setStatus("");
      return;
    }
    timer.current = setTimeout(async () => {
      const ac = new AbortController();
      abort.current = ac;
      setStatus("Searching…");
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(v.trim())}`, { signal: ac.signal });
        const data = (await res.json()) as { places?: Place[]; error?: string };
        const list = data.places ?? [];
        setPlaces(list);
        setOpen(list.length > 0);
        setStatus(list.length ? `${list.length} places found` : data.error ?? "No places found. Try adding the area or city.");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("Couldn't search places. You can still press Search.");
      }
    }, 350);
  }

  function choose(p: Place) {
    setQ(p.label);
    setLat(p.lat);
    setLng(p.lng);
    setOpen(false);
    setStatus("");
    setActive(-1);
    onPlace?.(p);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("This browser can't share your location. Type a place instead.");
      return;
    }
    setLocating(true);
    setStatus("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { label: "My location", lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) };
        setQ(here.label);
        setLat(here.lat);
        setLng(here.lng);
        onPlace?.(here);
        setPlaces([]);
        setOpen(false);
        setLocating(false);
        setStatus("Using your current location");
      },
      (err) => {
        setLocating(false);
        setStatus(err.code === err.PERMISSION_DENIED ? "Location is blocked. Type a place instead." : "Couldn't get your location. Type a place instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !places.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % places.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? places.length - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(places[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div className="relative">
      <label className="label" htmlFor={`${id}-q`}>{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconPin width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            id={`${id}-q`}
            name="q"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-describedby={`${id}-status`}
            autoComplete="off"
            className="field pl-10"
            placeholder={placeholder}
            value={q}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            required={required}
            maxLength={120}
          />
        </div>
        <button type="button" onClick={useMyLocation} disabled={locating} className="btn btn-ghost px-3.5" aria-label="Use my current location" title="Use my current location">
          <IconCrosshair width={20} height={20} />
        </button>
      </div>
      {emitHidden && lat !== undefined && lng !== undefined && (
        <>
          <input type="hidden" name="lat" value={lat} />
          <input type="hidden" name="lng" value={lng} />
        </>
      )}
      <p id={`${id}-status`} className="hint empty:mt-0" aria-live="polite">{status}</p>
      {open && places.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label="Place suggestions"
          className="absolute left-0 right-0 z-30 mt-[-0.6rem] max-h-72 overflow-auto rounded-xl border border-stone-dim bg-cocoa-950 py-1 shadow-xl">
          {places.map((p, i) => (
            <li key={`${p.lat},${p.lng}`} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-[0.95rem] ${i === active ? "bg-cocoa-800 text-beige" : "hover:bg-cocoa-800"}`}>
              <IconPin width={16} height={16} className="mt-1 flex-none text-stone" />
              <span>{p.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
