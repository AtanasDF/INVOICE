# Invoiceover — what it is, for a conversation about what it should be

Written 2026-09-28, by reading the code rather than remembering it. Every claim here was
checked against the files or the live environment on that date.

**Who this is for.** Atanas, taking it to a separate conversation to settle the free tier and
the design — and the Claude on the other end of that conversation, who has never seen this
machine. Read this page first, then the numbered sections beside it.

---

## What the app is, in one paragraph

It is an invoicing and expenses app for one UK tradesman or small business. Two halves.
**Money in:** write an invoice or a quote, send it to a customer as a link or an email, and
see what you are owed. **Money out:** photograph a receipt or a supplier's bill and the app
reads it — supplier, date, total, VAT, invoice number — and files it. Around those two sit
the things a UK business actually needs: VAT return figures, CIS deductions, mileage at
HMRC's rates, a statement per customer, and a check of whether a company you are about to
work with is real.

The scanner is the heart of it. Everything else exists because once the paper is in, the
figures are already there.

**Live at** https://invoice-omega-rust.vercel.app — one account per person, on a phone.

---

## The one rule that shapes everything

**Nothing works before an account.** Atanas, 2026-09-22: *"nothing should work before the
user register... a plain page with some nice advertising of the app and the log in
rectangulars."*

There are exactly nine public addresses, plus the three kinds of customer link:

| Public | Why it is public |
|---|---|
| `/` | the front door: what the app is, and the sign-in box |
| `/login`, `/reset-password` | getting in |
| `/privacy`, `/terms` | must be readable before anyone hands over an email |
| `/security` | whoever finds a security hole almost certainly has no account |
| `/accessibility` | a statement about whether somebody *can* use the app is no use behind a sign-in they cannot get through |
| `/how-to-invoice` | a public article, written to be found in a search |
| `/offline` | shown exactly when the sign-in check cannot be made |
| `/i/<token>` `/q/<token>` `/r/<token>` | the links a customer or supplier is sent |

Everything else sends a stranger to `/login`. **This is the biggest single thing to decide
in the design conversation** — see `01-the-free-tier-decision.md`.

---

## What it costs to run, per person

Worth knowing before deciding what is free, because three of these are metered:

| Thing | Cost |
|---|---|
| **Reading a document** (the scanner) | **Money every time.** Google Gemini by default; Claude optionally. This is the only cost that grows with use. |
| **Sending an email** (invoice, reminder, copy) | Money per email, through Resend. |
| **The help chat** | Would cost money per message — **switched off** today. |
| Checking a company | Free. Companies House's own API. |
| Checking a VAT number | Free, but **switched off** — needs HMRC credentials that take about two weeks to get. |
| Address lookup | Free by default (postcodes.io + OpenStreetMap). A paid upgrade exists and is not switched on. |
| Storing everything | Supabase — database and receipt photographs. Grows with use but slowly. |
| Serving the app | Vercel. |

---

## The state of play, honestly

**Built, live, and in use:**
invoices with CIS and the VAT reverse charge · credit notes · payments · quotes with deposits ·
customer accept/decline links · asking several suppliers to price a list · the scanner,
including several documents in one photograph · receipts, bills, expenses, mileage · recurring
invoices and expenses · VAT return figures · customer statements · Companies House checks ·
importing receipts from email · payment reminders on a schedule · five colour themes and dark
mode · offline page · push notifications.

**Built but switched off** (one environment variable each):
the help chat (`NEXT_PUBLIC_HELP_CHAT`) · invite-a-friend (`NEXT_PUBLIC_INVITES`) · letting old
receipt photographs go (`PHOTO_AGEING`) · the HMRC VAT number check (needs credentials, about
two weeks to obtain).

**Live and stricter than the notes claimed** — corrected 2026-09-27:
**the scan limits are ON.** See below.

**Not built at all:**
any payment or subscription · a paid tier (the database has a `plan` column and every account
says `free`) · fingerprint or passkey sign-in · an offline queue for scans taken with no signal.

---

## The number that matters most for the free-tier conversation

**Every account is already limited on reading documents**, and has been since 23 September —
the project notes said otherwise until the 27th, so this is worth stating plainly:

- **First seven days of an account: 300 documents a day**, no monthly cap. Deliberately
  generous, so somebody catching up on a year of receipts does not hit a wall on their first
  evening.
- **After that: 50 a day, and 600 a month.**
- A `paid` account would have no limit — but no paid tier exists, so nobody is one.

The app shows people what they have left, and the wall, when reached, offers a way on rather
than just refusing.

So the question is not *should there be a limit* — there is one. The question is whether
**50 a day and 600 a month** is the right free allowance, and what the paid one would be.

---

## How the sections are laid out

| File | Covers |
|---|---|
| `01-the-free-tier-decision.md` | the open questions, with today's answers, ready to decide |
| `front-door.md` | arriving, signing in, what a stranger may see |
| `dashboard.md` | the dashboard and getting around |
| `invoices.md` | the invoice list and writing one |
| `invoice-extras.md` | CIS, reverse charge, saving, the customer link, reminders |
| `quotes.md` | quotes and deposits |
| `supplier-pricing.md` | asking suppliers to price a list, Jobs, Money |
| `receipts.md` | receipts, bills, expenses, mileage, recurring |
| `scanner-camera.md` | the camera screen itself |
| `scanner-reading.md` | what happens to a photo after it is taken, and the limits |
| `file-tools.md` | Copy a document, Change a file, Files |
| `settings.md` | customers, Settings, VAT, company and VAT-number checks |
| `design.md` | themes, dark mode, the standard shapes, the supporting pages |

Each page in each section says: what it is for, how you get there, what is on it, what it does
behind the scenes, where it takes you next, and **whether it is free, gated, or not built**.

---

## What to bring back

Anything decided — the free allowance, what a stranger may use without an account, colours,
wording, what should move or be removed. Decisions are enough; they do not need to be written
as instructions. The next session here will turn them into work, on a branch, with the tests
kept green.

**One caution for the other conversation:** it will not have this machine, the database, or
the live site. It can reason about design and wording, but it cannot check a claim against the
code. Where these notes say something is uncertain or "not established from the code", treat
that as genuinely unknown rather than an invitation to fill it in.
