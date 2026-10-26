import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SiteHeader, TabBar } from "@/components/nav";
import { getCurrentUser } from "@/lib/session";
import { navCounts } from "@/lib/services/messages";
import { otpConfig } from "@/lib/otp";

export const metadata: Metadata = {
  title: { default: "SpareSpace: park in a spot someone isn't using", template: "%s · SpareSpace" },
  description:
    "Book a spare parking spot in an apartment block, mall or office before you leave, or earn from the one you aren't using.",
  applicationName: "SpareSpace",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3b2418",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  let counts = { requests: 0, unread: 0 };
  try {
    user = await getCurrentUser();
    if (user) counts = await navCounts(user.id);
  } catch {
    user = null; // database unavailable: render as signed out rather than failing the page
  }
  const demo = otpConfig().provider === "demo" && otpConfig().blockedReason === null;

  return (
    <html lang="en-IN">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-beige focus:px-4 focus:py-2 focus:text-cocoa-950">
          Skip to content
        </a>
        {demo && (
          <div className="bg-beige text-cocoa-950">
            <p className="shell py-1.5 text-center text-sm font-semibold">
              Demo mode: sign-in codes appear on screen because SMS isn&apos;t connected yet. Not for real users.
            </p>
          </div>
        )}
        <SiteHeader signedIn={Boolean(user)} name={user?.nickname ?? null} requests={counts.requests} unread={counts.unread} />
        <main id="main" className="has-tabbar">
          {children}
        </main>
        <footer className="hidden border-t border-cocoa-700 md:block">
          <div className="shell flex items-center justify-between py-6 text-sm text-stone">
            <p>SpareSpace. Spare parking, close to where you&apos;re going.</p>
            <nav aria-label="Footer" className="flex gap-5">
              <Link href="/safety" className="link">Safety and payments</Link>
            </nav>
          </div>
        </footer>
        <TabBar signedIn={Boolean(user)} name={user?.nickname ?? null} requests={counts.requests} unread={counts.unread} />
      </body>
    </html>
  );
}
