# What the stale suites duplicate (suite map)

Cloud brief 3 (`notes/cloud-queue.md`), 2026-10-20. A report, not a cleanup: nothing in
`harness/` was deleted or edited. Every decision below is Atanas's.

**How it was done.** Each copy's `check(...)` calls were compared with the live suite's,
by label and, separately, by the assertion expression, so a check survives a rename only
if one of the two still matches. Every check that matched nothing anywhere in a live
`test-*.mjs` was then read by hand against the live suite and the app source. No browser
suite was run (a cloud session has no Chrome at the macOS path and no camera clips), so
"covered" means *the same check exists in a suite that runs*, not *that suite is green*.

## Newest information first

1. **The worst hole is not in the 47 at all.** `test-receipts-list-3302` is named in
   `test-suites-report.mjs` as SUPERSEDED by `test-receipts-list`, which is why nothing
   runs it. It is not superseded: **25 of its 73 checks exist nowhere else**, and they are
   the whole of the stricter supplier-link banner on `/receipts` --
   exact and whole-word matches only (ESSO, Costa Coffee Ltd) and never substrings
   (Espresso Bar, Costain, Shellbrook); a row ticked per match and `Link N` counting the
   ticks; only ticked rows PATCHed; an unticked row remembered on the device and not
   offered again; the ✕ dismissal surviving a reload; `details.noSupplier` (set by
   Edit → No supplier, cleared by picking a supplier again, never re-offered); the card
   showing `Supplier · Vendor` only when the printed name isn't plainly the supplier; and
   the page still rendering when localStorage throws. `src/lib/supplierLinks.ts`
   (`bulkMatchSupplier`, `plainlySupplier`, `readLinkSkips`/`writeLinkSkips`) has **no
   logic suite** and is not in `tsconfig.logic.json`, so this file is the only thing that
   has ever checked it -- and it has not been run since it was labelled superseded.
   `test-receipts-list` covers only the original banner (count, `which?`, Link 3 / Link 1,
   persisted). The handover also lists this suite as "73/74 on main"; the likely red one is
   a stale card assertion (`<= 150px` or `★`, both deliberately relaxed in the live
   suite to `<= 156px` and "Keep handy"), not the link checks, but that is unverified.
   **Recommendation:** move it from SUPERSEDED to PENDING (or into `run-all.sh` after
   fixing those two stale lines) on the Mac. Not done here: the brief says edit no suite,
   and other cloud branches are touching the run lists.

2. **Of the 44 stale copies, exactly one holds ground covered nowhere else:
   `qux-test-public-company.mjs`.** Its two checks open the *customer's* `/q/<token>`
   page and assert that a company quote shows `Attn: <contact>` and the customer's VAT
   number, and a private customer's shows neither even when they are saved on the
   record. `test-quotes-ux` checks the same words on the **owner's** quote page, through
   the same `QuoteDocument` -- but the public page reads the customer through
   `src/lib/publicQuote.ts` with the service role, mapping `is_company ?? true`,
   `contact_person` and `vat_number` itself. Nothing that runs exercises that mapping
   with a private customer, so a regression there (a private person's saved VAT number
   appearing on the page the customer opens) would go unseen. Its third check, "fits
   375px", matched other suites **by name only**: `test-public-links` measures a `/q/`
   link that does not resolve (the not-found page), `test-fit-sweep` never visits `/q/`,
   and `test-quote-links` opens the customer's page at 375 but never measures it. So a
   real quote on the customer's phone is not width-checked anywhere that runs either.
   This file only ever ran against a dev server on 3300 and a stand-in on 5555, with
   `mockdb-qux.mjs`.

3. **"47" is 44 copies plus three live scripts.** The prefixes the handover gives
   (`cp-`, `int-`, `qux-`, `main-`, `main3000-`, `run-`, `dbg-`) match 47 files, but
   three are `run-all.sh`, `run-one.sh` and `run-bent-suites.sh` -- the harness's own
   runners. **Anyone deleting by prefix takes `run-all.sh` with them.** Delete by the
   list below, never by `run-*`.

4. **Six of the copies duplicate a suite that does not run either.** `int-`, `main-`,
   `qux-`, `run-`, `run-qux-test-deposits` (and `ql-test-deposits`, outside the 47) are
   copies of `test-deposits`, which `test-suites-report.mjs` lists as PENDING (dies on a
   30 s navigation timeout). The copies add nothing to it, so deleting them loses
   nothing -- but 15 of `test-deposits`' 16 browser checks (double tap makes one deposit
   invoice, balance refused while the deposit is a draft, the final invoice less the
   deposit, the lost link found by tag and relinked, a stuck claim released) run nowhere
   today. The arithmetic in `quoteDeposit.ts` *is* covered by the logic suites
   (`test-money-invariants`, `test-money-combined`, `test-free-totals`); the flow is not.

5. **Every other "covered nowhere" hit was rewritten on purpose in the live suite**, and
   the old form asserts behaviour the app no longer has. None is a loss:
   - `only live clients offered (no archived, no suppliers)` (int-/main-/run-test-quotes)
     and `live clients then suppliers offered (no archived)` (qux-/run-qux-test-quotes):
     quotes now go to suppliers too; live `test-quotes` checks "live clients and
     suppliers offered, nobody archived". (It no longer pins the *order* clients-then-
     suppliers; `test-quotes-ux` "picker: customers then suppliers, sorted, no archived"
     does.)
   - `picker: clients then suppliers, sorted, no archived` (dbg-qux): the heading is
     "Customers" now; same check in `test-quotes-ux`.
   - `send panel talks about a quote` (free-quote copies): asserted the signed-out
     wording, and nobody signed out reaches `/free-invoice` since 2026-09-22; live
     `test-free-quote` checks the signed-in panel more strictly.
   - `imported customer opens as a new customer, prefilled, Company picked` and
     `can't save the quote over a half-added customer` (qux-/run-qux-test-free-quote):
     both live in `test-free-quote` under new names ("the customer comes across, on the
     company form because of the Ltd", "saving before the new customer is added says so,
     and saves nothing").
   - `set aside = share of the year so far of the projected £10,812` (int-test-tax): a
     fixed £4,947 that was only right on one day; live `test-tax` checks the set-aside
     equals its own income tax + Class 4 and sits under the year's tax.
   - `every card compact (<= 150px)`, `star/edit/remove on every card`
     (int-test-receipts-list): relaxed to 156px and "Keep handy" in `test-receipts-list`.
   - `dashboard: Upload photos or PDFs` (md-debug-uploads, md-test-uploads): now "a way
     in from files" in `test-uploads`.

6. **Five more copy families sit outside the 47**, made the same way and equally unrun:
   `md-` (9), `ql-` (2), `qr-regress-` (6), `rl-` (4), `sa-` (4), plus helpers
   `md-mockdb`, `qr-mockdb`, `qr-regress-mockdb`, `mockdb-qux`, `mockdb-rl`. None holds a
   unique check (table below). Several still carry
   `new Date().toISOString().slice(0, 10)`, the pattern the handover warns about.

7. **The `-v2` / `-3100` / `-orig` names inside `test-*` are copies too**, and none is
   unique: `test-far` / `test-far-v2`, `test-autozoom2` / `test-autozoom3` /
   `test-autozoom3-v2`, `test-far-recheck` / `-3100`, `test-batch-swap` / `-3100`
   (2-9 lines apart). They are camera clip runners, outside `run-all.sh` by design.
   `test-receipts-list-3302-orig` holds only the two stale card checks above.

## The 44 stale copies, one line each

"Unique" means a check found in no `test-*.mjs` other than stale copies. Drift is
`diff | grep -c '^[<>]'` against the live suite. All were added to git on 2026-09-26
(when the harness came into the repo) and none is in `run-all.sh`.

| File | What it covers | Now covered by | Drift | Unique? |
|---|---|---|---|---|
| `qux-test-public-company` | customer's `/q/` page: Attn + VAT for a company, neither for a private person, fits 375px | `test-quotes-ux` (owner's page only) | -- | **YES, all 3 checks** (item 2) |
| `dbg-qux` | early Quotes UX: picker, inline company/private customer, Send card text/WhatsApp | `test-quotes-ux` (48/48 by name) | -- | no |
| `cp-test-company` | Companies House name lookup on Free page, client forms, Settings | `test-company` | 30 | no |
| `int-main3000-test-company` | same | `test-company` | 40 | no |
| `main-test-company` | same | `test-company` | 32 | no |
| `main3000-test-company` | same | `test-company` | 32 | no |
| `run-test-company` | same | `test-company` | 32 | no |
| `int-test-deposits` | quote deposits: deposit invoice, balance, credited deposit, relink | `test-deposits` (PENDING, not run) | 44 | no (but see item 4) |
| `main-test-deposits` | same | `test-deposits` (PENDING) | 44 | no (item 4) |
| `qux-test-deposits` | same, `mockdb-qux` | `test-deposits` (PENDING) | 47 | no (item 4) |
| `run-test-deposits` | same | `test-deposits` (PENDING) | 44 | no (item 4) |
| `run-qux-test-deposits` | same, `mockdb-qux` | `test-deposits` (PENDING) | 47 | no (item 4) |
| `int-test-free-quote` | Free page in quote mode, send panel, import an old quote | `test-free-quote` | 76 | no (rewritten, item 5) |
| `qux-test-free-quote` | same, plus new-customer panel on import | `test-free-quote` | 79 | no (rewritten, item 5) |
| `run-qux-test-free-quote` | same | `test-free-quote` | 79 | no (rewritten, item 5) |
| `int-test-lines` | invoice line quantities and prices kept exactly | `test-lines` | 2 | no |
| `main-test-lines` | same | `test-lines` | 2 | no |
| `run-test-lines` | same | `test-lines` | 7 | no |
| `int-test-links` | private `/i/` invoice links: copy, open count, stop link | `test-links` | 67 | no |
| `qux-test-links` | same, `mockdb-qux` | `test-links` | 69 | no |
| `int-test-payments` | payments against an invoice, status from payments | `test-payments` (17 ⊇ 13) | 95 | no |
| `main-test-payments` | same | `test-payments` | 94 | no |
| `run-test-payments` | same | `test-payments` | 92 | no |
| `int-test-quote-links` | `/q/` links, Accept / Decline | `test-quote-links` (20 ⊇ 18) | 83 | no |
| `qux-test-quote-links` | same, `mockdb-qux` | `test-quote-links` | 83 | no |
| `int-test-quotes` | quotes list, editor, turn into invoice, relink | `test-quotes` | 44 | no (rewritten, item 5) |
| `main-test-quotes` | same | `test-quotes` | 44 | no (rewritten, item 5) |
| `run-test-quotes` | same | `test-quotes` | 44 | no (rewritten, item 5) |
| `qux-test-quotes` | same, suppliers in the picker | `test-quotes` | 55 | no (rewritten, item 5) |
| `run-qux-test-quotes` | same | `test-quotes` | 55 | no (rewritten, item 5) |
| `int-test-receipts-list` | receipts & bills list, compact cards, link banner | `test-receipts-list` | 97 | no (relaxed, item 5) |
| `int-test-reminders-ui` | reminder history and switch on the invoice page | `test-reminders-ui` | 9 | no |
| `main-test-reminders-ui` | same | `test-reminders-ui` | 9 | no |
| `run-test-reminders-ui` | same | `test-reminders-ui` | 9 | no |
| `int-test-tax` | tax card: profit, set-aside, VAT line | `test-tax` | 11 | no (rewritten, item 5) |
| `run-test-tax` | same | `test-tax` | 2 | no |
| `qux-test-texts` | text / WhatsApp wording for invoices and quotes | `test-texts` | 6 | no |
| `int-test-vat-snapshot` | invoice priced by the VAT setting it was issued under | `test-vat-snapshot` | 2 | no |
| `run-test-vat-snapshot` | same | `test-vat-snapshot` | 2 | no |
| `dbg-320` | one-off probe: `/expenses` width at 320px, prints, no checks | `test-fit-320`, `test-fit-sweep` | -- | no (no checks) |
| `dbg-client` | one-off probe: `/clients/new` combobox count over time, no checks | `test-company` | -- | no (no checks) |
| `dbg-width` | one-off probe: `/clients` overflowing elements, no checks | `test-fit-sweep` | -- | no (no checks) |
| `dbg-region` | one-off probe: video vs visible region sizes, no checks | `test-conditions` | -- | no (no checks) |
| `dbg-torch` | one-off probe: dark-room brightness and torch text, no checks | `test-torch` | -- | no (no checks) |

And the three that share the prefix but are **live and must stay**: `run-all.sh`,
`run-one.sh`, `run-bent-suites.sh`.

## The other copy families (outside the 47)

| File | Copy of | Unique? |
|---|---|---|
| `md-test-bent`, `md-test-far-v2` | `test-bent`, `test-far-v2` (clip runners) | no |
| `md-test-receipts-list-3302` | `test-receipts-list-3302` (74/74 the same) | no -- but its original is item 1 |
| `md-test-review-fixes`, `md-test-uploads` | `test-review-fixes`, `test-uploads` | no (one rename, item 5) |
| `md-debug-uploads` | early `test-uploads` | no (same rename) |
| `md-camera2`, `md-camera3`, `sa-camera2` | `camera2.mjs` / `camera3.mjs` helpers | no checks |
| `ql-test-deposits`, `ql-test-quotes` | `test-deposits` (PENDING), `test-quotes` | no |
| `qr-regress-quotes`, `qr-regress-qux-quotes` | `test-quotes` | no (rewritten, item 5) |
| `qr-regress-quote-links`, `qr-regress-qux-quote-links` | `test-quote-links` | no |
| `qr-regress-quotes-ux` | `test-quotes-ux` | no (heading rename) |
| `rl-test-cis`, `rl-test-delight`, `rl-test-payments`, `rl-test-vat-snapshot` | the same names without `rl-` | no |
| `sa-test-camera-tip`, `sa-test-fit-sweep`, `sa-test-tips` | the same names without `sa-` | no |

## Checks that exist in exactly one place and would be lost

From the stale copies (the brief's question):

- `qux-test-public-company`: "company quote page: Attn and the customer's VAT number"
- `qux-test-public-company`: "private quote page: name and address, no VAT number or Attn"
- `qux-test-public-company`: "fits 375px" -- a real quote on the customer's `/q/` page

From files marked superseded or pending, which are not in the 47 but are the same kind of
risk and larger -- these are already not running, so the hole is open now, not waiting:

- `test-receipts-list-3302` (marked superseded): 25 checks on the supplier-link banner
  and `details.noSupplier`, listed in item 1. Its copy `md-test-receipts-list-3302` holds
  the same 25; deleting the copy is safe, deleting the original is not.
- `test-deposits` (pending): 15 browser checks on the deposit / balance flow (item 4).
- `test-settings-add` (pending): 35 checks whose names match nothing elsewhere -- the
  Settings account section, trading vs registered name on the invoice footer, the Add
  sheet, the camera-permission screens, and Settings without migration-029's columns.
  **Not verified by hand**: several are probably covered under other names by
  `test-settings-save`, `test-account-switch` and the camera suites. Worth the same
  pass before it is ever deleted.

Everything else in the 44 can go without losing a check. A lesson from doing this: a
check that matches by **name** is not proof of the same ground -- "fits 375px" appears in
eighteen live suites and none of them measures this page. Read the page, not the label.

## Appendix: every `test-*.mjs` (221)

Generated from the files on 2026-10-20: status from `run-all.sh` and
`test-suites-report.mjs`; checks counted as `check(` calls; "what it covers" is the
file's first comment line, or its first check's name where it has none.

| Suite | Status | Checks | What it covers |
|---|---|---|---|
| `test-account-switch` | run | 20 | A borrowed phone handed over the last person's bank details. |
| `test-address-fields` | run | 30 | Address in its own fields (house/street, area, town, postcode) with one |
| `test-address-stubbed` | run | 37 | The address finder off the internet (items 42b and 82 on Atanas's list): |
| `test-address-words` | run | 26 | The free address search keeps only matches that carry the words typed: |
| `test-address` | clip runner | 11 | first check: a finder on both address fields |
| `test-announced` | run | 11 | What the app says back, to someone who can't see it. |
| `test-answer-clash` | run | 6 | Two people answering the same quote request at once. |
| `test-autocomplete` | run | 10 | Whose details is this field holding? |
| `test-autozoom-out` | clip runner | 4 | Two things Atanas asked for after his first real scan (2026-09-22): |
| `test-autozoom` | clip runner | 7 | 1. Small page, centred: expect zoom in. |
| `test-autozoom2` | clip runner | 9 | first check: small centred page zooms in |
| `test-autozoom3-v2` | clip runner | 9 | test-autozoom3.mjs with 'found' read as any hint showing (nothing shows while no page is found). |
| `test-autozoom3` | clip runner | 9 | first check: small centred page zooms in |
| `test-awkward-dates` | run | 52 | The days arithmetic goes wrong on. |
| `test-awkward-money` | run | 21 | A statement and a VAT quarter with money that does not divide nicely: |
| `test-bad-scan` | run | 8 | A photo of nothing useful: a blank page, a screen, the inside of a van |
| `test-batch-stuck` | run | 10 | "The scanner doesn't pile up photos from when scanning so doesn't allow you |
| `test-batch-swap-3100` | clip runner | 0 | first check: batch (${still ===  |
| `test-batch-swap` | clip runner | 0 | first check: batch (${still ===  |
| `test-bent` | clip runner | 5 | Bent paper (gen-bent.py): found, locked and taken quickly; the green outline |
| `test-big-account` | run | 21 | A busy account: 500 invoices, 2000 receipts, 300 clients. Every list has |
| `test-big-slow` | run | 9 | Two thousand receipts, on a slow phone. |
| `test-big-text` | run | 3 | The app at the text size somebody has already chosen on their phone. |
| `test-bills` | run | 35 | What counts as a bill, when one is due soon -- and that nothing has grown |
| `test-break-it` | run | 16 | Trying to break it, rather than adding to it. A night of wide change -- |
| `test-came-from` | run | 8 | Which flyer brought them (Atanas, 2026-09-23: "we can do the different code |
| `test-camera-refusal` | run | 14 | What happens after someone taps "Don't Allow" once. On iPhone Safari |
| `test-camera-tip` | run | 2 | iOS Safari has no Permissions API for the camera, so the app can't ask |
| `test-check-company` | run | 53 | The free "Check a company" page, driven in headless Chrome against a |
| `test-cis` | run | 13 | first check: new invoice: CIS summary on labour only |
| `test-clear` | run | 21 | first check: client: Clear form shown, off while empty |
| `test-cold-start` | run | 6 | The first time the scanner is opened on a phone, it downloads the |
| `test-company-number` | run | 6 | A company picked from the register keeps its number on the contact row |
| `test-company-picker` | run | 38 | One customer/supplier field everywhere, tied to the Companies House |
| `test-company` | run | 21 | first check: Free page has lookup on business and customer name |
| `test-conditions` | clip runner | 11 | The conditions a receipt actually gets photographed in. |
| `test-convert` | run | 14 | Change a file (Atanas, 2026-09-22: "every file needs to be able to be |
| `test-copy-document` | run | 18 | "Copy a document" (Atanas, 2026-09-22: a second scanner button on the free |
| `test-credit-rollback` | run | 10 | Removing a credit note, when the removal fails. |
| `test-crons` | run | 9 | The scheduled jobs, and whether each one is actually scheduled. A cron |
| `test-csv-safety` | run | 11 | The spreadsheet shape of an invoice or quote, opened in Excel |
| `test-currency` | run | 21 | A receipt in another currency. The rate comes from the European Central |
| `test-dark-mode` | run | 2 | NOT light-only any more. This said "the app is light-only by design" until |
| `test-dashboard` | run | 29 | The dashboard rebuilt around the scanner (Atanas, 2026-09-23: "the scanner |
| `test-dates` | run | 33 | Dates read off a photographed receipt. A date read wrong is the quietest |
| `test-delight` | run | 7 | first check: home-screen badge counts overdue invoices and bills due soon |
| `test-deposits` | PENDING | 16 | first check: 150% deposit refused |
| `test-double-press` | run | 8 | Pressing a button twice in the same tick. React applies `disabled` on the |
| `test-empty-account` | run | 25 | A brand-new account with nothing in it: no business details, no contacts, |
| `test-error-on-the-field` | run | 6 | When a form refuses, WHICH box is it about? |
| `test-error-report` | run | 32 | What gets sent when the app breaks, and what must never be. |
| `test-every-screen-explained` | run | 5 | A short note the first few times a screen is opened (Atanas, 2026-09-24: |
| `test-exact-customer` | run | 5 | Scanning an invoice you sent before, to make the next one. |
| `test-exif-rotation` | run | 4 | A photo taken with the phone on its side, or upside down. |
| `test-far-recheck-3100` | clip runner | 1 | first check: switching camera mode mid-photo: the scanner isn |
| `test-far-recheck` | clip runner | 1 | first check: switching camera mode mid-photo: the scanner isn |
| `test-far-v2` | clip runner | 21 | test-far.mjs with the hint pill empty while no page is found (it used to say 'Fit the page...'). |
| `test-far` | clip runner | 21 | first check: far receipt is found |
| `test-feedback-email` | run | 8 | The feedback email's text, off the app's own module. |
| `test-feedback-inbox` | run | 9 | The start-of-session read of feedback: new rows appended to the inbox |
| `test-feedback-page` | run | 10 | The Feedback page sends through the app's route and says so; a failed |
| `test-feedback` | run | 9 | The feedback route on its own dev server: the row saved as the sender, |
| `test-feel` | run | 9 | How the app feels to press and to move around (Atanas, 2026-09-24: "I want |
| `test-file-strip` | run | 16 | The file library on the dashboard (Atanas, 2026-09-24): one rectangle with a |
| `test-first-page` | run | 17 | The front door: a plain page that says what the app is for, with the |
| `test-first-week` | run | 24 | Atanas's first week, start to finish, on an account with nothing in it: |
| `test-fit-320` | run | 0 | The same sweep as test-fit-sweep, at 320px: an iPhone SE, and the |
| `test-fit-sweep` | run | 0 | Every signed-in page at 375px: nothing wider than the screen. |
| `test-form-errors` | run | 9 | Does an error say WHICH box is wrong? |
| `test-free-draft` | run | 18 | The Free invoice page is where a stranger meets this app, with no |
| `test-free-quote` | run | 12 | first check: editor in quote mode: no payment terms, CIS or bank details |
| `test-free-totals` | run | 12 | The Free-invoice page's own totals, which had no suite at all. |
| `test-get-the-app` | run | 13 | Putting the app on a phone (Atanas, 2026-09-23: "how is the app going to be |
| `test-getting-started` | run | 15 | What a new account is still missing. Atanas is starting a company from |
| `test-govuk-words` | run | 11 | NOTE: not to be confused with test-plain-words.mjs, which is about the |
| `test-half-connection` | run | 13 | Not offline. Half-connected, which is worse. |
| `test-half-saved` | run | 19 | The connection dies in the middle of a save. Nothing may end up half |
| `test-help-chat-live` | run | 24 | The chat's fences, with the switch ON and both services stood in for. |
| `test-help-chat` | run | 53 | The chat, which is the rung below the walkthroughs. |
| `test-help` | run | 20 | The walkthroughs, and the rules the design note called not optional. |
| `test-hostile-documents` | run | 22 | Documents that fight back. |
| `test-inbox-ingest` | run | 23 | The email import route, /api/inbox/ingest, run for real: its own Next |
| `test-inbox-worker-types` | run | 15 | The email import crosses a boundary no import can cross. |
| `test-inbox-worker` | run | 19 | The email Worker (worker/src/index.ts), run in Node with fetch stubbed: |
| `test-invites` | run | 8 | Invite a friend (migration-037). The arithmetic and every refusal were |
| `test-jobs` | run | 21 | A job: everything about one piece of work in one place -- what was |
| `test-just-the-file` | run | 16 | A document that is nobody's supplier, kept as a file and nothing else. |
| `test-keyboard-only` | run | 2 | Getting round without a mouse or a thumb. Someone using a keyboard, a |
| `test-keyboards` | run | 1 | Which keyboard the phone brings up. A money field that opens the full |
| `test-labels` | run | 2 | Every control needs a name. A button that is only an icon (✕, a torch, a |
| `test-late-payment` | run | 13 | What the law already entitles him to when a business customer pays late, |
| `test-lens` | clip runner | 3 | An iPhone-like lens zoom: 0.5 (ultra-wide) to 10, starting at 1. |
| `test-lines` | run | 6 | first check: draft invoice: 12.5 stays 12.5 |
| `test-links` | run | 17 | Its own dev server against the stand-in database; its waits allow for a |
| `test-locked-doors` | run | 9 | Every door, tried by somebody who has no business opening it. |
| `test-logo` | run | 12 | The business logo (item 40): picked in Settings, uploaded to the account's |
| `test-long-values` | run | 6 | Long names and big numbers, on a phone. A 60-character company name and |
| `test-lost-pages` | run | 3 | Three invoices in one nine-page supplier PDF. |
| `test-merge-contacts` | run | 10 | Two records for the same business: offer to merge, move everything over, |
| `test-midnight` | run | 7 | The hour after midnight, British Summer Time. |
| `test-migration-041` | run | 0 | migration-041 run against a real Postgres, before anyone runs it in Supabase. |
| `test-mileage` | run | 12 | Mileage at HMRC's rates, saved as an ordinary expense. |
| `test-money-combined` | run | 29 | CIS, VAT, credit notes and deposits ON THE SAME JOB, to the penny. Each |
| `test-money-edges` | run | 32 | The awkward ends of the money rules, straight off the app's own source: |
| `test-money-invariants` | run | 21 | Money, attacked by generating it rather than by picking examples. |
| `test-money-screen` | run | 24 | One page for everything owed to you and everything you owe, in the order |
| `test-more-money-invariants` | run | 47 | The other three money paths, attacked the way test-money-invariants |
| `test-multi-docs` | run | 32 | Several documents in one scan, and Save all ready. /api/scan is mocked; the |
| `test-neutral` | run | 0 | Neutral greys across the app (house style; the sweep, 2026-09-22): no |
| `test-next-number` | run | 13 | The next invoice number, worked out from one he already has. The Free |
| `test-no-accidents` | run | 7 | Nothing in someone's accounting record should go on one tap. Every |
| `test-no-hardcoded-colour` | run | 3 | Colours written into a component instead of taken from the theme. The |
| `test-no-sideways` | run | 1 | Nothing should scroll sideways (radoslav0922@gmail.com, 2026-09-22, the |
| `test-no-silent-contacts` | run | 12 | A contact list is only useful while it's clean. Typing a supplier's name |
| `test-numbering` | run | 10 | Invoice numbering on a brand-new account: the first invoice ever issued, |
| `test-odd-files` | run | 12 | The files people actually hand an app: a twenty-page PDF, a PDF that is |
| `test-offline-rules` | run | 12 | What the app promises when there is no signal, and what it must never do. |
| `test-one-handed` | run | 4 | The phone on its side (a van dashboard, a scanner held landscape) and |
| `test-one-total` | run | 13 | One invoice, seven places it is shown: the list, the dashboard, its own |
| `test-open-receipt` | run | 13 | Tapping one receipt. There is no page for a single receipt, so the list |
| `test-page-print` | run | 32 | Can the camera tell one document from another when both lie in the same spot? |
| `test-page-titles` | run | 4 | Every page needs its own name. |
| `test-paper-sheet` | run | 9 | A document is paper whatever the lights are doing. |
| `test-pay-several` | run | 9 | Marking several invoices paid at once (Atanas, 2026-09-24: "it should let |
| `test-payments` | run | 16 | The app writes the payment first and the invoice's new status second, as two |
| `test-pdf-pages` | run | 11 | How a long invoice is cut into PDF pages. The bug this exists for: the |
| `test-people-check` | run | 8 | What somebody reads when the "prove you're a person" check refuses them. |
| `test-period-income` | run | 18 | The income figure on /expenses, and the two things it used to get wrong. |
| `test-photo-ageing` | run | 54 | Letting old photographs go (notes/ageing-photos-design.md) -- the one place |
| `test-pinch` | clip runner | 3 | first check: pinching out zooms the camera (about 2.5×) |
| `test-plain-dates` | run | 3 | Dates on screen read "1 Oct 2026", never 2026-10-01 (the sweep, |
| `test-plain-words` | run | 5 | The words a stranger must not meet (notes/first-page-research.md): on |
| `test-prefix-wipe` | run | 13 | Clearing the invoice prefix, which is exactly what Atanas wants (a bare |
| `test-price-finder` | run | 15 | "Find it cheaper" on a quote line and on a comparison row: prepared |
| `test-price-words` | run | 6 | A supplier price with words in it. |
| `test-print` | run | 10 | What the customer actually receives. Print / save as PDF is how most of |
| `test-privacy-terms` | run | 22 | Privacy and terms (item 11). Needed before a penny goes on advertising, and |
| `test-promises` | run | 6 | A page must not promise what the front door refuses. |
| `test-public-links` | run | 5 | What a customer sees. A private invoice or quote link that has been |
| `test-public-logo` | run | 5 | The logo on the customer's own pages (/i/ and /q/), read on the server |
| `test-public-reads` | run | 11 | The customer's /i/, /q/ and /r/ pages, when the database answers with an |
| `test-public-request` | run | 29 | The supplier's price page, /r/<token> (item 53 on Atanas's list): its own |
| `test-quiet-failures` | run | 14 | Failures that said nothing, or said the wrong thing. |
| `test-quote-chase` | run | 7 | Quotes sent and gone quiet: a nudge on the list, ready to text. |
| `test-quote-links` | run | 19 | Its own dev server against the stand-in database; its waits allow for a |
| `test-quote-not-invoice` | run | 7 | A quote left on the Free page must not walk into a sales invoice. |
| `test-quote-requests` | run | 80 | Supplier quote requests, end to end against the dev server on 3305 with |
| `test-quote-vat-snapshot` | run | 9 | A quote keeps the VAT setting it was priced under. Without this, a quote |
| `test-quotes-fixes` | run | 11 | Review fixes on feature/quotes-ux: no save over a half-added customer, |
| `test-quotes-ux` | run | 47 | Quotes UX (feature/quotes-ux): pick anyone from clients and suppliers, |
| `test-quotes` | run | 34 | first check: empty list says no quotes |
| `test-readable` | run | 10 | Can people actually read it, in every colour (item 27). |
| `test-receipts-list-3302-orig` | superseded | 47 | first check: heading says receipts and bills |
| `test-receipts-list-3302` | superseded | 73 | first check: heading says receipts and bills |
| `test-receipts-list` | run | 54 | first check: heading says receipts and bills |
| `test-refusal-place` | run | 7 | Where a refusal appears, on a screen showing several things at once. |
| `test-register-outage` | run | 3 | When Companies House can't be reached. |
| `test-reminder-clock` | run | 23 | The reminder schedule against a fixed clock. These emails go to his |
| `test-reminders-ui` | run | 4 | first check: sent ones show their dates |
| `test-reverse-charge` | run | 56 | The VAT domestic reverse charge for building and construction services. |
| `test-review-fixes` | run | 21 | first check: no camera opened for picked files |
| `test-rls-audit` | run | 4 | Every table this project creates must have row level security on. A |
| `test-rls-live` | run | 10 | Row-level security, tried against a real Postgres instead of read off the page. |
| `test-rotated-pages` | run | 8 | Cutting a PDF whose pages are rotated. |
| `test-round-trip` | run | 11 | What goes in comes back out unchanged. Awkward text (apostrophes, |
| `test-route-guards` | run | 14 | Every server route, called the way a stranger would call it. The ones |
| `test-said-so` | run | 10 | What a screen says when the thing WORKED. Every one of these screens told |
| `test-same-again` | run | 22 | "Same again": last month's invoice to this customer, dated today. |
| `test-save-as` | run | 14 | Saving a document in every shape it can take (Atanas, 2026-09-22: "I |
| `test-save-these` | run | 20 | Taking a period of paperwork off the app and onto a device, in the four |
| `test-saved-prices` | run | 14 | The things you charge for, learned from what you have already invoiced, |
| `test-scan-budget` | run | 80 | A read must end. Nothing made it. |
| `test-scan-limit-text` | run | 10 | What someone is actually told when they hit the wall, and when they are not |
| `test-scan-sanity` | run | 18 | Readings that parse cleanly and are still wrong. |
| `test-scan-wall` | run | 18 | The wall someone meets at 50, and the one thing worth doing about it |
| `test-scans-left` | run | 17 | The allowance readout and the wall (queue items 5 and 21), now that |
| `test-send-document` | run | 17 | The route "Copy a document" emails its PDF through: on its own dev server, |
| `test-settings-add` | PENDING | 37 | Settings' account section, trading vs registered name, the one Add |
| `test-settings-save` | run | 39 | Settings after Atanas's voice notes (2026-09-22): one VAT switch, a |
| `test-share` | run | 2 | first check: Download PDF saves a PDF named after the invoice |
| `test-sign-out` | run | 11 | Signing out has to take this device's push notifications with it. |
| `test-sign-up` | run | 19 | Making a sign-in with a confirmation email (Atanas, 2026-09-22: "once they |
| `test-site-name` | run | 10 | One name for the app (item 26): the tab, the header, the sign-in line, |
| `test-source-text` | run | 1 | Every source file is plain text. Two held raw control bytes (a NUL in a |
| `test-statement` | run | 17 | A customer's statement: every issued invoice, what came off it, what's |
| `test-stored-photos` | run | 7 | Receipt photos that live in storage rather than in the row. |
| `test-suites-report` | run | 7 | The harness checking itself: can every suite be seen, and can it report? |
| `test-sw-behaviour` | run | 8 | The service worker, run rather than read. test-offline-rules checks sw.js by |
| `test-tap-targets` | run | 0 | Can a cold, gloved hand hit it? |
| `test-tax-rules` | run | 40 | The tax figures, against HMRC's own rules for 2026/27 worked out by |
| `test-tax` | run | 4 | first check: not VAT registered: profit 26,500 − 2,400 = 24,100 |
| `test-terms-of-use` | run | 35 | The things HMRC's terms of use make us declare, checked rather than |
| `test-texts` | run | 11 | first check: issued invoice:  |
| `test-theme` | run | 18 | Colour, and a theme people can choose (Atanas, 2026-09-23: "we need to make |
| `test-throwaway-email` | run | 8 | Refusing a throwaway inbox at sign-up (protection 3 of the three he chose). |
| `test-tiles` | run | 11 | A kitchen wall is not a document. |
| `test-tips` | run | 3 | first check: free page tip on visit ${visit} |
| `test-torch-nocv` | clip runner | 3 | Nothing here used to stop OpenCV loading, so "no OpenCV" was only ever |
| `test-torch` | clip runner | 11 | Torch: button when the camera has one, on by itself in low light, and a |
| `test-two-tabs` | run | 12 | The same record, open twice. |
| `test-two-users` | run | 5 | One account never sees another's records. |
| `test-unsure-fields` | run | 8 | What the reader was not sure of, on a document nobody watched it read. |
| `test-upload-panel` | run | 12 | The upload tile, with three doors instead of one door and a question |
| `test-uploads` | run | 14 | first check: dashboard: a way in from files |
| `test-utc-today` | run | 17 | Never ask UTC what day it is. |
| `test-vat-boundaries` | run | 26 | Where one VAT quarter ends and the next begins -- on both bases, and in |
| `test-vat-cash-basis` | run | 17 | The cash-accounting VAT figures, which are the ones copied into HMRC's |
| `test-vat-checks` | run | 25 | Keeping HMRC's answer about a VAT number. |
| `test-vat-from-rate` | run | 12 | VAT worked out from a printed rate when the document shows no VAT figure |
| `test-vat-lookup` | run | 29 | Checking a VAT number against HMRC, with HMRC stood in for. |
| `test-vat-number` | run | 20 | A UK VAT number's own check digits, used to catch a typo on the spot. |
| `test-vat-pennies` | run | 15 | VAT, to the penny, on the awkward invoices: three rates on one job, half |
| `test-vat-rate-scan` | run | 6 | A till receipt prints "VAT 20%" and no VAT figure (GO OUTDOORS, £29.00, |
| `test-vat-return` | run | 13 | The VAT figures for a quarter, on both bases. |
| `test-vat-snapshot` | run | 3 | first check: issued before VAT registration: no VAT, £1,000 due |
| `test-vocabulary` | run | 5 | One word for one thing. The app called the same person a "client" on some |
| `test-weekly-summary` | run | 9 | One push on a Monday: what came in last week, what is overdue, what is |
| `test-weight` | run | 8 | What a page costs to open, in bytes the browser actually downloads. |
| `test-what-surfaces` | run | 13 | What the dashboard puts in front of him, and when. This is the screen he |
| `test-worst-phone` | run | 4 | Every hard condition at once. |
| `test-write-fails` | run | 12 | What happens on each screen when the database refuses the write. Three |
