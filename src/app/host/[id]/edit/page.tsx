import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupNeeded } from "@/components/setup-needed";
import { Notice } from "@/components/status";
import { daysFromMask } from "@/lib/availability";
import { db, isDbConfigured } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { paiseToRupeesInput } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { getSpaceView } from "@/lib/services/spaces";
import { SpaceForm } from "../../space-form";

export const metadata: Metadata = { title: "Edit your space" };

export default async function EditSpacePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/host/${id}/edit`);
  const s = await getSpaceView(id, user.id);
  if (!s || s.host_id !== user.id) notFound();
  const upcoming = await db.query(
    `select 1 from bookings where space_id = $1 and end_at > now()
        and (status in ('confirmed','checked_in') or (status = 'pending' and expires_at > now())) limit 1`,
    [id],
  );

  return (
    <div className="shell py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/host" className="link text-sm">Back to hosting</Link>
        <h1 className="mt-3 text-[clamp(2.4rem,7vw,3.8rem)]">Edit your space</h1>
        {s.status === "suspended" ? (
          <div className="mt-6"><Notice tone="error">This space is suspended while we look into a report, so it can&apos;t be edited right now.</Notice></div>
        ) : (
          <div className="mt-8">
            <SpaceForm
              locked={upcoming.length > 0}
              initial={{
                id: s.id, title: s.title, description: s.description, kind: s.kind, area_label: s.area_label,
                address_line: s.address_line, lat: s.lat, lng: s.lng,
                max_length_cm: s.max_length_cm, max_width_cm: s.max_width_cm, max_height_cm: s.max_height_cm,
                capacity: s.capacity, price_hour: paiseToRupeesInput(s.price_hour_paise), price_day: paiseToRupeesInput(s.price_day_paise),
                instant_book: s.instant_book, days: daysFromMask(s.days_mask), open_minute: s.open_minute, close_minute: s.close_minute,
                access_notes: s.access_notes, amenities: s.amenities,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
