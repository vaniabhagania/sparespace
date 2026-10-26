import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SetupNeeded } from "@/components/setup-needed";
import { isDbConfigured } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { requireUser } from "@/lib/session";
import { getSpaceView } from "@/lib/services/spaces";
import { COMPLAINT_CATEGORIES } from "@/lib/services/types";
import { reportSpaceAction } from "../actions";

export const metadata: Metadata = { title: "Report a listing" };

const LISTING_CATEGORIES = ["fake_listing", "wrong_details", "unsafe", "behaviour", "other"];

export default async function ReportSpacePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return <SetupNeeded />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/spaces/${id}/report`);
  const space = await getSpaceView(id, user.id);
  if (!space || space.host_id === user.id) notFound();

  return (
    <div className="shell py-8 md:py-12">
      <div className="mx-auto max-w-xl">
        <Link href={`/spaces/${id}`} className="link text-sm">Back to the space</Link>
        <h1 className="mt-3 text-[clamp(2.2rem,7vw,3.4rem)]">Report this listing</h1>
        <p className="mt-2 text-stone">About <span className="text-cream">{space.title}</span>. A person reads every report. If several drivers report the same problem, the listing is paused until we look at it.</p>
        <ActionForm action={reportSpaceAction} className="panel mt-6 grid gap-5">
          <input type="hidden" name="space_id" value={id} />
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="label">What went wrong?</legend>
            <div className="grid gap-2">
              {COMPLAINT_CATEGORIES.filter((c) => LISTING_CATEGORIES.includes(c.id)).map((c) => (
                <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-cocoa-700/60">
                  <input type="radio" name="category" value={c.id} required />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="rp-details">Tell us what happened</label>
            <textarea id="rp-details" name="details" className="field" required minLength={10} maxLength={1000} placeholder="What you saw, when, and anything that would help us check." />
            <p className="hint">Please don&apos;t include phone numbers or personal details.</p>
          </div>
          <SubmitButton className="btn btn-primary btn-block" pendingText="Sending…">Send report</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
