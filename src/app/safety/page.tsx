import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Safety and payments",
  description: "How SpareSpace handles payments, protects drivers and hosts, and keeps your number private.",
};

const sections: { id: string; title: string; lead: string; points: string[] }[] = [
  {
    id: "pay",
    title: "How you pay",
    lead: "Right now you pay the host directly, in cash or UPI, at the space. SpareSpace never holds your money.",
    points: [
      "The price is fixed when you book. You see the total before you confirm, and it can't change afterwards, even if the host edits the listing.",
      "Stays are billed per started hour. If the host set a day rate, a long stay never costs more than the day rate for each day.",
      "Stay past your time by more than 15 minutes and the host can charge 1.5× the hourly rate for the extra time. The app shows the running amount to both of you.",
      "The host records the payment (cash or UPI) in the app. You can see it, and if it's wrong, tap “This isn't right”. That opens a report for us to review.",
      "Hosts who add a UPI ID get a one-tap pay button for confirmed drivers. The ID is shown only to a driver with a live booking.",
    ],
  },
  {
    id: "drivers",
    title: "If you're parking",
    lead: "You should know the space is real, fits, and is waiting for you.",
    points: [
      "Every space is drawn to scale against your vehicle, and spaces your vehicle doesn't fit are hidden.",
      "The exact address and entry notes unlock when your booking is confirmed. Until then you only see the area.",
      "Hosts can't change a space's size, location, hours or number of bays while it has upcoming bookings.",
      "Only drivers who actually parked, checked in with the host, can review a space. Nobody can review a stay that didn't happen.",
      "If three different drivers report the same listing as fake, unsafe or wrong, it's paused until a person looks at it.",
      "If a host cancels a confirmed booking, it's recorded on their profile, where the next driver sees it.",
    ],
  },
  {
    id: "hosts",
    title: "If you're hosting",
    lead: "You decide who parks, for how long, and what it costs.",
    points: [
      "Every booking comes with a 4-digit arrival code known only to the driver. Entering it when they arrive is your proof they showed up.",
      "Before approving, you see the driver's completed stays, rating, no-shows and late cancellations.",
      "If a driver hasn't turned up 30 minutes after their start time, you can free the bay and mark a no-show. Drivers with repeated no-shows can no longer book instantly.",
      "Requests that you don't answer lapse after 24 hours, so drivers aren't left waiting.",
      "Your address stays private until you've accepted the booking. Chats hide phone numbers and UPI IDs until then.",
      "You can pause a space at any time. Bookings already confirmed stay confirmed, so pause early.",
    ],
  },
  {
    id: "privacy",
    title: "Your privacy",
    lead: "You sign in with a mobile number and a code. That's all we ask for.",
    points: [
      "We don't store your number. We keep a scrambled version that can recognise you next time, but can't be turned back into the number.",
      "No email, no password, no ID. Your name is whatever you choose, or a guest label.",
      "Other people never see your number. Chat, the arrival code and reviews all happen inside the app.",
      "You can delete your account any time from the Account page. Your name, UPI ID, vehicles and chats are removed.",
    ],
  },
  {
    id: "rules",
    title: "House rules",
    lead: "Short and fair.",
    points: [
      "List only a space you own or have permission to rent out. A flat or society needs your association or landlord to be fine with it. A mall or office needs management's go-ahead.",
      "Describe the space honestly, including the size and anything that makes entry awkward.",
      "Arrive on time, leave on time, and cancel early if plans change.",
      "Don't use the chat to take payments or deals outside the app before a booking is confirmed.",
      "Be kind. Rude or unsafe behaviour gets accounts removed.",
    ],
  },
];

export default function SafetyPage() {
  return (
    <div className="shell py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[clamp(2.6rem,8vw,4.5rem)]">Safety and payments</h1>
        <p className="mt-3 text-lg text-cream/90 measure">How the money works, what protects you, and what we do and don&apos;t know about you.</p>

        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="chip chip-outline min-h-9 px-3 no-underline hover:border-beige hover:text-beige">{s.title}</a>
          ))}
        </nav>

        <div className="mt-8 grid gap-0">
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="border-t-2 border-dashed border-cocoa-600 py-8">
              <h2 id={`${s.id}-h`}>{s.title}</h2>
              <p className="mt-2 text-lg measure">{s.lead}</p>
              <ul className="mt-4 grid gap-2.5 text-cream/90 measure">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-beige" aria-hidden="true" /><span>{p}</span></li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section aria-labelledby="next-h" className="border-t-2 border-dashed border-cocoa-600 py-8">
          <h2 id="next-h">What&apos;s coming</h2>
          <p className="mt-2 text-lg measure">Pay-at-the-space keeps things simple while SpareSpace is small. Next, in this order:</p>
          <ul className="mt-4 grid gap-2.5 text-cream/90 measure">
            {[
              "Paying by UPI inside the app, with the money held until the driver checks in, so a no-show or a fake listing never costs you.",
              "A small refundable deposit for drivers, kept by the host if the driver doesn't turn up.",
              "A service fee taken from the host's side of each paid booking, never added on top of the driver's price.",
              "Optional verification for hosts, shown as a badge on their listings.",
            ].map((p) => (
              <li key={p} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-beige" aria-hidden="true" /><span>{p}</span></li>
            ))}
          </ul>
        </section>

        <p className="border-t-2 border-dashed border-cocoa-600 pt-8 text-stone">
          Something not right? Use &ldquo;Report&rdquo; on any space or booking, or <Link className="link" href="/">go back to finding a space</Link>.
        </p>
      </div>
    </div>
  );
}
