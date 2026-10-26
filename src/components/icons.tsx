import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
  ...p,
});

export const IconSearch = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>);
export const IconHost = (p: P) => (<svg {...base(p)}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /></svg>);
export const IconTrips = (p: P) => (<svg {...base(p)}><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></svg>);
export const IconChat = (p: P) => (<svg {...base(p)}><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>);
export const IconUser = (p: P) => (<svg {...base(p)}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c.8-3.6 3.6-5.5 7.5-5.5s6.7 1.9 7.5 5.5" /></svg>);
export const IconPin = (p: P) => (<svg {...base(p)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>);
export const IconClock = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>);
export const IconCheck = (p: P) => (<svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const IconX = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconAlert = (p: P) => (<svg {...base(p)}><path d="M12 4 3 19.5h18Z" /><path d="M12 10v4.5M12 17.3v.2" /></svg>);
export const IconStar = (p: P) => (<svg {...base(p)} fill="currentColor" strokeWidth={1.2}><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8Z" /></svg>);
export const IconLock = (p: P) => (<svg {...base(p)}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>);
export const IconShield = (p: P) => (<svg {...base(p)}><path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.6 7 9 4.2-1.4 7-4.8 7-9V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>);
export const IconBolt = (p: P) => (<svg {...base(p)}><path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12Z" /></svg>);
export const IconCrosshair = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="6.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></svg>);
export const IconArrowRight = (p: P) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#d9c4a1" />
      <path d="M8.5 24.5V8h15v16.5" fill="none" stroke="#2a180f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="13.5" width="8" height="11" rx="2.2" fill="#2a180f" />
    </svg>
  );
}
