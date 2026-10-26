"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const Inner = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-stone">Loading map…</div>,
});

/** Leaflet only runs in the browser, so it loads on demand and never blocks the page. */
export function MapView({ height = "20rem", ...props }: ComponentProps<typeof Inner> & { height?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cocoa-700 bg-cocoa-950" style={{ height }}>
      <Inner {...props} />
    </div>
  );
}
export type { MapPoint } from "./leaflet-map";
