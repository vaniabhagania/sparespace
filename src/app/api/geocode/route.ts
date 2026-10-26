import { NextResponse } from "next/server";
import { geocode } from "@/lib/geocode";
import { hit } from "@/lib/rate-limit";
import { clientIpHash } from "@/lib/session";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 3) return NextResponse.json({ places: [] });
  try {
    const rl = await hit(`geocode:${await clientIpHash()}`, 40, 60);
    if (!rl.allowed) {
      return NextResponse.json({ places: [], error: "Slow down a little." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    }
    const places = await geocode(q);
    return NextResponse.json({ places }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ places: [], error: "Place search isn't available right now." }, { status: 503 });
  }
}
