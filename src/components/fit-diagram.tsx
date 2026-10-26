import { checkFit } from "@/lib/fit";

interface Bay {
  max_length_cm: number;
  max_width_cm: number;
  max_height_cm: number;
}
interface Vehicle {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  label?: string;
}

/**
 * A top-down plan of the bay with the driver's vehicle drawn to the same scale,
 * so "will it fit?" is answered by looking, with the spare centimetres spelled out.
 */
export function FitDiagram({
  bay,
  vehicle,
  compact = false,
  animate = false,
}: {
  bay: Bay;
  vehicle: Vehicle | null;
  compact?: boolean;
  animate?: boolean;
}) {
  const k = compact ? 0.34 : 0.5; // px per cm
  const bw = bay.max_width_cm * k;
  const bl = bay.max_length_cm * k;
  const vw = vehicle ? vehicle.width_cm * k : 0;
  const vl = vehicle ? vehicle.length_cm * k : 0;

  // A vehicle that is too big enlarges the canvas so its outline is never clipped.
  const overLength = Math.max(0, vl - bl);
  const overSide = Math.max(0, (vw - bw) / 2);
  const padX = (compact ? 10 : 46) + overSide;
  const padTop = (compact ? 8 : 14) + overLength;
  const padBottom = compact ? 8 : 34;
  const W = bw + padX * 2;
  const H = bl + padTop + padBottom;
  const bx = padX;
  const by = padTop;

  const fit = vehicle ? checkFit(vehicle, bay) : null;
  const ok = fit?.fits ?? true;
  const vx = bx + (bw - vw) / 2;
  const gap = Math.min(8, Math.max(0, (bl - vl) / 3));
  const vy = by + bl - vl - gap;
  const side = fit ? Math.round(fit.clearance.width_cm / 2) : 0;

  const name = vehicle?.label ?? "Your vehicle";
  const summary = vehicle
    ? ok
      ? `${name} fits with about ${side} cm to spare on each side, ${fit!.clearance.length_cm} cm of length and ${fit!.clearance.height_cm} cm of height.`
      : `${name} does not fit: ${fit!.reasons.join(", ")}.`
    : `Bay up to ${bay.max_length_cm} cm long, ${bay.max_width_cm} cm wide and ${bay.max_height_cm} cm high.`;

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${W} ${H}`}
        width={compact ? W : "100%"}
        style={compact ? { height: H } : { maxWidth: Math.max(W, 260), height: "auto" }}
        className="block"
      >
        {/* painted bay lines: left, back and right, open at the front */}
        <rect x={bx} y={by} width={bw} height={bl} fill="#2a180f" rx="3" />
        <path
          d={`M${bx} ${by + bl} V${by} H${bx + bw} V${by + bl}`}
          fill="none"
          stroke="#d9c4a1"
          strokeWidth={compact ? 2 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {vehicle && (
          <g className={animate ? "car-pull" : undefined} style={{ transformBox: "fill-box" }}>
            <rect
              x={vx}
              y={vy}
              width={vw}
              height={vl}
              rx={Math.min(vw, vl) * 0.22}
              fill={ok ? "#f4ecdd" : "none"}
              fillOpacity={ok ? 0.92 : 1}
              stroke={ok ? "none" : "#f2a58e"}
              strokeWidth={ok ? 0 : 2.5}
              strokeDasharray={ok ? undefined : "6 4"}
            />
            {ok && (
              <>
                <rect x={vx + vw * 0.14} y={vy + vl * 0.17} width={vw * 0.72} height={vl * 0.17} rx="3" fill="#3b2418" opacity="0.8" />
                <rect x={vx + vw * 0.14} y={vy + vl * 0.66} width={vw * 0.72} height={vl * 0.12} rx="3" fill="#3b2418" opacity="0.6" />
              </>
            )}
          </g>
        )}
        {!compact && vehicle && ok && (
          <g fontSize="11" fill="#a8a095" textAnchor="middle" style={{ fontFamily: "var(--font-sans)" }}>
            <text x={bx / 2 + 2} y={vy + vl / 2} dominantBaseline="middle">{side} cm</text>
            <text x={bx + bw + padX / 2 - 2} y={vy + vl / 2} dominantBaseline="middle">{side} cm</text>
          </g>
        )}
        {!compact && (
          <g fontSize="11.5" fill="#a8a095" textAnchor="middle" style={{ fontFamily: "var(--font-sans)" }}>
            <text x={bx + bw / 2} y={by + bl + 20}>
              {bay.max_length_cm} × {bay.max_width_cm} cm, {bay.max_height_cm} cm high
            </text>
          </g>
        )}
      </svg>
      {!compact && <figcaption className={`mt-2 text-sm ${ok ? "text-stone" : "text-flag"}`}>{summary}</figcaption>}
    </figure>
  );
}
