# SpareSpace

Park in a spot someone isn't using. Drivers search near where they're going, see the bay drawn to
scale against their own vehicle, book it, and pay the host at the space (cash or UPI). Hosts list a
spare bay in an apartment block, mall, office or driveway and set their own hours and price.

- Sign-in is a mobile number and a one-time code. The number is never stored, only a keyed hash.
- Money is cash or UPI at the space by default. The app records who paid what. See [docs/PAYMENTS_AND_SAFETY.md](docs/PAYMENTS_AND_SAFETY.md) for the payment plan, the loophole review, and what to build next.

## What's in it

| Area | What it does |
| --- | --- |
| Search | Place, time and vehicle. Hides spaces your vehicle doesn't fit, shows why others were left out, map with price pins |
| Space page | Bay drawn to scale against your vehicle, hours, price, reviews, host record, message host, report |
| Booking | Instant or host-approved, price locked at booking, 4-digit arrival code, exact address unlocks once confirmed |
| Host | List, edit, pause; requests with the driver's record; check-in by code; no-show; record payment; earnings |
| Trust | Reviews only after a checked-in stay, reports, auto-pause after 3 reporters, admin ban or suspend |
| Account | Nickname, UPI ID, vehicles, sign out everywhere, delete account |
| Safety page | Plain-language explanation of payments and protections at `/safety` |

## Stack

Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4, Postgres (`pg`), Leaflet and
OpenStreetMap for maps, Nominatim for place search, Vitest for tests.

## Run it locally

You need Node 22+ and a Postgres database.

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

Tables are created automatically the first time the app talks to the database (migrations run once, under a lock).

### Environment variables

| Name | Required | Notes |
| --- | --- | --- |
| `POSTGRES_URL` | yes | Any Postgres connection string. `DATABASE_URL` also works. |
| `SESSION_SECRET` | yes in production | 32+ random characters. Signs login cookies. |
| `PHONE_PEPPER` | yes in production | 32+ random characters. Keys the phone-number hash. Don't lose or rotate it. |
| `OTP_PROVIDER` | yes | `twilio` or `demo` |
| `ALLOW_DEMO_OTP` | demo only | Must be `true` for `demo` to run in production. Never use with real users. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | with `twilio` | Twilio Verify service |
| `ADMIN_TOKEN` | optional | 16+ characters. Switches on `/admin`. |
| `PG_SSL_CA` | optional | PEM text of a CA certificate, if your database uses a private CA |
| `PG_SSL_INSECURE` | optional | `1` skips certificate checks. Last resort. |

## Deploy to Vercel

1. Import this repo as a new Vercel project (framework: Next.js, nothing else to set).
2. Add a Postgres database from the Vercel Marketplace (Neon or Supabase) and connect it to the project. This sets `POSTGRES_URL`.
3. Add `SESSION_SECRET`, `PHONE_PEPPER`, `OTP_PROVIDER` and the provider settings (and `ADMIN_TOKEN` if you want the admin page).
4. Deploy. The first request creates the tables.

## Tests

```bash
npm test                # needs a Postgres at TEST_POSTGRES_URL (default postgres://postgres@127.0.0.1:54329/sparespace_test)
npm run typecheck
```

The suite covers pricing, availability (including overnight windows), vehicle fit, phone handling, OTP rules,
form validation, and the booking engine against a real Postgres, including concurrent bookings of the last bay.

## Known limits

- SMS depends on Twilio Verify, which is untested against live SMS from this repo until you add credentials.
- Place search uses the public Nominatim service, which has a usage policy and is fine for a launch, not for heavy traffic. Swap in a paid geocoder when you grow.
- Map tiles come from openstreetmap.org, with the same note.
- India only for now (phone numbers, map bounds, India Standard Time).
- No insurance, no photo upload, no in-app payments yet. The roadmap is in the payments document.
