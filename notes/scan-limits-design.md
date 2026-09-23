# The scan limits — how they work, before any of it is built

Written 2026-09-23. The numbers are his (`notes/pricing-and-limits.md`); this is the
mechanism. Nothing here is switched on: the migration is written but not run, and the
counting ships behind a flag that is off.

## The numbers, restated

| | Free |
|---|---|
| First 7 days of a new account | **300 a day**, and the monthly cap does not apply |
| After that | **50 a day** |
| In a calendar month | **600**, with **one top-up of another 600**, once per month |
| Photographs kept | **3 months**, then emailed in one PDF and deleted |
| The record | kept for ever |

The most a free account can cost in a month is therefore 1,200 documents, which is pennies.
The cap exists to stop the app being used as a free bulk reader, not to ration a tradesman.

## What counts as one scan

**One document read by the AI.** Not one page, not one photograph, not one tap.

- A PDF of six pages read as one invoice is **one**.
- One photograph holding two receipts side by side is **two**, because two documents come
  back from it.
- A retry after a failed read is **not counted**. Nobody should pay for our mistake, and it
  would punish exactly the hard documents we most want people to try.
- **Copy a document is not counted at all.** Nothing is read; the pages go straight to a PDF
  on the device. Same for Change a file.
- Typing an invoice by hand is not a scan.

## Where it is counted

**On the server, inside the routes that actually call the AI** — `/api/scan`,
`/api/invoice-template`, `/api/contact-scan` — and nowhere else. Counting in the browser
would be a lock with the key taped to it: the camera, the upload button and the batch
walker all end at those routes, so that is the only honest place.

The count is taken **after** a successful read, for the number of documents that came back.
A read that throws, times out, or returns nothing costs nothing.

## The day and the month

**Europe/London, not UTC.** The app already learned this the hard way (`CLAUDE.md`, "What
day it is"): for the hour after midnight on a summer night, UTC still thinks it is
yesterday. A limit that resets an hour early — or late — on half the year is a bug people
would feel and never be able to explain. The database function uses
`(now() at time zone 'Europe/London')::date`, matching `todayISO()`.

A month is a calendar month in the same zone. It resets on the 1st, not 30 days later:
"600 a month" has to mean what a person thinks it means.

## The one top-up

Someone who reaches 600 sees a button. Pressing it grants another 600 **for that calendar
month**, once. Not automatic, because the point is that the wall is visible and the
generosity is felt — "just so he knows, but we are generous enough".

It is claimed, not counted: a row in `scan_topups` unique on (user, month). A second press
in the same month is refused politely, not silently.

## What is stored

Two small tables and one column. No personal data, no document contents.

- `scan_usage (user_id, day date, scans int)` — one row per person per day. The month total
  is a sum, so nothing can drift out of step with the daily figure.
- `scan_topups (user_id, month text)` — unique, so the top-up cannot be claimed twice by two
  taps racing each other.
- `business_profile.plan` — `'free'` or `'paid'`, default `'free'`. Only he can set it. When
  payments exist this is the switch; until then everyone is free and the limits simply do
  not apply to `'paid'`.

Both tables are the owner's own rows under RLS, readable by them and writable only through
the functions, and the default anon/authenticated grants are revoked explicitly (the app
has been caught by that default before — `CLAUDE.md` rule 2).

## The functions

- `scan_allowance()` — what someone has left: used today, used this month, the two limits,
  whether the top-up is still available, and which period they are in. Read-only, used to
  draw the wall before anyone hits it.
- `take_scans(n int)` — the one that matters. Checks the limits, records `n`, and returns
  whether it was allowed. Atomic, so two phones scanning at once cannot both slip past the
  last scan. A paid account always passes.
- `claim_scan_topup()` — grants the extra 600 once in a calendar month.

All three are `security definer`, granted to `authenticated`, and act only on the caller's
own rows — never on a user id passed in, which would let anyone spend someone else's
allowance.

## What someone actually sees

Not an error code. At 50 in a day: *"That's 50 today — the most a free account can read in
one day. It starts again tomorrow morning."* At 600 in a month, the same but with the
button: *"Give me another 600 this month."* And once that is used: *"That's the extra 600
used. It starts again on the 1st."*

Never a dead end: Copy a document, writing an invoice by hand, and everything already saved
keep working, and the message says so.

## What is deliberately not built yet

Paying for more. There is no payment, so there is nothing to sell; `plan` exists so that the
day there is, nothing has to be rebuilt.

## Open, for him

- The welcome burst is read as **the first 7 days of each new account**, not of the app. He
  said "at first few days" without saying which, and this is the reading that earns loyalty.
- Whether a top-up should ever be automatic later, once there is a way to charge for it.
