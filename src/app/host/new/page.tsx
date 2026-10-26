import type { Metadata } from "next";
import Link from "next/link";
import { SetupNeeded } from "@/components/setup-needed";
import { isDbConfigured } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EMPTY_SPACE, SpaceForm } from "../space-form";

export const metadata: Metadata = { title: "List a space" };

export default async function NewSpacePage() {
  if (!isDbConfigured()) return <SetupNeeded />;
  await requireUser("/host/new");
  return (
    <div className="shell py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/host" className="link text-sm">Back to hosting</Link>
        <h1 className="mt-3 text-[clamp(2.4rem,7vw,3.8rem)]">List a spare space</h1>
        <p className="mt-2 mb-8 text-stone">Takes about three minutes. You can pause or edit it any time.</p>
        <SpaceForm initial={EMPTY_SPACE} />
      </div>
    </div>
  );
}
