# Letting old photographs go — carefully

His ask (2026-09-23): "we can store photos for less time and less photos if needed... with
an option for automatic sending everything over the email before it's deleted", and
"photos we're gonna keep three months at tops and then start decreasing when needed. The
records kept forever."

## The one rule everything else serves

**Nothing is removed that has not first been emailed successfully.** Not "emailed and we
think it worked" — the send has to have been accepted before a single byte goes. If the
email fails, the photographs stay and the job tries again tomorrow. Storage is pennies; a
receipt somebody needed for HMRC is not.

## What goes and what stays

- **Goes:** the photograph, after three months.
- **Stays, for ever:** the record — supplier, date, amount, VAT, category, invoice number,
  everything anyone would ever file a return from. The row is never touched beyond marking
  that its picture has gone.
- **Never goes:** anything belonging to an account on the paid plan.

## Why this is safe to build and dangerous to switch on

`CLAUDE.md` rule 1 is that nothing is deleted. This is the one deliberate exception he has
asked for, so it gets two locks rather than one:

1. `PHOTO_AGEING` must be `on` before the job does anything at all.
2. `PHOTO_AGEING_DELETE` must *also* be `on` before a single file is removed.

With the first on and the second off, the job runs, works out exactly what it would remove,
sends the email, and **removes nothing** — it writes a report instead. That is the state it
ships in, and it is the state it should stay in until he has read a report and agrees with
it.

## How a run goes

1. Find receipts whose photograph is older than the cut-off, grouped by owner. Nothing that
   still needs review, nothing on a paid plan.
2. For each owner, oldest first, take at most 200 documents in a run — a job that tries to
   email a year of receipts at once will time out and achieve nothing.
3. Build one PDF of those photographs (`documentPdf.ts`, which already does exactly this).
4. Email it to the owner from the app, saying plainly what it is, which months it covers,
   and that the records themselves are untouched.
5. **Only if that send was accepted:** remove the stored files and mark each row
   `details.photoAgedAt`, so the app can say "the photograph was emailed to you on the 3rd"
   rather than showing a broken image.
6. Write a line per owner into the run's answer, so a dry run is readable.

## What the app shows afterwards

A receipt whose photograph has gone says so, with the date it was emailed. It does not
pretend to have a picture and it does not look broken. `details.photoAgedAt` is enough —
no migration, since `details` is already jsonb.

## Numbers, and how they change

Three months to start. He expects to shorten it as the bill grows: `PHOTO_AGEING_DAYS`
overrides the default, so shortening it is an env var rather than a deploy.

## Still to settle with him

- Whether a warning email should go a week before, or whether one email at the time is
  kinder than two.
- Whether an account should be able to say "keep mine for ever" — cheap to offer, and the
  answer is probably yes once anyone asks.


## Switching it on (nothing below has been done)

It is deployed and inert. Three deliberate steps, in this order, none of them done:

1. `PHOTO_AGEING=on` in Vercel. The job now runs when called, builds the PDF, and
   **removes nothing** -- it answers with a report of what it would have emailed.
   Read one of those reports before going further.
2. Add the cron to `web/vercel.json` (`/api/photos/age`, a quiet hour, e.g. `0 3 * * *`).
   It is deliberately not there yet: an inert route nobody calls is safer than a live
   schedule waiting on one env var.
3. `PHOTO_AGEING_DELETE=on`. Only now does a single file go, and only after Resend has
   accepted the email carrying it.

`PHOTO_AGEING_DAYS` defaults to 92 (three months, as agreed) and can be raised while
storage allows it. Atanas's rule stands: photographs for three months at most, dropping
only when it is actually needed, and **the records for ever**.


## The first dry run against the real database (2026-09-23, read-only)

7 receipts exist in total. Under the rule as first written, **one would have gone**: a
receipt dated **2012-09-18**, which is not a 2012 receipt at all -- it is a recent scan
whose date the reader misread. The rule was right and the outcome was wrong.

So a photograph now needs **two** dates past the cutoff: the one printed on the document
*and* the day the receipt was added. That also covers the honest case of somebody
catching up on a year of paperwork in one evening -- nothing they upload tonight can be
emailed away tomorrow. A row with no record of when it arrived is kept.

Re-run with that rule: **0 of 7 would go, at 92 days and at 365.** The job has nothing to
do today, which is exactly the state to switch it on in.
