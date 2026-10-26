"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ceilToQuarterHour, parseIstInput, toIstInput } from "@/lib/time";

const CHIPS = [
  { h: 1, label: "1 hr" },
  { h: 2, label: "2 hrs" },
  { h: 4, label: "4 hrs" },
  { h: 8, label: "8 hrs" },
  { h: 24, label: "1 day" },
];

function addMinutes(local: string, mins: number): string | null {
  const d = parseIstInput(local);
  return d ? toIstInput(new Date(d.getTime() + mins * 60_000)) : null;
}

function diffMinutes(a: string, b: string): number | null {
  const da = parseIstInput(a), db = parseIstInput(b);
  return da && db ? Math.round((db.getTime() - da.getTime()) / 60_000) : null;
}

function describe(mins: number | null): string {
  if (mins === null) return "";
  if (mins <= 0) return "Leave time must be after arrival.";
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return [d && `${d} day${d > 1 ? "s" : ""}`, h && `${h} hr`, m && `${m} min`].filter(Boolean).join(" ");
}

export function TimeRange({
  defaultStart,
  defaultEnd,
  startLabel = "Arrive",
  endLabel = "Leave",
  onChange,
}: {
  defaultStart: string;
  defaultEnd: string;
  startLabel?: string;
  endLabel?: string;
  onChange?: (start: string, end: string) => void;
}) {
  const id = useId();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [min, setMin] = useState<string | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.(start, end);
  }, [start, end]);

  // The earliest start is "now", worked out in the browser after mount to avoid a hydration mismatch.
  useEffect(() => {
    setMin(toIstInput(ceilToQuarterHour(new Date(Date.now() - 10 * 60_000))));
  }, []);

  const duration = diffMinutes(start, end);

  function onStart(v: string) {
    const keep = duration && duration > 0 ? duration : 120;
    setStart(v);
    const next = addMinutes(v, keep);
    if (next) setEnd(next);
  }

  function chip(h: number) {
    const next = addMinutes(start, h * 60);
    if (next) setEnd(next);
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">When do you need the space?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-start`}>{startLabel}</label>
          <input id={`${id}-start`} className="field" type="datetime-local" name="start" step={900} min={min}
            value={start} onChange={(e) => onStart(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-end`}>{endLabel}</label>
          <input id={`${id}-end`} className="field" type="datetime-local" name="end" step={900} min={start}
            value={end} onChange={(e) => setEnd(e.target.value)} required aria-describedby={`${id}-dur`} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <button key={c.h} type="button" onClick={() => chip(c.h)}
            aria-pressed={duration === c.h * 60}
            className={`chip min-h-9 cursor-pointer px-3 ${duration === c.h * 60 ? "chip-beige" : "chip-outline hover:border-beige hover:text-beige"}`}>
            {c.label}
          </button>
        ))}
        <span id={`${id}-dur`} aria-live="polite" className={`ml-1 text-sm ${duration !== null && duration <= 0 ? "text-flag" : "text-stone"}`}>
          {describe(duration)}
        </span>
      </div>
    </fieldset>
  );
}
