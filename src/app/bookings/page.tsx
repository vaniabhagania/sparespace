import type { Metadata } from "next";
import Link from "next/link";
import { SetupNeeded } from "@/components/setup-needed";
import { StatusBadge } from "@/components/status";
import { isDbConfigured } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { listDriverBookings } from "@/lib/services/bookings";
import { formatRange } from "@/lib/time";

export const metadata: Metadata = { title: "Your trips" };

const LIVE = new Set(["pending", "confirmed", "checked_in"]);

export default async function TripsPage() {
  if (!isDbConfigured()) return <SetupNeeded />;
  const user = await requireUser("/bookings");
  const all = await listDriverBookings(user.id);
  const upcoming = all.filter((b) => LIVE.has(b.status)).sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
  const past = all.filter((b) => !LIVE.has(b.status));

  const Row = ({ b }: { b: (typeof all)[number] }) => (
    <li className="panel relative transition-colors hover:bg-cocoa-700/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.6rem]">
            <Link href={`/bookings/${b.id}`} className="no-underline after:absolute after:inset-0 after:content-['']">{b.space_title}</Link>
          </h3>
          <p className="mt-1 text-sm text-stone">{b.area_label}</p>
          <p className="mt-1 text-[0.97rem]">{formatRange(new Date(b.start_at), new Date(b.end_at))}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={b.status} />
          <span className="font-display text-2xl font-extrabold leading-none">{formatINR(b.price_paise)}</span>
        </div>
      </div>
    </li>
  );

  return (
    <div className="shell py-8 md:py-12">
      <h1 className="text-[clamp(2.4rem,7vw,4rem)]">Your trips</h1>
      {all.length === 0 ? (
        <div className="panel mt-6 max-w-xl">
          <h2 className="text-3xl">No trips yet</h2>
          <p className="mt-2 text-stone">When you book a space, your arrival code and the exact address show up here.</p>
          <Link href="/" className="btn btn-primary mt-4">Find a space</Link>
        </div>
      ) : (
        <div className="mt-6 grid max-w-3xl gap-8">
          {upcoming.length > 0 && (
            <section aria-labelledby="up-h">
              <h2 id="up-h" className="text-3xl">Coming up</h2>
              <ul className="mt-3 grid gap-3">{upcoming.map((b) => <Row key={b.id} b={b} />)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past-h">
              <h2 id="past-h" className="text-3xl">Past</h2>
              <ul className="mt-3 grid gap-3">{past.map((b) => <Row key={b.id} b={b} />)}</ul>
            </section>
          )}
        </div>
      )}
      <p className="mt-8 text-sm text-stone">Hosting a space? Requests and earnings are on the <Link href="/host" className="link">Host page</Link>.</p>
    </div>
  );
}
