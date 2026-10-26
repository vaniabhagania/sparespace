"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  /** Short text on the pin, like a price. */
  text: string;
  /** Spoken name for the pin. */
  name: string;
  href?: string;
}

interface Props {
  points?: MapPoint[];
  center: { lat: number; lng: number };
  zoom?: number;
  activeId?: string | null;
  /** Radius in metres of a soft circle drawn on the centre, for "somewhere around here". */
  approxRadius?: number;
  /** Show the centre as a small dot, for "where you're headed". */
  showCenter?: boolean;
  pick?: { lat: number | null; lng: number | null; onPick: (lat: number, lng: number) => void };
  label: string;
}

type Ready = { L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup };

export default function LeafletMap({ points = [], center, zoom = 15, activeId, approxRadius, showCenter, pick, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const stateRef = useRef<Ready | null>(null);
  const pickRef = useRef(pick);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        pickRef.current?.onPick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
      });
      stateRef.current = { L, map, layer };
      setReady(true);
    })();
    return () => {
      cancelled = true;
      stateRef.current = null;
      map?.remove();
      setReady(false);
    };
    // The map is created once; later changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    if (!ready || !s) return;
    const { L, map, layer } = s;
    layer.clearLayers();

    const pin = (text: string, active: boolean) => {
      const outer = document.createElement("div");
      outer.className = `pin${active ? " pin-active" : ""}`;
      const inner = document.createElement("span");
      inner.textContent = text;
      outer.appendChild(inner);
      return L.divIcon({ className: "", html: outer, iconSize: [42, 42], iconAnchor: [21, 42] });
    };

    const bounds: [number, number][] = [];
    for (const p of points) {
      const m = L.marker([p.lat, p.lng], { icon: pin(p.text, p.id === activeId), title: p.name, alt: p.name, keyboard: true });
      if (p.href) m.on("click", () => router.push(p.href!));
      m.addTo(layer);
      bounds.push([p.lat, p.lng]);
    }
    if (showCenter) {
      L.circleMarker([center.lat, center.lng], { radius: 7, color: "#f4ecdd", weight: 3, fillColor: "#3b2418", fillOpacity: 1 }).addTo(layer);
      bounds.push([center.lat, center.lng]);
    }
    if (approxRadius) {
      L.circle([center.lat, center.lng], { radius: approxRadius, color: "#d9c4a1", weight: 2, dashArray: "6 6", fillColor: "#d9c4a1", fillOpacity: 0.16 }).addTo(layer);
    }
    if (pick) {
      if (pick.lat !== null && pick.lng !== null) {
        const m = L.marker([pick.lat, pick.lng], { icon: pin("Here", true), draggable: true, title: "Space location. Drag to adjust.", keyboard: true });
        m.on("dragend", () => {
          const ll = m.getLatLng();
          pickRef.current?.onPick(Number(ll.lat.toFixed(5)), Number(ll.lng.toFixed(5)));
        });
        m.addTo(layer);
        map.setView([pick.lat, pick.lng], Math.max(map.getZoom(), 17), { animate: false });
      } else {
        map.setView([center.lat, center.lng], zoom, { animate: false });
      }
      return;
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    else map.setView([center.lat, center.lng], zoom, { animate: false });
  }, [ready, points, center.lat, center.lng, zoom, activeId, approxRadius, showCenter, pick?.lat, pick?.lng, router]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} role="region" aria-label={label} className="h-full w-full" />;
}
