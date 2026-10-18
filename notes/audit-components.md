# Component-layer audit (2026-10-18)

Scope: every file in `web/src/components/` (including the `scan/`, `free-invoice/`,
`invoice/`, `quote/`, `quoteRequest/`, `check-company/`, `help/` and `dashboard/`
folders) and every `.tsx` under `web/src/app/` (pages, layouts, AppShell, error and
not-found pages). About 27,000 lines, every line read. **Nothing was changed**; this is
the list.

The brief's seven classes:

1. A once-only action that is guarded by `disabled`/state rather than a ref.
2. An empty state, or a reassuring default, that can stand in for a failed load.
3. Error text that loses the reason or shows a library's or database's own words.
4. A removal without a `window.confirm` that names what goes.
5. A hard-coded hex colour.
6. Text or controls that go invisible in dark mode or on the black camera screens.
7. Money or date arithmetic done in a component rather than in `src/lib`.

Every finding has a file:line and the concrete thing a person would see. ✓ marks the
findings I re-read in the code after the first pass. The rest were read once, with the
lib code they depend on, and were not run. Nothing here was reproduced in a browser:
`node_modules` is not installed in this checkout.

**A caveat on class 1.** CLAUDE.md says two presses in one tick both reach a handler
guarded only by `disabled` (the ScanLimitNotice comment). The class-1 findings take that
as given. Where the first press unmounts the button (navigates away, closes the camera),
the window for a second press is narrower. It is still there on a slow phone, so those
findings are kept.

---

## The worst ones first

These are the ones that put a wrong figure in front of a customer or into the books.

1. **In dark mode, an invoice or quote saved as a PDF or picture is a black page with pale
   writing, and that includes the PDF emailed to the customer.** ✓ The sheet that
   `renderInvoicePdf` and the Save-as pictures photograph uses `bg-white text-neutral-900`.
   In dark mode `white` is `--paper` (#191b1f) and `neutral-900` is #f2f4f6.
   `backgroundColor: "#ffffff"` in `invoicePdf.ts:56` only fills transparent pixels, so the
   photograph is dark. The never-themed `--sheet` token exists for exactly this (globals.css:48–53)
   and isn't used here. A signature (#111827 ink on a transparent PNG) and a dark logo
   vanish into it. Where it happens:
   - `components/SendInvoicePanel.tsx:102`: the sheet behind **Send by email**, Share and Download
     on the invoice and quote pages, which is what the customer receives.
   - `components/invoice/PublicInvoiceView.tsx:66,71` and `components/quote/PublicQuoteView.tsx:166,171`:
     the customer's own `/i/` and `/q/` page. THEME_BOOT follows the phone, so a customer
     whose iPhone is in dark mode downloads a black invoice.
   - `components/free-invoice/FreeInvoiceBuilder.tsx:331`: the Free page's Save-as sheet.
   - `components/free-invoice/ScaledPreview.tsx:35` and `components/invoice/InvoiceDocument.tsx:358`:
     the on-screen A4 preview and the document's own root, so the signature can't be seen
     even on screen.
   - `components/invoice/IssuedInvoice.tsx:163`: "Paid" is `text-green-700`, which dark mode
     redefines to #5bd98a. The `@media print` reset only puts `--n-*` and `--paper` back, so
     an invoice printed from a dark-mode phone has "Paid" in pale green on white paper
     (about 1.9:1).

2. **Two "Marked as paid" payments for one invoice.**
   - `app/invoices/page.tsx:135–136` (button :375) ✓. `quickMarkPaid` guards with
     `marking.includes(inv.id)`, which is state captured at render. Two taps in one tick both
     pass, both read the same payments, both work out the same `due`, and both call
     `paymentsStore.add`. The invoice is paid twice in the record. `invoices/[id]` fixed
     exactly this with refs; this copy on the list was missed.
   - `app/page.tsx:352–369` (dashboard "Mark N paid") ✓. Each invoice is
     `paymentsStore.add` and then `invoicesStore.update(status:"paid")` inside one try. If
     the insert lands and the update fails, the invoice is reported as failed and stays
     picked with its old `amountDue`. The error says "Couldn't record #N", which invites
     pressing again, and the second press inserts a second full payment. This is not a
     double tap, so the ref doesn't stop it.

3. **A credit note typed as "1,200.00" is saved as £1.** ✓
   `app/invoices/[id]/page.tsx:516`: `amount: parseFloat(cnAmount) || 0`. The payment form on
   the same page uses `parseAmount` (:237). The same line means "-50" saves a negative
   credit, which raises what the customer owes, and "abc" saves a £0 credit note. The wrong
   figure reaches the printed invoice, the `/i/` link and the reminders.

4. **After a credit note on a CIS invoice, the printed lines don't add up to "Amount due"
   by a penny.** `components/invoice/IssuedInvoice.tsx:35–36` works out the CIS shown as
   `Math.round(totals.cis * billedShare * 100) / 100` in the component. The amount due comes
   from `creditOffDue` in lib, rounded separately. Checked in node by the reviewer: total
   £100.00, CIS £10.00 on £50 of labour, credit note £4.25. The sheet prints −£9.57 and
   −£4.25 (which leaves £86.18) and "Amount due £86.17". This is on the customer's PDF and
   `/i/` page.

5. **Line amounts on the sheets are unrounded, so the lines can add up to a penny more than
   the total.** `components/invoice/InvoiceDocument.tsx:93`, `components/invoice/IssuedInvoice.tsx:94`
   and `components/quote/QuoteDocument.tsx:63` print `quantity * unitPrice` straight through
   the formatter. Two lines of 0.5 × £2.25 each print £1.13 (1.125 rounds up), while the
   subtotal and total print £2.25. `QuoteDocument.tsx:6` also has its own `money` copy,
   which prints "£-50.00" for a discount line where lib prints "−£50.00".

6. **The customer's `/i/` link shows the full amount when a database read fails.**
   `app/i/[token]/page.tsx:21–22` relies on `lib/publicInvoice.ts:25–45` ✓, which discards
   every `error`. If the `credit_notes` or `invoice_payments` read fails, `(notes ?? [])` and
   `(pays ?? [])` make the customer's page show everything still owed, with no credits and no
   payments. A failed `business_profile` read blanks the bank details. A failed link or
   invoice read gives the not-found page, which says "Nothing has gone wrong at your end".
   `app/q/[token]/page.tsx:17–18` and `app/r/[token]/page.tsx:17–18` have the same pattern
   (`publicQuote.ts:25–47`, `publicQuoteRequest.ts:32–43`). An older quote with no VAT
   snapshot is priced ex-VAT when the profile read fails (`publicQuote.ts:101`, `?? false`).

7. **Mileage claimed at 45p a mile when the trip list failed to load.** ✓
   `app/mileage/page.tsx:57–69`. If `receiptsStore.all()` fails, `receipts` stays null and
   `already` falls to 0. `claimFor` then prices every mile at the first-10,000 rate, even for
   somebody already past it who should get 25p. The tax-year card says "Loading…" for ever
   (:245). Save clears the load error (`setError(null)`, :112) and writes the overstated claim
   into the expenses with nothing on screen to say so.

---

## 1. Once-only actions guarded by `disabled` or state, not a ref

Each of these is an insert or a send, so a second run makes a second row or a second email.

| Where | What a double press does |
|---|---|
| `app/invoices/page.tsx:135` (button :375) | Two payments; see the worst ones above. ✓ |
| `app/invoices/page.tsx:215–217` (button :282), "Same again" | Two copied draft invoices. |
| `app/invoices/[id]/page.tsx:477–504` (button :757), "Duplicate" | Two copied drafts. The person is taken to one and the other sits in the list. |
| `app/invoices/new/page.tsx:629–653` (button :964), "Save draft" | Two identical draft invoices. |
| `app/invoices/new/page.tsx:588–625` (button :772), "Add as new customer" | Two identical customers. `clients` has no unique name. |
| `app/clients/new/page.tsx:164–192` (button :336), "Save customer/supplier" | Two identical contacts. |
| `components/ContactField.tsx:151` (button :300), "Add as customer/supplier" | Two identical contacts. |
| `components/quote/CustomerPicker.tsx:170–199` (button :279), "Add customer" | Two identical customers; the same-name check reads the same stale list. |
| `app/scan/page.tsx:890–928` (buttons :1380, :1414), "Save/Add as new supplier" | Two suppliers of the same name; both presses check `exactSupplier` against the same stale list. `save()` and `saveAll()` beside it do use `savingRef`. |
| `app/receipts/new/page.tsx:210–255` (button :463), "Save receipt" | The same receipt saved twice. Both presses pass the duplicate check, which reads the list loaded on mount. The expense is counted twice. |
| `components/quoteRequest/RequestForm.tsx:36–51` (button :140), with `app/quotes/requests/new/page.tsx:125–129` | Two identical requests, each with its own supplier rows and `/r/` links. |
| `app/quotes/requests/[id]/page.tsx:124–141` (button :317), "Email request" / "Send again" | The supplier is emailed twice. `run()` sets `busyRef` but never checks it on entry, and the route doesn't de-duplicate. |
| `app/feedback/page.tsx:32–55` (button :82), "Send feedback" | Two feedback rows and two emails to FEEDBACK_TO. |
| `components/help/HelpChat.tsx:63` (button :135), "Email this to Atanas instead" | No ref and not even `disabled`. A double press, or a second press while the first is slow, gives two feedback rows and two emails. |
| `components/DocumentCapture.tsx:2004` (`acceptBatch`, reached from `scan/BatchReview.tsx:126`) ✓ | No guard at all. On /scan every document is read twice and taken twice from the 50-a-day allowance. On /copy every page appears twice in the PDF (`copy/page.tsx:138`). |
| `components/ScanLimitNotice.tsx:50`, "Read it now" ✓ | No guard, unlike "Give me another 600" beside it. Two presses send the document to /api/scan twice, spending two of the scans just granted. |
| `components/SignInCard.tsx:140` (resend) and `onSubmit` (:157; buttons :263, :371) | "Send it again" sends two emails, or the second fails with Supabase's rate-limit message, shown beside "Sent again to …". With Turnstile on, "Make my account" sends the one-use token twice. The second refusal can then put "The check that you're a person hadn't finished…" on the check-your-email screen of an account that was made. |
| `app/settings/page.tsx:460–469` (button :1027), the sign-in-email send | The same pairing: "Sent to …" next to a red raw rate-limit message. |
| `app/settings/page.tsx:305–322` (button :1006) and `app/page.tsx:541–551` via `components/UploadPanel.tsx:141–150`, making the email-in address | Two presses make two tokens, and the last save wins in the database. The address shown, which the person copies, is whichever call *resolved* last, so it can be the one that was overwritten. Mail sent to it never arrives in Needs review. |

Lesser ones, where nothing is duplicated but the person is told something false:

- `app/quotes/[id]/page.tsx:124–138`. `run()` sets `busyRef` but doesn't check it. The
  second press is refused by the conditional update and shows "This quote has changed since
  the page loaded…", "…already invoiced" or "The deposit has already been invoiced…" beside
  a press that worked. Its `finally` also re-enables every button while the first press is
  still making the invoice.
- `app/quotes/requests/[id]/page.tsx:394`, "Add": "That supplier is already on this request"
  after the first press added it.
- `components/quoteRequest/AnswerEntry.tsx:102–121` (button :203). The supplier's document
  is uploaded twice to a new `Date.now()` path, so an orphan file is left in the `receipts`
  bucket. The second record is refused with 40001 and shows "This supplier's answer has
  changed…" beside a save that worked.

## 2. Empty state or a default standing in for a failed load

- `app/scan/page.tsx:535–538` with :626. Arriving at /scan opens the camera at once. If
  `loadLists()` fails, `setScanError(...)` lands behind the full-screen camera. After the
  capture, `show(d)` runs `setScanError(d.error)` with `null` and wipes it. The form then
  shows:
  - an empty supplier picker, so no match is found for a supplier who exists;
  - the built-in categories instead of the person's own;
  - "Add as new supplier" checking against `[]`, which creates a duplicate of a supplier
    they already have.
- `app/invoices/new/page.tsx:167–182`. The load `Promise.all` has no `.catch`. On failure the
  customer picker and saved items are empty, "Will be <number>" disappears, and totals are
  worked out as not VAT-registered, with nothing on the page to say so. A photo copy then
  awaits the rejected `listsRef` and says "Couldn't read the invoice." although the reading
  worked.
- `components/invoice/InvoiceReminders.tsx:23` ✓, `.catch(() => setSent(new Map()))`. If the
  sent-reminders read fails, every reminder already sent shows "Not sent". The one in its
  window says "Goes out today" (:48) although it has gone.
- `components/ContactField.tsx:116` with :284. A Companies House failure (`RegisterUnavailable`)
  sets `items` to `[]`. If a saved contact also matches, the list stays open and says
  "Nothing more on the Companies House register.", a definite answer from a register that
  was never asked.
- `components/check-company/CompanyChecker.tsx:96` ✓, `.catch(() => {})`. Somebody opening a
  shared `/check-company?number=…` link on a dropped signal gets the blank "What is the
  company called?" form. The number isn't filled in and there is no error.
- `app/quotes/[id]/page.tsx:141–147` and `app/quotes/requests/[id]/page.tsx:150–157`. A load
  failure shows the red error with "Quote not found." / "Request not found." beneath it,
  which is false when the database was merely unreachable. `invoices/[id]` gets this right
  (:560–562).
- `app/quotes/new/page.tsx:191` with :78 ✓, and `app/quotes/requests/new/page.tsx:120` with
  :139. The error says "Couldn't load your clients. You can still fill this in." but `data`
  stays null, so no form is rendered. There is nothing to fill in.
- `app/clients/[id]/statement/page.tsx:67`. The subtitle is "Loading…" whenever `client` is
  null. After a failed load it stays beside the red error for good. For an id that isn't one
  of the account's contacts the page says "Loading…" for ever, with no error.
- `app/money/page.tsx:71–85` with :130 ✓. One `error` serves both the load and "Mark paid".
  When marking a bill paid fails, the `error ? null :` gate hides every figure that *had*
  loaded: totals, Owed to you, You owe. Only "Couldn't mark that bill paid." is left until
  the page is reloaded.
- The `/i/`, `/q/` and `/r/` server reads, and mileage: see the worst ones above.

## 3. Error text

- `app/feedback/page.tsx:51` and `components/EmailFileForm.tsx:62` use
  `err instanceof Error && err.message ? err.message : …`. A dropped connection on iPhone
  Safari throws `TypeError("Load failed")`, so the person sees just "Load failed".
  EmailFileForm is also reached from `components/scan/JustTheFile.tsx:34–41`, where pdf-lib
  can throw from `pagesToPdf` and its own wording is shown. `saveFailed` or `PDF_FAILED`
  covers both cases.
- `components/PriceFinder.tsx:59`. `errorText` also catches the network TypeError, so
  "Load failed" again. `errorText` is meant only for app-written sentences.
- `components/SendInvoicePanel.tsx:234`. The email path passes a throw from
  `pdf.currentPdf()` through `saveFailed`, which hands any `Error` straight through. A
  dynamic `import("jspdf")`/`import("html-to-image")` failing offline or after a deploy shows
  "Importing a module script failed.". Share and Download on the same panel (:85, :95)
  already use `PDF_FAILED`.
- Supabase's auth errors are `AuthError extends Error`, and `saveFailed` passes any `Error`
  through, so GoTrue's own words reach the person:
  - `components/SignInCard.tsx:151,217` ✓: "Invalid login credentials", "email rate limit
    exceeded", "For security purposes, you can only request this after 42 seconds."
  - `app/settings/page.tsx:465–466`: the same, against the intent of the comment at :89–92.
  - `app/reset-password/page.tsx:60–65`: "New password should be different from the old
    password." This one is readable, but it is the library's sentence.
- `components/SignInCard.tsx:100`. Any `error_description` in the URL hash that doesn't match
  /expired|invalid/ is shown as-is in a red alert. That includes Supabase's own text
  ("Database error saving new user"), and any text put into a crafted
  `/login#error_description=…` link, shown on the sign-in box.
- `app/receipts/new/page.tsx:137` and `app/receipts/page.tsx:355`. The exchange-rate fetch
  (frankfurter.dev, not Supabase) goes through `saveFailed`. Offline, changing the currency
  says "Couldn't reach your records…", which names the wrong thing and drops the "enter one
  manually" advice.
- `app/page.tsx:541–551` with `components/UploadPanel.tsx:146–149`. If
  `businessProfileStore.get()` or `save` rejects, the `await` in UploadPanel has no catch, so
  `setMaking(false)` never runs. "Making your address…" stays on screen for ever with no
  error and no retry.

## 4. Removal without a naming confirm

- `app/clients/page.tsx:230–240` (button :476). "Archive" hides a customer or supplier from
  every picker on one press, with no confirm. It sits beside Remove, which does ask.
- `app/settings/page.tsx:826` ✓. "Reset to defaults" replaces a customised category list in
  one press. The next Save, perhaps made only to fix bank details, saves the reset. The bar
  says only "Unsaved changes."
- `components/free-invoice/DraftEditor.tsx:116` (button :365). `forgetSaved()` wipes the
  signature remembered on this device with no confirm. The button's label names it, but one
  stray press loses a drawn signature.
- `app/invoices/new/page.tsx:215–216` with ClearFormButton. On an imported form, Clear also
  runs `clearFreeInvoiceDraft()`. The confirm says only "Everything you've entered here will
  be removed" and never mentions that the Free page's saved draft goes too, which is the
  only copy of the photographed invoice (see the comment at :185–188).
- `app/recurring/page.tsx:186` and `app/recurring/invoices/page.tsx:196`. These confirm, but
  "Remove this repeating expense?" / "…invoice?" don't say *which* one, so on a list of
  several the dialog can't be checked against the row pressed.

## 5. Hard-coded hex

- `components/DocumentCapture.tsx:2025, 2130` ✓: `bg-[#4ADE80]` with `text-neutral-900`.
  It is wrong in dark mode (see class 6), not merely off-convention.
- Legitimate, and left alone: `DocumentCapture.tsx:189,195,1350` (canvas overlay over the
  camera), `:2188` (a border with no text), `free-invoice/SignaturePad.tsx:8` (ink on the
  never-themed pad), `ThemePicker.tsx:21` (the swatch depicts light and dark),
  `SpendChart.tsx:23,28` (Recharts needs real values; the tokens are read in an effect, so
  only the very first frame in dark mode is wrong), `app/global-error.tsx` (renders without
  the app's CSS) and `app/opengraph-image.tsx`.

## 6. Invisible in dark mode, or on the camera

The camera screen is `bg-black`, which never changes. `white` there becomes #191b1f and
`neutral-900` becomes near-white.

- `DocumentCapture.tsx:2372` ✓. The shutter, before a page is found, is `border-white
  bg-white/20`: a #191b1f ring on black, about 1.2:1. The main button nearly disappears.
- `DocumentCapture.tsx:2256` ✓. The failure box is `bg-red-600/90 text-ink-on-dark`. Dark mode
  redefines red-600 to #ff8080, so the failure message is white on light pink (about 2.4:1).
- `DocumentCapture.tsx:2025` ✓. The batch count badge is near-white on light green.
- `DocumentCapture.tsx:2130` ✓. On the iPhone-camera path, "Check and read N scans" is
  near-white on light green and can't be read.
- `DocumentCapture.tsx:2020` (on the `bg-neutral-800` tile at :2016) ✓. "PDF" is white on
  #e2e5e9.
- `DocumentCapture.tsx:2285` ✓. The diagnostic readout is `text-neutral-200` (#232529) on
  black, so it is invisible. This is the readout CLAUDE.md says to screenshot from the field.
- `DocumentCapture.tsx:2213`. On the denied screen, the iPhone fix-it tip is `text-neutral-400`
  (#565a62) on black, about 2.9:1.
- `DocumentCapture.tsx:2190` ✓. The capture flash is `bg-white`, so it is a near-black blink
  that can't be seen.
- `DocumentCapture.tsx:2275` ✓ and `:2331` ✓. Torch on and the selected zoom pill are
  `bg-white text-neutral-900` and look the same as torch off and an unselected pill.
- `DocumentCapture.tsx:2317` ✓. The zoom slider is `accent-white`, so the thumb and fill go
  near-black over the picture.
- `DocumentCapture.tsx:2123, 2227, 2384`. "Take a photo", "Turn the camera back on" and
  "Upload a photo or PDF" are `bg-white` on black. The text stays readable, but the button
  shape vanishes. The `border-white/30` outlines at :2143, 2204, 2214, 2231, and the frames
  at :2016/2018, 2193, 2366, vanish the same way.
- `components/Tip.tsx:32` ✓. With `dark` set, "Got it" is `text-white/80` on `bg-black/70`, so
  near-black on near-black. It is shown on the camera at `DocumentCapture.tsx:2300, 2304,
  2352`. The tip's body already uses `text-ink-on-dark`; the button doesn't.
- The invoice and quote sheets: see the worst ones above.

## 7. Money and date arithmetic in a component

With a wrong outcome:

- The credit-note parse, the CIS line and the unrounded sheet lines: see the worst ones above.
- `app/receipts/page.tsx:73–92`, `app/receipts/new/page.tsx:148–165` and
  `app/scan/page.tsx:282–292`. Net (`total - vat`) and the currency conversion
  (`total * rate`) are worked out in each page and stored unrounded. `receipts.amount` is
  plain `numeric`, so £19.99 with £3.33 VAT is stored as 16.659999999999997, and EUR 19.99 at
  0.8567 as 17.125…. The VAT return rounds per row, so its boxes are right. The record and
  the JSON export carry sub-penny figures, and a total summed before display can differ by a
  penny from the rows listed under it. `api/inbox/ingest:34` has the same maths (outside
  this audit).
- `app/receipts/review/page.tsx:108–120` with `app/receipts/page.tsx:53`. `approve` writes
  only `amount`/`vatAmount` and leaves `originalAmount`/`fxRate`. The page tells the person
  to "Edit the GBP figures above if that looks off" (:289). Example: an emailed EUR 100 at
  0.86 is corrected here to £90. Later, Edit → Save on /receipts (say, to fix a spelling)
  refills from the original and the rate and silently puts £86 back.
- `app/expenses/page.tsx:31–42`, used at :80–81 and :162 ✓. In Week mode, clearing the date
  box sets `weekAnchor` to "". `new Date("").toISOString()` then throws RangeError during
  render and the Expenses page drops to the error boundary.
- `app/expenses/page.tsx:102–132`, shown at :305. The per-category split is pro-rata floats
  rounded only for display. A £10.00 receipt with three equal lines in three categories shows
  £3.33 three times (£9.99) beside a £10.00 total, although the comment at :113–117 promises
  they "always sum back to exactly r.amount".
- `components/scan/LineItemsTable.tsx:6` and `:51`. `quantity * price` is shown with
  `.toFixed(2)`: 0.5 × £0.35 is 0.17499… and shows "£0.17" where the document says £0.18.
- Timestamps sliced to a UTC date, which gives the wrong day between 00:00 and 01:00 BST:
  - `app/quotes/requests/page.tsx:66` and `app/quotes/requests/[id]/page.tsx:249`:
    `shortDate(r.createdAt)` via `components/quoteRequest/dates.ts`, so a request made at
    00:30 is labelled yesterday.
  - `components/check-company/CompanyReportView.tsx:262`: `checkedAt` is formatted in UTC
    (`lib/companyReport.ts:91`), so a check at 00:30 says it was read the day before, and
    the copied report text says the same.
- `app/quotes/page.tsx:42, 44, 81`. "Sent N days ago" counts from the quote's own date, not
  from when it was sent. A quote dated 1 Oct and sent on 15 Oct says "sent 17 days ago" on
  18 Oct, and moves to "Waiting on an answer" after three real days instead of five.

Done in a component but correct as it stands. These need no fix, but are the places a
future edit could go wrong:

- `PaidCelebration.tsx:39–42`, `TaxSoFar.tsx:7,12`, `CisFields.tsx:74`, `QuoteForm.tsx:65,67`,
  `PriceForm.tsx:109`, `Compare.tsx:188,194`, `CreditOfSelect.tsx:10` and
  `DraftEditor.tsx:98`.
- `app/page.tsx:245–298,392`, `app/invoices/page.tsx:77–144`, `app/invoices/[id]/page.tsx:29,718,723,860`,
  `app/invoices/new/page.tsx:51,537,544`, `app/quotes/[id]/page.tsx:214–216` and
  `app/clients/page.tsx:37–40,132`.

---

## Real defects outside the seven classes

Found on the way and confirmed by reading:

- `app/clients/new/page.tsx:130–147` ✓. `clearForm` doesn't reset `endUserDeclared`. A
  ticked "They have told me in writing that they are an end user" survives Clear form and is
  saved on the next contact, which **turns the VAT reverse charge off** for somebody who never
  declared it.
- `app/settings/page.tsx:410` ✓. Save writes back `inboxToken` from page-load state. Open
  Settings with no address, make one from the dashboard in another tab, then press Save in
  Settings: the new address is overwritten with null and stops working.
- `app/AppShell.tsx:314` ✓. The footer's "How it works" goes to `/help`, which is not in
  `isPublicPage` (:209–228). A stranger on `/` or `/login` who taps it is sent back to
  `/login`.
- `components/free-invoice/FreeInvoiceBuilder.tsx:63` ✓. The engine starts as `"claude"`, the
  picker (:389) is shown to every signed-in user, and its value is always sent. So every
  Free-page template scan uses Claude, despite "Gemini is the default everywhere since
  2026-10-15" and the rule that the picker shows only where `scan-engine` is set.
- `components/SendInvoicePanel.tsx:179–184, 192`. After a successful send, `sending.current`
  stays true. If the invoice then changes (new number or `resetKey`), the form returns but
  "Send invoice" silently does nothing. Only "Send again" (:255) clears the ref.
- `components/FileStrip.tsx:41` and `app/files/page.tsx:236,258`. The tile shows
  `money(r.amount)`, the net figure, so a £12 receipt with VAT reads £10.00, and a credit
  note reads negative.
- `app/vat/page.tsx:48–60`. "Copy the figures" says "Copied" even when the clipboard write
  failed.
- `app/mileage/page.tsx`. Typing "-5" passes the `!milesNum` check and saves a negative
  expense.
- `app/copy/page.tsx:98–103` builds its own `<a download>` instead of going through
  `saveFile.ts`, which CLAUDE.md names as the only place a file is handed to the device.

---

## Clean files

These have no finding in any class.

- **Components:** AddAnything, AddressFields, ClearFormButton, CompanyNameInput,
  CompanyNumberInput, DateRoller, GetTheApp, GettingStarted, InviteCard, KeptVatChecks,
  RegisterBits, ReportErrors, SaveAsMenu, SaveThese, ScanOrAdd, ScansLeft, StatementDocument,
  SwipePanels, TextCustomer, Turnstile, VatNumberInput, Welcome, icons, CaptureButton,
  UploadFilesButton.
- **Component folders:** dashboard/People, help/Walkthrough, scan/{DateConfirm,
  DocumentDetailsFields, FieldFlag, JustTheFile, PagesStrip, PaidChoice},
  free-invoice/{LayoutPicker, SendByEmail, SignaturePad, fields}, invoice/PublicInvoiceView
  (apart from the dark sheet), quote/QuoteSendCard,
  quoteRequest/{OrderLists, PublicRequestView, QuotesTabs, dates.ts}.
- **App:** AppShell (apart from the footer link), layout, error, global-error, not-found,
  global-not-found, opengraph-image, offline, login, help, files, vat, jobs, copy, convert,
  free-invoice, check-company, privacy, terms, security, accessibility, how-to-invoice, every
  `layout.tsx`, and the three token `not-found.tsx` pages.

## Looked at and rejected

Listed so the next audit doesn't redo them:

- `InvoiceReminders.tsx:9` slices the `sent_at` timestamp to a UTC date, but the reminder
  cron runs at 09:00 UTC (`vercel.json`), when the UTC and London dates always agree.
- `invoices/[id]` `confirmSend` double press. `assign_invoice_number` updates only
  `where status='draft'` and raises otherwise, so the counter rolls back and no number is
  burned.
- QuoteForm save double press. The second insert hits `quotes_user_id_number_key`, so no
  duplicate is made.
- Updates by id to the same values when run twice: `markBillPaid`, `saveEditReceipt`,
  `approve`, `changeStatus`, Settings Save, `savePicks`. Also the link `ensure` calls, which
  treat 23505 as success.
- Removals with a confirm that names what goes: `removePayment`, `removeCreditNote`,
  `removeInvoice`, `removeClient`, receipt delete, discard and Skip, `removeLogo`,
  stop-link, merge, release claim and deposit.
- Removing unsaved form lines, in-memory photos or pages: these aren't records.
- `ScanLimitNotice.tsx:21` `instanceof Error`. The error is always the app-built
  `Error(json.error)` from `scanClient.ts:62`.
- `convert/page.tsx:49`. A message is shown only if it is in `WRITTEN_FOR_PEOPLE`.
- `DocumentCapture.tsx:1159` shows OpenCV's own words, which is deliberate: it is the
  documented diagnostic.
- `bg-neutral-900 text-white` pairs everywhere. Both ends flip together, so they stay
  readable.
- `text-amber-500` (the star) and `border-red-500`: these colours aren't redefined, so they
  look the same in either theme.
- Every list empty state not named above is gated on `!error`, or sits behind an early
  return on the load error.
