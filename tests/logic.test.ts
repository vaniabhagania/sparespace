import { describe, expect, it } from "vitest";
import { parseIstInput, toIstInput, istParts, isQuarterHour, formatTime } from "@/lib/time";
import { computePrice, overstayCharge, billedHours } from "@/lib/pricing";
import { isAvailable, isOpenAt, maskFromDays, describeSchedule } from "@/lib/availability";
import { checkFit, VEHICLE_PRESETS, BAY_PRESETS } from "@/lib/fit";
import { normalizePhone, hashPhone, maskPhone } from "@/lib/phone";
import { maskContactDetails, safeNext, HIDDEN_CONTACT } from "@/lib/text";
import { rupeesToPaise, formatINR } from "@/lib/money";
import { approximatePoint, haversineKm } from "@/lib/geo";

const ist = (s: string) => {
  const d = parseIstInput(s);
  if (!d) throw new Error("bad test date " + s);
  return d;
};

describe("time (India Standard Time)", () => {
  it("round-trips datetime-local values", () => {
    const d = ist("2026-10-27T09:30");
    expect(d.toISOString()).toBe("2026-10-27T04:00:00.000Z");
    expect(toIstInput(d)).toBe("2026-10-27T09:30");
  });
  it("rejects impossible dates and bad formats", () => {
    expect(parseIstInput("2026-02-31T10:00")).toBeNull();
    expect(parseIstInput("2026-10-27T25:00")).toBeNull();
    expect(parseIstInput("2026-10-27 10:00")).toBeNull();
    expect(parseIstInput("tomorrow")).toBeNull();
  });
  it("computes weekday with Monday = 0", () => {
    expect(istParts(ist("2026-10-26T12:00")).weekday).toBe(0); // 26 Oct 2026 is a Monday
    expect(istParts(ist("2026-11-01T12:00")).weekday).toBe(6); // Sunday
  });
  it("handles the date boundary between UTC and IST", () => {
    const d = ist("2026-10-27T01:00"); // 19:30 UTC on the 26th
    expect(istParts(d).day).toBe(27);
  });
  it("detects quarter hours", () => {
    expect(isQuarterHour(ist("2026-10-27T09:15"))).toBe(true);
    expect(isQuarterHour(ist("2026-10-27T09:10"))).toBe(false);
  });
  it("formats time in lower case", () => {
    expect(formatTime(ist("2026-10-27T18:05"))).toMatch(/6:05\s?pm/);
  });
});

describe("pricing", () => {
  const start = ist("2026-10-27T09:00");
  it("bills per started hour with a one hour minimum", () => {
    expect(billedHours(start, ist("2026-10-27T09:10"))).toBe(1);
    expect(billedHours(start, ist("2026-10-27T10:00"))).toBe(1);
    expect(billedHours(start, ist("2026-10-27T10:01"))).toBe(2);
  });
  it("hourly only", () => {
    expect(computePrice({ priceHourPaise: 5000, priceDayPaise: null, start, end: ist("2026-10-27T13:00") })).toBe(20000);
  });
  it("caps a partial day at the day rate", () => {
    const end = ist("2026-10-27T21:00"); // 12h * 50 = 600 > day 400
    expect(computePrice({ priceHourPaise: 5000, priceDayPaise: 40000, start, end })).toBe(40000);
  });
  it("charges full days at the day rate plus a capped remainder", () => {
    const end = ist("2026-10-29T12:00"); // 51h = 2 days + 3h
    expect(computePrice({ priceHourPaise: 5000, priceDayPaise: 40000, start, end })).toBe(2 * 40000 + 3 * 5000);
  });
  it("a longer stay never costs less than a shorter one", () => {
    let prev = 0;
    for (let h = 1; h <= 100; h++) {
      const end = new Date(start.getTime() + h * 3_600_000);
      const p = computePrice({ priceHourPaise: 5000, priceDayPaise: 30000, start, end });
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
  it("overstay: nothing inside the grace period, 1.5x per started hour after", () => {
    const end = ist("2026-10-27T10:00");
    expect(overstayCharge(5000, end, ist("2026-10-27T10:10")).paise).toBe(0);
    expect(overstayCharge(5000, end, ist("2026-10-27T10:30")).paise).toBe(7500);
    expect(overstayCharge(5000, end, ist("2026-10-27T11:30")).paise).toBe(15000);
  });
});

describe("availability", () => {
  const always = { days_mask: 127, open_minute: 0, close_minute: 1440 };
  const weekdays9to6 = { days_mask: maskFromDays([0, 1, 2, 3, 4]), open_minute: 540, close_minute: 1080 };
  const nights = { days_mask: 127, open_minute: 1200, close_minute: 360 }; // 8pm to 6am

  it("always open", () => {
    expect(isAvailable(always, ist("2026-10-27T03:00"), ist("2026-10-29T03:00"))).toBe(true);
  });
  it("weekday office hours", () => {
    expect(isAvailable(weekdays9to6, ist("2026-10-27T10:00"), ist("2026-10-27T18:00"))).toBe(true);
    expect(isAvailable(weekdays9to6, ist("2026-10-27T10:00"), ist("2026-10-27T18:15"))).toBe(false);
    expect(isAvailable(weekdays9to6, ist("2026-10-31T10:00"), ist("2026-10-31T12:00"))).toBe(false); // Saturday
    expect(isAvailable(weekdays9to6, ist("2026-10-30T17:00"), ist("2026-10-31T10:00"))).toBe(false); // spans Sat
  });
  it("overnight window", () => {
    expect(isAvailable(nights, ist("2026-10-27T21:00"), ist("2026-10-28T05:00"))).toBe(true);
    expect(isAvailable(nights, ist("2026-10-27T19:45"), ist("2026-10-28T05:00"))).toBe(false);
    expect(isAvailable(nights, ist("2026-10-27T21:00"), ist("2026-10-28T06:15"))).toBe(false);
    expect(isAvailable(nights, ist("2026-10-27T12:00"), ist("2026-10-27T13:00"))).toBe(false);
  });
  it("overnight window honours the day the window starts on", () => {
    const monNights = { days_mask: maskFromDays([0]), open_minute: 1200, close_minute: 360 };
    expect(isOpenAt(monNights, ist("2026-10-27T02:00"))).toBe(true); // Tue 2am belongs to Monday's window
    expect(isOpenAt(monNights, ist("2026-10-28T02:00"))).toBe(false); // Wed 2am does not
    expect(isOpenAt(monNights, ist("2026-10-27T22:00"))).toBe(false); // Tue 10pm is Tuesday's window
  });
  it("describes schedules in plain words", () => {
    expect(describeSchedule(always)).toBe("Every day, any time");
    expect(describeSchedule(weekdays9to6)).toBe("Mon to Fri, 9 am to 6 pm");
    expect(describeSchedule(nights)).toContain("overnight");
  });
});

describe("vehicle fit", () => {
  it("reports each axis", () => {
    const r = checkFit(VEHICLE_PRESETS.suv.dims, { max_length_cm: 440, max_width_cm: 215, max_height_cm: 200 });
    expect(r.fits).toBe(false);
    expect(r.reasons).toEqual(["40 cm too long"]);
    expect(r.clearance.width_cm).toBe(25);
  });
  it("bay presets fit the vehicle they are named for", () => {
    const pairs: [string, keyof typeof VEHICLE_PRESETS][] = [
      ["bike", "bike"], ["hatchback", "hatchback"], ["sedan", "sedan"], ["suv", "suv"], ["van", "van"],
    ];
    for (const [bay, veh] of pairs) {
      const b = BAY_PRESETS.find((x) => x.id === bay)!;
      expect(checkFit(VEHICLE_PRESETS[veh].dims, {
        max_length_cm: b.dims.length_cm, max_width_cm: b.dims.width_cm, max_height_cm: b.dims.height_cm,
      }).fits).toBe(true);
    }
  });
});

describe("phone handling", () => {
  it("normalises Indian mobiles", () => {
    for (const v of ["9876543210", "98765 43210", "+91 98765-43210", "919876543210", "09876543210"]) {
      expect(normalizePhone(v)).toBe("+919876543210");
    }
  });
  it("rejects everything else", () => {
    for (const v of ["", "12345", "5876543210", "+14155552671", "98765432101", "abcdefghij", "+91 12345 67890"]) {
      expect(normalizePhone(v)).toBeNull();
    }
  });
  it("hashes deterministically and never leaks the number", () => {
    const h = hashPhone("+919876543210");
    expect(h).toBe(hashPhone("+919876543210"));
    expect(h).not.toContain("9876543210");
    expect(h).toHaveLength(64);
    expect(hashPhone("+919876543211")).not.toBe(h);
  });
  it("masks for display", () => {
    expect(maskPhone("+919876543210")).toContain("210");
    expect(maskPhone("+919876543210")).not.toContain("98765");
  });
});

describe("chat masking and redirects", () => {
  it("hides phone numbers, emails and UPI ids", () => {
    for (const s of ["call 98765 43210", "+91-9876543210 pls", "mail me a.b@gmail.com", "pay ravi@okhdfc"]) {
      const r = maskContactDetails(s);
      expect(r.masked).toBe(true);
      expect(r.text).toContain(HIDDEN_CONTACT);
    }
  });
  it("leaves normal messages alone", () => {
    const r = maskContactDetails("I'll arrive around 7:30 in a white Swift, level B2");
    expect(r.masked).toBe(false);
  });
  it("only allows same-site redirects", () => {
    expect(safeNext("/bookings/1")).toBe("/bookings/1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad as string)).toBe("/");
    }
  });
});

describe("money and geo", () => {
  it("parses rupee amounts", () => {
    expect(rupeesToPaise("120")).toBe(12000);
    expect(rupeesToPaise("1,200.50")).toBe(120050);
    expect(rupeesToPaise("₹75")).toBe(7500);
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("1e5")).toBeNull();
  });
  it("formats rupees", () => {
    expect(formatINR(12000)).toBe("₹120");
    expect(formatINR(12050)).toBe("₹120.50");
    expect(formatINR(12345600)).toBe("₹1,23,456");
  });
  it("approximates locations to roughly 100 m", () => {
    const a = approximatePoint(12.934567, 77.612345);
    expect(a).toEqual({ lat: 12.935, lng: 77.612 });
    expect(haversineKm({ lat: 12.934567, lng: 77.612345 }, a) * 1000).toBeLessThan(120);
  });
  it("distance sanity: Bengaluru to Chennai is about 290 km", () => {
    const d = haversineKm({ lat: 12.9716, lng: 77.5946 }, { lat: 13.0827, lng: 80.2707 });
    expect(d).toBeGreaterThan(280);
    expect(d).toBeLessThan(300);
  });
});
