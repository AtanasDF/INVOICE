# Invoicer — scanner research and plan

Compiled 17 September 2026 against ten capture apps, for the scanner rework on the
`feature/scan-documents` branch. Sources are official help-centre and product pages,
release notes and reputable walkthroughs; each section says how well the sources support
it. Nothing here was tested hands-on in the competitor apps. Where a source was silent the
row says so rather than guessing.

Confidence: **QuickBooks** and **Zoho Expense** were researched in depth (about fifty
sources each). **Dext, Xero, Expensify, Sage AutoEntry** and the **Google Drive / ML Kit
scanner** come from their primary documentation. **FreeAgent, Wave** and **Coupa** block
automated reading of their help centres, so those rows come from search summaries of the
official articles and are marked low.

---

## 1. What the ten apps actually do

### QuickBooks Online (UK) — Receipt snap (confidence: medium)

- **Review screen.** Two tabs, *For review* and *Reviewed*. Each row shows its match
  state before you open it: number of bank-feed matches, *See suggested matches*, a
  *Match* button, or *Review* when nothing matched. The side panel's first field is
  *Document type*, which routes the same capture to an *Expense* (paid now) or a *Bill*
  (accounts payable). Field order: Document type, Payee, Bank/Credit account, Payment
  date, Payment method, Ref no., Amount, Tax, Memo, Category, Customer, Billable.
- **Confidence cues.** No score. A single *Missing info* state blocks posting until the
  gaps are filled.
- **Camera.** Green alignment frame when the edges are found, with coaching text
  ("Move camera closer", "Hold device level", "Hold steady"). Sources disagree on auto
  versus manual shutter across years. Library picker sits bottom-left. Repeated user
  reports of blurry captures on high-end phones and of gallery imports auto-cropped
  with no adjustable crop.
- **Line items.** None at review; one category per document with a separate *Add
  Split*. Help text claims per-line tax extraction; reviewers say lines are not read.
- **Supplier.** Existing suppliers are mapped by name; mobile lookup needs an exact
  stored name; an unknown supplier sometimes lands in the description field instead of
  being offered as new.
- **Dates.** Display follows the company date-format setting. How an ambiguous UK date
  is read is undocumented.
- **Credit notes.** Capture cannot become or attach to a supplier credit. A *Supplier
  credit* is entered by hand and auto-applied when you open *Pay bills*, showing a
  visible *Credit Applied* figure.
- **Multi-page.** Not supported: "Each image or file should only contain a single
  receipt or bill." Staff confirmed in 2022 and 2024.
- **Paid / to pay.** Decided by Document type. Bills list has *Unpaid* with "due later,
  soon, or overdue" text and *Mark as paid*. No bill reminders exist; the workaround is
  a recurring "Reminder" template that surfaces on the dashboard.

### Zoho Expense — Autoscan (confidence: medium)

- **Review screen.** There is none. A scan lands straight in the Expenses list as an
  uncategorised, *Unreported* expense. Two list sections carry state: *Receipts being
  scanned* and *Scan Failed Receipts* (with *Add Manually* / *Retry Autoscan*).
- **Camera.** Three named modes: *Single*, *Quick Scan* (keep shooting, no preview,
  uploads in the background) and *Multipage* (pages combined into one PDF, one
  expense). iOS has had automatic edge detection since 2018; Android does not. App
  Store reviews complain the iOS camera fires before focusing, with three to nine
  retakes; Zoho's own workaround is to turn edge detection off.
- **Line items.** Read on the paid *Standard* plan only; each line has amount, category
  and tax rate. Free gets header fields.
- **Supplier.** A plain *Merchant Name* text field. Categorise a merchant once and later
  receipts with the same name are auto-categorised.
- **Dates.** Only an organisation-wide date-format setting. Ambiguity handling is not
  documented.
- **Credit notes.** No document type. A refund is a negative amount typed with a minus
  sign, with no link to the original expense.
- **Multi-page.** *Multipage* mode; page limit and per-page failure are undocumented.
- **Paid / to pay.** Not applicable (expense claims); due-date extraction is listed as
  "Coming Soon".
- **Also notable.** Duplicate detection on date + amount + currency, surfaced as "Looks
  like a duplicate expense" with *Resolve now* / *Not a duplicate* / *Delete*. Scan
  quotas of 20 / 200 / 1,000 per user per month.

### Dext (confidence: medium)

- **Camera modes.** *Single* (one page), *Multiple* (several separate receipts, up to
  50 photos) and *Combine* (one document over several pages, up to 50 photos). The mode
  name makes "more pages" and "more receipts" impossible to confuse.
- **Review.** A review screen before submit with *Expand Item details* to edit fields,
  a crop icon top-right, then *Submit*. Items sit under *Processing* at the top of the
  inbox during extraction.
- **Extraction.** Supplier, date, tax, total, currency, invoice number; a dedicated
  line-item extraction product; document types include receipt, invoice, bank statement
  and credit note. Duplicate detection. Supplier rules remember how you categorise a
  supplier and apply it automatically.
- **Not stated.** Edge detection, indicator colours, due dates, paid state.

### Xero — Xero Me / Xero Expenses (confidence: medium-low)

- Extracts "the supplier, date, and amount". Approved claims are automatically turned
  into bills. Receipt analysis is an admin setting. Nothing found on line items, merchant
  matching, multi-page or credit notes on the capture side; Xero's bill credit notes are
  a separate manual object.

### FreeAgent — Smart Capture (confidence: low, official pages blocked)

- Smart Capture extracts date and amount and suggests a category; a captured file is
  then converted with *Convert to a new bill*. Unextracted fields are simply left blank
  for manual entry. Free tier is 10 files a month; *Smart Capture Unlimited* is £5 + VAT
  a month. Bills carry *Dated on*, *Due on* and a reference. Supplier credit notes are a
  first-class *bill credit note* object. Supplier matching and multi-page: not stated.

### Expensify — SmartScan (confidence: medium)

- Extracts merchant, date, total, currency. A failed scan shows **a red dot indicator
  with a message specifying which fields could not be scanned**, for example "Receipt
  scanning failed — missing merchant, date, and amount". Recovery is *Replace* the
  receipt image, which rescans.
- Camera tips are explicit: lay flat on a contrasting surface, capture the full receipt
  with total, date and merchant visible, avoid glare, use the in-app camera. A lightning
  bolt icon scans many receipts back to back.
- One primary receipt per expense; extra images can be attached. Workspace merchant
  rules apply category, tags and billable status by merchant name.
- Not stated: edge detection, date-format handling, multi-page documents.

### Wave (confidence: low, official pages blocked)

- Mobile: *Accounting > Receipts >* camera icon. Tap the receipt to edit date, amount,
  account, category and notes, then *Mark as reviewed*. Receipt scanning is on the paid
  Receipts or Pro plan. Nothing found on line items, supplier matching, multi-page or
  credit notes.

### Sage AutoEntry (confidence: medium)

- Document types are explicit: purchase invoices and receipts, **purchase credit
  notes**, supplier statements, sales invoices, sales credit notes, bank statements,
  expenses. Extracts totals and tax summaries "at each tax rate" and full lines with
  description, quantity and unit price. Arithmetic validation "never lets you post any
  incorrect invoices"; bank statements are checked against opening and closing balances.
- Not stated in the primary page: supplier matching rules, multi-page, the verify screen.

### Coupa Expenses (confidence: low, official pages blocked)

- OCR extracts merchant, date, amount and taxes into an expense line; corporate-card
  transactions pre-populate reports; voice entry of expenses exists. Enterprise product;
  nothing found on credit notes or multi-page on the capture side.

### Google Drive scanner and the ML Kit document scanner (confidence: high)

- **Edge detection.** A coloured outline (blue in the help article, "greens and blues"
  in the 2025 scanner) shows where the crop will fall. **Auto** and **Manual** capture
  modes; the newer scanner "begins scanning automatically" and, if it "sees a new page,
  it will scan it and add it to the file", with a stop button that pauses auto-capture
  while the outline keeps tracking.
- **After capture.** *Crop & Rotate*, *Filter*, *Clean* (erase stains and fingers),
  *Add*, *Retake*, *Delete*; save as PDF or JPG.
- **ML Kit** (the Android system scanner behind it) exposes three modes (base, base
  with filter, full with ML cleaning), a configurable page limit, and a switch to allow
  gallery import. It is the closest thing to a published spec for the benchmark camera.

---

## 2. Cross-cutting patterns worth copying

1. **One document-type field routes paid versus to-pay** (QuickBooks). The user never
   picks a form up front; the type decides whether a due date and paid state matter.
2. **Named capture modes for "more pages" versus "more receipts"** (Dext *Combine*,
   Zoho *Multipage*). Ambiguous buttons like "scan another" are the failure mode we had.
3. **Failure is a labelled state, not a silence** (Expensify's red dot naming the missing
   fields; Zoho's *Scan Failed Receipts* bucket with retry). The user always knows what
   to do next.
4. **A binary "missing info" gate beats a numeric confidence score** (QuickBooks).
   Nobody acts on "82%"; everybody acts on "the total is missing".
5. **Merchant memory** (Zoho, Dext, Expensify): categorise a supplier once and reuse it.
   Supplier matching by exact name (QuickBooks mobile) is the thing users complain about.
6. **Explicit camera coaching** (QuickBooks, Expensify): short imperative hints beat a
   silent viewfinder.
7. **Credit notes as a real document type linked to the original** (AutoEntry,
   FreeAgent) rather than a typed minus sign (Zoho) or nothing at all (QuickBooks
   capture).
8. **Arithmetic validation** (AutoEntry): lines and tax must add up to the total before
   posting.
9. **Duplicate detection** surfaced in the list with three plain choices (Zoho).
10. **Date handling is universally undocumented.** None of the ten explains how 08/09
    is read for a UK user. This is a place to be visibly better.

---

## 3. What tonight's rework already does with this

| Pattern | In the app now |
|---|---|
| Type routes paid/to-pay | Document type is the page heading; invoices get *Already paid* / *To be paid*; to-be-paid needs a due date and surfaces on the dashboard 3 days before it. |
| Pages versus documents | *Add another page* (cap 20) and *Start a new document* are separate, differently styled actions. |
| Failure as a state | Red error banner with *Try again* and *Retake last page*; a page that cannot be read shows a red tile; the camera shows a red frame and resets itself. |
| Missing-info gate | Save is blocked with the reason shown (unconfirmed date, missing total, bill without a due date). |
| Supplier matching | Normalised name match (ignores case, punctuation, Ltd/Limited/PLC) to existing suppliers; unmatched names get *Add as new supplier* in place. |
| Camera coaching | "Line up the document in view" then "Ready — tap to capture" with a green frame; zoom, tap-to-focus, library button bottom-left. |
| Credit notes | Their own scanned type, linked to the original scanned invoice, stored negative, shown with a red **CN** badge on the invoice and netted on the dashboard. |
| Dates | Day-first parsing of the date as printed; a date that could be either way must be confirmed or swapped before saving. No competitor documents this. |

---

## 4. Plan — what is not done yet, and where to go beyond them

### Near term (schema-free, can ship on main)

- **Duplicate detection on save** (Zoho pattern): same supplier, gross within a penny,
  within three days. The manual receipt form already has this check; the scan page
  should share it. Offer *Save anyway* / *Open the existing one*.
- **Arithmetic check** (AutoEntry pattern): when line totals are present and do not add
  up to the total within a small tolerance, show one amber line naming the gap. Never
  block; a receipt often has rounding.
- **Supplier memory**: when a supplier is matched, pre-select the category most used
  for that supplier's past documents, ahead of the global most-used category.
- **Camera coaching text** while the frame is not green: "Move closer", "Hold steady",
  based on quad size and stability, the QuickBooks pattern.
- **Auto-capture as an opt-in** (Drive pattern): once the frame has been green and
  stable for about a second, capture without a tap. Off by default; the brief asked for
  "ready to shoot", not for the phone to decide.

### Needs a schema change (feature branch, migration, backup first)

- **Scan failure queue**: a document whose extraction failed is kept as a draft row with
  its pages, listed under *Needs attention* with *Retry* and *Enter manually*, instead of
  living only in page state. Today a failed read is lost when the page is left.
- **Supplier rules**: per-supplier default category and VAT treatment stored on the
  supplier record, applied on match, editable in Clients & suppliers.

### Free invoice page (added 17 September, evening)

- The public template scanner runs on Gemini only for visitors; the Claude/Gemini
  comparison switch appears only when signed in, so the expensive engine is never
  reachable without an account.
- Its rate limit is per serverless instance (10 an hour per address, 200 an hour per
  instance). That bounds abuse to a few pounds an hour at Gemini Flash prices but is not a
  real brake. Follow-up: a shared counter (a small Supabase table keyed by address and
  hour, or Upstash) once the free page gets traffic.
- A cheaper Flash-Lite variant can be tried by changing one model constant; compare it
  on the same documents before switching.

### On the iPhone specifically

- The native camera (the default on iOS) cannot show a green frame or coaching text; the
  in-app scanner behind *Use the in-app scanner instead* can, but its image quality on
  iOS Safari was the reason the native path was chosen. The decision needs a real-device
  comparison of the two on the same document, which only Atanas can run.
- Auto-capture and page-limit UX on iOS would need the in-app scanner to win that test.

### Where to go beyond all ten

- **Day-first dates with a visible confirmation** is already ahead of every app studied.
- **The document type word as the heading**, not a dropdown buried in a panel.
- **Line items that can be corrected but never deleted**, because the scan is a record
  of the paper; none of the ten states a policy here.
- **Credit notes visible on the invoice they credit** in the list, with the net figure,
  rather than only inside a detail page.
- **Bills to pay on the home screen** with a three-day warning; QuickBooks has no bill
  reminders at all and Zoho lists due-date extraction as "Coming Soon".

---

## 5. Open items that block or shape the plan

- Migration-017 has not been applied. The branch cannot merge before it is.
- No real document has been through the new pipeline yet; the test-document folder with
  truth lines is the next gate.
- Whether the label-wrapped iOS capture, the in-app iOS scanner, zoom and tap-to-focus
  behave on a real iPhone is unverified.
- A second, cheaper scanner for comparison (Gemini Flash or a small open model) is
  queued for the next batch and will reuse the same tool schema so results are
  comparable field by field.
