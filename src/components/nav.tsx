"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChat, IconHost, IconSearch, IconTrips, IconUser, Mark } from "./icons";

interface Props {
  signedIn: boolean;
  name: string | null;
  requests: number;
  unread: number;
}

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" || path.startsWith("/search") || path.startsWith("/spaces") : path === href || path.startsWith(href + "/");

function Badge({ n, label }: { n: number; label: string }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1.5 inline-grid min-w-5 h-5 place-items-center rounded-full bg-beige px-1 text-xs font-bold text-cocoa-950">
      <span aria-hidden="true">{n > 9 ? "9+" : n}</span>
      <span className="sr-only">{`${n} ${label}`}</span>
    </span>
  );
}

export function SiteHeader({ signedIn, name, requests, unread }: Props) {
  const path = usePathname();
  const links = [
    { href: "/", label: "Find a space", badge: null },
    { href: "/host", label: "Host", badge: signedIn ? <Badge n={requests} label="requests waiting" /> : null },
    { href: "/bookings", label: "Trips", badge: null },
    { href: "/messages", label: "Messages", badge: signedIn ? <Badge n={unread} label="unread" /> : null },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-cocoa-700 bg-cocoa-900/95 backdrop-blur supports-[backdrop-filter]:bg-cocoa-900/85">
      <div className="shell flex h-[var(--nav-h)] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 no-underline" aria-label="SpareSpace home">
          <Mark />
          <span className="font-display text-[1.65rem] font-extrabold leading-none">SpareSpace</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg px-3.5 text-[0.98rem] font-semibold no-underline transition-colors ${
                isActive(path, l.href) ? "bg-cocoa-800 text-beige" : "text-cream hover:text-beige"
              }`}
            >
              {l.label}
              {l.badge}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/account" className="btn btn-ghost btn-sm" aria-label="Your account">
              <IconUser width={18} height={18} />
              <span className="max-w-28 truncate">{name ?? "Account"}</span>
            </Link>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function TabBar({ signedIn, requests, unread }: Props) {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Find", icon: <IconSearch />, n: 0, what: "" },
    { href: "/host", label: "Host", icon: <IconHost />, n: signedIn ? requests : 0, what: "requests waiting" },
    { href: "/bookings", label: "Trips", icon: <IconTrips />, n: 0, what: "" },
    { href: "/messages", label: "Chat", icon: <IconChat />, n: signedIn ? unread : 0, what: "unread" },
    { href: signedIn ? "/account" : "/login", label: signedIn ? "Me" : "Sign in", icon: <IconUser />, n: 0, what: "" },
  ];
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cocoa-700 bg-cocoa-950/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((t) => {
          const active = isActive(path, t.href);
          return (
            <li key={t.label}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[0.75rem] font-semibold no-underline ${
                  active ? "text-beige" : "text-stone"
                }`}
              >
                <span className="relative">
                  {t.icon}
                  {t.n > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-beige px-1 text-[0.65rem] font-bold text-cocoa-950">
                      <span aria-hidden="true">{t.n > 9 ? "9+" : t.n}</span>
                      <span className="sr-only">{`${t.n} ${t.what}`}</span>
                    </span>
                  )}
                </span>
                {t.label}
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-beige" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
