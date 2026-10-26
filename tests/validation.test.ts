import { describe, expect, it } from "vitest";
import { parseSpaceForm, parseVehicleForm } from "@/lib/validation";
import { parsePlaces } from "@/lib/geocode";

function form(over: Record<string, string | string[]> = {}): FormData {
  const base: Record<string, string | string[]> = {
    title: "Covered bay near the metro",
    description: "Easy to find",
    kind: "apartment",
    area_label: "Indiranagar",
    address_line: "Block B, Green Park Apartments",
    lat: "12.9784",
    lng: "77.6408",
    max_length_cm: "495",
    max_width_cm: "225",
    max_height_cm: "200",
    capacity: "1",
    open_minute: "0",
    close_minute: "1440",
    access_notes: "Gate code 4821",
    price_hour: "50",
    price_day: "300",
    instant_book: "yes",
    days: ["0", "1", "2", "3", "4", "5", "6"],
    amenities: ["covered", "cctv"],
    rights_confirmed: "on",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  return fd;
}

describe("space form validation", () => {
  it("accepts a good listing and converts rupees to paise", () => {
    const r = parseSpaceForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.price_hour_paise).toBe(5000);
    expect(r.data.price_day_paise).toBe(30000);
    expect(r.data.days_mask).toBe(127);
    expect(r.data.instant_book).toBe(true);
    expect(r.data.amenities).toEqual(["covered", "cctv"]);
  });

  it.each([
    [{ title: "ab" }, /title/i],
    [{ kind: "castle" }, /kind of space/i],
    [{ lat: "", lng: "" }, /pin/i],
    [{ lat: "51.5", lng: "-0.12" }, /India/],
    [{ max_width_cm: "20" }, /Width/],
    [{ max_length_cm: "abc" }, /Length/],
    [{ capacity: "0" }, /bays/],
    [{ price_hour: "5" }, /hourly price/],
    [{ price_hour: "-50" }, /hourly price/],
    [{ price_hour: "abc" }, /hourly price/],
    [{ price_hour: "99999" }, /hourly price/],
    [{ price_day: "20" }, /can't be lower/],
    [{ days: [] }, /at least one day/],
    [{ open_minute: "600", close_minute: "600" }, /same/],
    [{ open_minute: "607" }, /quarter hour/],
    [{ rights_confirmed: "" }, /right to rent/],
  ])("rejects %j", (over, message) => {
    const fd = form(over as Record<string, string | string[]>);
    if ((over as Record<string, unknown>).rights_confirmed === "") fd.delete("rights_confirmed");
    const r = parseSpaceForm(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it("ignores unknown amenities and out-of-range days", () => {
    const r = parseSpaceForm(form({ amenities: ["covered", "jacuzzi"], days: ["0", "9", "x"] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.amenities).toEqual(["covered"]);
      expect(r.data.days_mask).toBe(1);
    }
  });

  it("treats an empty daily price as none", () => {
    const r = parseSpaceForm(form({ price_day: "" }));
    expect(r.ok && r.data.price_day_paise).toBeNull();
  });

  it("allows script-looking text but stores it as plain text (React escapes on output)", () => {
    const r = parseSpaceForm(form({ title: "<script>alert(1)</script> bay" }));
    expect(r.ok).toBe(true);
  });
});

describe("vehicle form validation", () => {
  const vf = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ label: "My Swift", kind: "hatchback", length_cm: "385", width_cm: "170", height_cm: "153", plate: "", ...over })) fd.append(k, v);
    return fd;
  };
  it("accepts a normal vehicle", () => expect(parseVehicleForm(vf()).ok).toBe(true));
  it("rejects nonsense", () => {
    expect(parseVehicleForm(vf({ kind: "spaceship" })).ok).toBe(false);
    expect(parseVehicleForm(vf({ width_cm: "5" })).ok).toBe(false);
    expect(parseVehicleForm(vf({ label: "" })).ok).toBe(false);
  });
});

describe("geocoder parsing", () => {
  it("keeps places in India and shortens labels", () => {
    const out = parsePlaces([
      { lat: "12.9975", lon: "77.6963", display_name: "Phoenix Marketcity, Whitefield, Bengaluru, Karnataka, 560048, India" },
      { lat: "51.5", lon: "-0.12", display_name: "London, UK" },
      { lat: "nope", lon: "77", display_name: "Broken" },
      { lat: "13", lon: "77", display_name: "" },
    ]);
    expect(out).toEqual([{ label: "Phoenix Marketcity, Whitefield, Bengaluru", lat: 12.9975, lng: 77.6963 }]);
  });
  it("survives garbage", () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({})).toEqual([]);
    expect(parsePlaces("x")).toEqual([]);
  });
});
