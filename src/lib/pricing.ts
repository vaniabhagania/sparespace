const HOUR_MS = 3_600_000;

export const OVERSTAY_GRACE_MIN = 15;
export const OVERSTAY_MULTIPLIER = 1.5;

export function billedHours(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / HOUR_MS));
}

/**
 * Price for a stay. Billed per started hour. If the host set a day rate, every full 24 hours
 * is charged at the day rate and the remainder is capped at one day rate, so a longer stay
 * can never cost more than a shorter one.
 */
export function computePrice(opts: {
  priceHourPaise: number;
  priceDayPaise: number | null;
  start: Date;
  end: Date;
}): number {
  const hours = billedHours(opts.start, opts.end);
  const { priceHourPaise: ph, priceDayPaise: pd } = opts;
  if (pd == null) return hours * ph;
  const fullDays = Math.floor(hours / 24);
  const rest = hours - fullDays * 24;
  return fullDays * pd + Math.min(rest * ph, rest > 0 ? pd : 0);
}

/** Extra amount due when a driver stays past their booked end (after a short grace period). */
export function overstayCharge(priceHourPaise: number, end: Date, now: Date): { minutes: number; paise: number } {
  const over = Math.floor((now.getTime() - end.getTime()) / 60_000);
  if (over <= OVERSTAY_GRACE_MIN) return { minutes: Math.max(0, over), paise: 0 };
  const hours = Math.ceil(over / 60);
  return { minutes: over, paise: Math.round(hours * priceHourPaise * OVERSTAY_MULTIPLIER) };
}
