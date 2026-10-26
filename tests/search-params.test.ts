import { describe, expect, it } from "vitest";
import { resolveWindow } from "@/lib/search-params";
import { parseIstInput } from "@/lib/time";

// 2026-10-26 10:00 IST
const NOW = parseIstInput("2026-10-26T10:00")!;

describe("resolveWindow", () => {
  it("keeps a valid future window", () => {
    const w = resolveWindow("2026-10-26T14:00", "2026-10-26T17:00", NOW);
    expect(w.startInput).toBe("2026-10-26T14:00");
    expect(w.endInput).toBe("2026-10-26T17:00");
    expect(w.adjusted).toBeNull();
  });
  it("falls back to a default slot when times are missing or garbage", () => {
    const a = resolveWindow(undefined, undefined, NOW);
    expect(a.adjusted).toBeNull();
    expect(a.end.getTime() - a.start.getTime()).toBe(2 * 3_600_000);
    const b = resolveWindow("nope", "2026-13-45T99:99", NOW);
    expect(b.adjusted).toMatch(/couldn't read/);
  });
  it("moves a stale link forward and says so", () => {
    const w = resolveWindow("2026-10-20T09:00", "2026-10-20T12:00", NOW);
    expect(w.start.getTime()).toBeGreaterThan(NOW.getTime());
    expect(w.adjusted).toMatch(/already passed/);
    expect(w.end.getTime() - w.start.getTime()).toBe(3 * 3_600_000);
  });
  it("enforces the one hour minimum", () => {
    const w = resolveWindow("2026-10-26T14:00", "2026-10-26T14:30", NOW);
    expect(w.end.getTime() - w.start.getTime()).toBe(3_600_000);
    expect(w.adjusted).toMatch(/minimum stay/);
  });
  it("rounds odd minutes up to the quarter hour", () => {
    const w = resolveWindow("2026-10-26T14:07", "2026-10-26T16:01", NOW);
    expect(w.startInput).toBe("2026-10-26T14:15");
    expect(w.endInput).toBe("2026-10-26T16:15");
  });
  it("never produces an end before the start", () => {
    const w = resolveWindow("2026-10-26T14:00", "2026-10-26T12:00", NOW);
    expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
  });
});
