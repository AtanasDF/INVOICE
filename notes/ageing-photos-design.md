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
