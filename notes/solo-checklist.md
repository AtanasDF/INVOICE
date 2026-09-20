# 50 things to check, test and fix without Atanas

For a day working alone. Anything needing his hands (a key, a password, a real document,
a decision about money) is out. Tick items off in the session log, push after each one.
Order is rough priority, not a queue: skip anything already done and say so.

## The app on a phone (375px, Safari-like)

1. Re-run the 375px sweep (`harness/test-fit-sweep.mjs`) over every signed-in page after
   each merge; add any new page to its list.
2. Same sweep at 320px (iPhone SE) and 430px (Pro Max); fix anything that runs off.
3. Every form: check the keyboard type on each field (numeric for money, email, tel) and
   that the enter key does something sensible.
4. Every list: check what it says when empty, when loading and when the load fails.
5. Tap targets under 44px anywhere in the app; raise them.
6. Colour contrast on every grey-on-grey label; anything under 4.5:1 gets darker.
7. Focus rings and tab order on every form, and `aria-label`s on icon-only buttons.
8. Long names and long numbers everywhere (60-character company names, £1,234,567.89):
   nothing truncated without a title, nothing overlapping.
9. Landscape orientation on the scanner and the invoice page.
10. Dark mode: the app is light-only today — check nothing breaks when iOS forces dark.

## Money and correctness

11. Unit-test the VAT rounding again on mixed-rate invoices with quantities like 0.33.
12. CIS: labour/materials split with a deposit, a credit note and a part payment together.
13. Deposit invoice plus final invoice equals the quote total, with VAT, to the penny.
14. Credit notes bigger than the invoice; credit notes on a CIS invoice.
15. Foreign-currency receipts: rate changes, missing rate, rate typed by hand.
16. Invoice numbering: gaps, duplicates, year-end rollover, numbering from 1 on a new
    account (the case Atanas is in now).
17. Payments: over-payment, two payments the same day, removing the last payment.
18. Reminder schedule: every step (-3, 0, +7, +14, +30) against a fixed clock, including
    the 3-day catch-up window and the interest line only in the final notice.
19. Tax estimate: first month of the year, year end, a loss, income over £100k
    (tapered allowance), Class 4 bands.
20. Every total in the app against the same invoice: list, dashboard, PDF, public link,
    CSV export, tax card. They must agree.

## Scanning

21. Re-run every camera suite (far, bent, batch, auto-zoom, lens, pinch, tip, torch).
22. Generate new synthetic clips: glare, shadow across the page, a hand holding a corner,
    a page on a patterned surface, a phone moving slowly.
23. A receipt longer than the frame (a till roll) and a page in landscape.
24. PDFs: 1 page, 20 pages, a scanned-image PDF, a password-protected one (should fail
    with a clear message, not a crash).
25. Uploads: HEIC from an iPhone, a 12MP photo, a 10MB file, a file with no extension.
26. The scan review form: every field's confidence flag, the duplicate warning, the
    line-total check, the category memory per supplier.
27. Documents in the wrong orientation (upside down, 90°, 180°).
28. A blank page, a photo of a screen, a photo of nothing: the app should say so, not
    invent a receipt.
29. Time a batch of 10 through Gemini and through Claude; record both in the notes.
30. Check no supplier is ever created without being asked, in every path.

## Data and safety

31. Read-back test: every store's `add` then `all` returns exactly what went in, including
    empty strings, nulls and unicode.
32. RLS: with a second fake user in the mock server, no row of the first is reachable.
33. Public links (/i/, /q/): a draft, a stopped link, a wrong token, an expired quote.
34. Rate limits on every public route, and that they fail closed.
35. Service-role routes: confirm none can be reached with an anon key.
36. Storage paths: signed URLs expire and are re-signed; no data URLs left in new rows.
37. Backup check: every `*_backup_*` table still present (never delete), listed in notes.
38. An account with nothing in it: every page, every button, no crash.
39. An account with 500 invoices and 2000 receipts (seed the mock): list speed, filters,
    CSV export.
40. Errors: kill the network mid-save on each form and check nothing is half-saved.

## Code health

41. `tsc`, `eslint`, `npm run build` clean on main, after every merge.
42. Dead code and unused exports; components that exist but nothing renders.
43. Duplicated logic that should live in one place (money, dates, supplier matching).
44. Every `catch {}` that swallows an error a user should see.
45. Bundle size per route; anything that grew a lot since the last check.
46. Dependencies: outdated or unused ones, and anything with a known advisory.
47. The harness itself: flaky tests (the camera tip one), hard-coded ports, stray Chrome
    profiles, clips that can be regenerated instead of kept.
48. CLAUDE.md and notes: anything stale (a branch that merged, a number that changed).
49. A written pass over the last week's commits looking for anything left half-done.
50. End of day: a short list of what improved, what broke and what to do next, in the
    session log, pushed.

## While there's still time

Keep a running list of improvements worth doing, and start the safest ones: small, visible
things that need no decision from him (wording, empty states, loading states, a missing
confirmation, an obvious shortcut). Anything that changes money, the database shape, or
what is sent to a customer waits for him.

## Spotted while working (2026-09-20), worth doing

- **Thousands separators.** £4477.50 should read £4,477.50 everywhere. One shared
  formatter (`src/lib/money.ts`) and every local copy of it; the suites compare these
  strings, so update them in the same commit.
- **Atanas's Settings still says "not VAT registered"** and the business details are
  placeholders. Nothing to fix in code; tell him, since it changes every invoice.
- **The camera-tip suite is timing-flaky** (about 2 in 3 pass). Make it deterministic
  rather than re-running it.
- **`test-far-v2` expects no hint on a dark clip**, which the torch now gives. Update that
  expectation when the torch work settles.
- **Money screens don't group by job**, so a job's profit can't be seen; queued as a
  future idea, but the data is already there (tags).
- **Dependencies (checked 2026-09-20):** `npm audit --omit=dev` finds nothing. Available
  bumps are all majors — TypeScript 7, ESLint 10, `@types/node` 26 — plus React 19.3 and
  the Anthropic SDK 0.127. Worth doing one at a time with the suites, not unattended.

## Done in the morning (2026-09-20)

- **4 + 38. An empty account, and every list's loading / failed state** — a new suite
  (`harness/test-empty-account.mjs`) walks all 22 signed-in pages against a database with
  nothing in it, then fails each page's load in turn: 132 checks, all green. It found a
  real one, below.
- **44. Errors a user should see, swallowed** — ten pages loaded with `.then()` and no
  `.catch()`: dashboard, invoices, contacts, receipts, the review queue, files, expenses,
  settings, both recurring lists. A failed load left them on "Loading…" for ever or showed
  the empty state — "No invoices yet" on books that are someone's real records. They all
  catch now, and the empty state is suppressed while an error is showing. Pages that did
  catch printed the database's own words ("JSON object requested, multiple rows returned");
  `loadFailed()` in `src/lib/errorText.ts` keeps that for the console and shows one plain
  sentence instead.

- **16. Numbering from 1 on a new account** — found and fixed the worst first-run bug
  there is: a brand-new account has no `business_profile` row (it only appears when
  Settings is saved) and the number counter lives on it, so the very first "Mark as sent"
  failed with "Could not mark this invoice sent." — right after the panel had promised
  "assigns invoice number INV-1". It now writes the defaults and issues it.
  `test-numbering.mjs` 11/11: first invoice, no gap to the second, a clash explained and
  the counter left alone.
- **40. Nothing half-saved when the connection dies** — `test-half-saved.mjs` 12/12, and
  the app came out of it well: a payment whose status update is cut off is written once
  and says so ("the payment is saved, but the status couldn't be updated"); a receipt that
  fails to save leaves no row and a second attempt writes one, not two; a quote whose
  invoice write fails is given back rather than left claimed; and a lost reply after the
  invoice was written finds the invoice that exists instead of making a second one.

- **3. The keyboard each field asks for** — `test-keyboards.mjs` 12/12 over eleven forms.
  Three email boxes were plain text (new contact, editing a contact, the contact block on
  a scan), so a phone opened the full keyboard with no @ and capitalised the address.
  Every money and quantity field was already right.
- **8. Long names and big numbers** — `test-long-values.mjs` 26/26. A 100-character
  customer name pushed five pages sideways on a 375px phone (the invoices list to 659px),
  and £1,185,185.18 was cut off on the dashboard. `break-words` was already there and
  doesn't help: overflow-wrap leaves min-content alone, so a flex item still won't shrink
  below its longest word. `wrap-anywhere` plus `min-w-0`/`shrink-0` on the rows fixes it.
- **5 (in part) + the rule about never deleting** — every Remove in the app deleted on the
  first tap, twelve pixels from "View / print" on a phone. All seven now ask first and say
  what goes. `test-no-accidents.mjs` 28/28.
- **44 (rest of it). Sixty-eight swallowed save errors** — `err instanceof Error ?
  err.message : "..."` is never true for a Supabase error, so every failed save showed the
  same generic line. `saveFailed()` now gives plain English for no signal and for the
  database's own codes, and keeps the caller's sentence otherwise.

- **20. Every total, in every place it shows** — `test-one-total.mjs` 12/12. One invoice
  with mixed VAT rates, an awkward quantity (12.5 hours), CIS on the labour, a credit note
  and a part payment: £829.90 net, £142.72 VAT charged per rate, £972.62 total, £91.50 CIS
  (a fifth of the labour *after* the credit), £535.52 still owed — the same figure on the
  invoice, the list, the dashboard and the customer's statement. Nothing to fix.
- **7. Every control has a name** — `test-labels.mjs` 21/21 across twenty pages: no button
  or link anywhere reads as just "button" to a screen reader. Nothing to fix.
- **33. The pages a customer sees when a link is dead** — there was no not-found page at
  all, so a stopped or replaced invoice link showed Next's bare 404. Each of /i/, /q/ and
  /r/ has its own now, plus a 404 and an error page for the app. `test-public-links.mjs`
  31/31. Next answers these 200 with a noindex tag rather than 404 — documented behaviour
  for a streamed route, since the headers have already gone by the time the link is found
  to be dead.
- **42. Dead code** — only two exported functions in the whole codebase are used nowhere:
  `isMileage` in `src/lib/mileage.ts` (duplicates `tripOf`) and `mergeAddress` in
  `src/lib/addressLookup.ts` (left from the old AddressFinder). Flagged, not removed.
  The two `* 2.*` iCloud copies in the source tree are still there and still ignored.

## Done overnight (2026-09-20)

- **2. Sweeps at 320 and 430px** — done. Two real problems found and fixed: the three
  expense totals squashed to 43px boxes at 320px (they stack below 420px now), and the
  invoice and quote tables pushed the page sideways (they scroll in their own box, print
  unaffected). All 26 pages fit at 320, 375 and 430.
- **39. A busy account** — 500 invoices, 2000 receipts, 300 contacts: dashboard 0.9s,
  receipts 1.6s, expenses 3.1s, VAT 6.8s, contacts 2.0s, filtering 0.6s, and the
  dashboard's owed total matches the invoices to the penny (`test-big-account.mjs`).
- **43/47. One money formatter** — the app grouped thousands in some places and not
  others; `src/lib/money.ts` is now the only one, used by 22 files. The sweep itself
  briefly dropped the pound sign on the invoice page, which the suites caught.
- **46. Dependencies** — no advisories; the available bumps are all majors.
- **The camera-tip flake** — fixed at the source, not in the test: the how-to-allow tip no
  longer shows when the browser says the camera is already granted, and the suites are
  deterministic (7/7 and 3/3 repeatedly).
- **The tax suite's drifting figure** — it hard-coded a set-aside that moves every day; it
  now checks the figure against its own two parts and the year's tax.
