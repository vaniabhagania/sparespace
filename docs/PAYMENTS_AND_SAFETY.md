# SpareSpace: payment scheme and loophole review

This is the working paper behind the product. It says what is built today, what each
risk is, and what to add next, in order. "Built" means it is in the code and covered by
tests or the browser run; "Next" means it is a recommendation, not shipped.

## 1. Payment scheme

### Today: pay at the space (cash or UPI), recorded in the app

- The price is fixed when the booking is made (hourly, with an optional day rate that caps long stays).
- The driver pays the host directly, in cash or UPI, when they arrive or leave. SpareSpace never holds money.
- The host records "paid by cash" or "paid by UPI". The driver sees it, and can flag it ("This isn't right"), which opens a report.
- If the host saved a UPI ID, a confirmed driver gets a one-tap `upi://pay` link with the amount filled in. The UPI ID is shown only to a driver with a live booking.
- Overstays: after a 15 minute grace, extra time is 1.5x the hourly rate per started hour. Both people see the running amount.

Why this first: no payment licence, no KYC, no refunds to run, and sign-up stays a mobile number and a code.

Weak spots (these are the reasons to move on, see the loophole table):
- A recorded payment is the host's word. The driver can dispute it, but there is no bank trail inside the app.
- Cash gives SpareSpace no way to take a fee, so any revenue model needs the next phase.
- A no-show costs the host an empty bay and nothing costs the driver except a record on their account.

### Next: in-app UPI payment with release on check-in

1. **Collect at booking** through a gateway that supports UPI and split settlements (Razorpay Route, Cashfree Easy Split or similar). The driver pays the full price plus nothing extra.
2. **Hold until check-in.** The money is released to the host when they enter the driver's arrival code. No code, no release: a fake listing or a host who does not show costs the driver nothing, because the booking is refunded in full.
3. **Fee.** Take a percentage (10 to 15 percent is typical for marketplaces) out of the host's side at settlement. The driver's price never goes up at checkout.
4. **Cancellation.** Free until 2 hours before start. Inside 2 hours the driver forfeits the first hour to the host. A host cancelling a confirmed booking refunds in full and pays a penalty (a credit to the driver and a mark on the host record).
5. **No-show.** After 30 minutes the host marks a no-show: the host keeps the first hour (or 50 percent), the rest is refunded.
6. **Overstay.** A refundable deposit (for example the price of one hour) is authorised at booking, and overstay is charged from it. UPI AutoPay mandates or a card pre-authorisation can hold it.
7. **Keep cash as an option** for hosts who want it, but make it the less attractive path: no fee-free guarantee, no deposit protection, no dispute cover.

Compliance note: holding customer money for a marketplace is regulated in India (RBI payment aggregator rules). The simplest route is to let a licensed gateway do the holding and splitting rather than handling funds yourself. Get advice from a payments lawyer before launch, including GST on the fee.

### Revenue options

| Option | Good | Watch out for |
| --- | --- | --- |
| Percentage of each paid booking, taken from the host | Simple, only earns when hosts earn | Cash bookings leak; fix with in-app incentives |
| Fee on cash bookings billed monthly to the host | Keeps cash, keeps revenue | Chasing small invoices |
| Host subscription for multi-space owners (malls, societies) | Predictable | Needs a sales motion |
| Promoted listing near events and airports | High margin | Only works with density |

## 2. Loopholes and what covers them

Status key: **Built**, **Partly**, **Next**.

| # | Loophole | Who it hurts | What covers it today | Status | What to add |
| --- | --- | --- | --- | --- | --- |
| 1 | Listing a space you do not own or have no right to rent (a flat, society, mall) | Drivers, real owners | "I have the right to rent this out" confirmation, reports, auto-pause after 3 different reporters in 14 days, admin suspend and ban | Partly | Photo of the bay and entrance, a society or management NOC upload, host verification badge, a hold on payouts until first successful stay |
| 2 | Driver books and does not turn up | Host | Arrival code, no-show marking after 30 minutes, no-shows counted and shown to hosts, 2 no-shows removes instant booking | Built | Deposit or no-show fee (section 1) |
| 3 | Host cancels or ghosts a confirmed booking | Driver | Count of cancelled confirmed bookings shown on the listing, requests that are not answered expire after 24 hours | Partly | Penalty and credit for the driver, auto-pause after repeated cancellations |
| 4 | Driver stays past their time | Host, next driver | 15 minute grace then 1.5x hourly, banner for both people, host can report an overstay | Built | Charge from a deposit, reminder before end time |
| 5 | Vehicle is bigger than declared | Host | Size is checked against the bay at booking, the vehicle size is saved on the booking, the host sees it before approving | Partly | Number plate matched at check-in, photo of the vehicle at check-in |
| 6 | Host changes price, size, hours or location after a driver booked | Driver | Price is saved on the booking; size, location, hours and bays are locked while bookings are upcoming | Built | none |
| 7 | Two drivers book the last bay at once | Drivers | Row locks and peak-overlap counting, tested with concurrent bookings | Built | none |
| 8 | Taking the deal off the app (to avoid a future fee, or to scam) | SpareSpace, both people | Phone numbers, emails and UPI IDs are hidden in chat until a booking is confirmed; the address is hidden until then too | Partly | Fee model that makes staying in the app cheaper than leaving, ratings and protection only inside the app |
| 9 | "I paid" / "you did not pay" disputes | Both | Host records the payment, driver can flag it, flagged payments land in the admin queue | Partly | In-app UPI so there is a bank record (section 1) |
| 10 | Fake or traded reviews | Drivers, honest hosts | Only a completed stay (checked in with the arrival code) can be reviewed, one review per stay each way, a 14 day window | Partly | Detect the same pair repeating, weight by distinct drivers, show review counts, remove reviews from banned accounts |
| 11 | Banned person comes back on another number | Everyone | Ban is by number hash and signs the person out everywhere, their spaces are suspended and bookings cancelled | Partly | Deposit-backed bookings make bans cost something, device signals, rate limits on new accounts |
| 12 | OTP abuse and SMS pumping | SpareSpace (cost) | Limits per number (3 per 10 minutes, 8 per day) and per network address (15 per hour), codes expire in 5 minutes, work once, 5 tries | Built | Provider fraud guard, restrict to India numbers (already enforced), CAPTCHA if abuse appears |
| 13 | A host's home address exposed to everyone | Hosts | Searches and map show about 100 m accuracy until a booking is confirmed; access notes hidden too | Built | none |
| 14 | Harassment and stalking | Both | No numbers shared, chat is inside the app, reports, ban | Partly | Block button, report from inside a chat |
| 15 | Damage, theft or injury at a space | Driver, host | Reviews and reports only | **Next** | Terms of use that say who is responsible, partner insurance, photo evidence at check-in and check-out |
| 16 | A listing that stops being true (a gate now locked, a builder blocks the entrance) | Drivers | Reports and auto-pause | Partly | Ask hosts to re-confirm availability every 90 days |
| 17 | Rental in a residential society against its by-laws | Host | Confirmation checkbox puts the duty on the host | Partly | Clear guidance on getting the association's written OK; society-level partnerships |
| 18 | Someone scrapes the map for host locations | Hosts | Location is rounded for everyone who is not confirmed; search is rate limited | Partly | Tighter limits on search volume per account |
| 19 | Account data kept longer than needed | Users | Only a scrambled number is stored; account deletion removes name, UPI ID, vehicles, plates and chats and frees the number | Built | Retention schedule for old bookings |

## 3. Privacy design in one place

- Sign-in is a mobile number and a one-time code. The number is turned into a keyed hash (HMAC-SHA256 with a secret pepper) and the number itself is never stored.
- No email, no password, no ID. The visible name is a nickname or "Guest xxxx".
- Other people never see a phone number: chat, the arrival code and reviews all happen inside the app.
- Because the number is not stored, the app cannot text a user outside the sign-in flow. Notifications in future should use web push or the provider's session, not stored numbers.
- If the pepper (`PHONE_PEPPER`) is lost or changed, every existing user can no longer be matched to their account. Treat it like a database key: back it up, never rotate it casually.

## 4. Running it safely

- **Demo OTP mode** shows the sign-in code on screen. It exists only so the app can be tried before an SMS provider is connected. Anyone can sign in as anyone who has not signed in yet. Never use it with real people. Production refuses to start in this mode unless `ALLOW_DEMO_OTP=true` is set on purpose, and the site shows a banner while it is on.
- Connect a real provider (`OTP_PROVIDER=twilio` with Twilio Verify) before sharing the link. In India, check DLT registration requirements for the SMS route you pick.
- Set `ADMIN_TOKEN` (16 or more characters) to switch on `/admin`, and keep it secret.
- Set `SESSION_SECRET` and `PHONE_PEPPER` to long random values and never commit them.
