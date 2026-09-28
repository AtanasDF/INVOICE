## Money going out — receipts, bills, expenses, mileage and the repeating ones

Seven screens, all of them about money **leaving** the business: `/receipts` (the list),
`/receipts/new` (one by hand), `/receipts/review` (the emailed ones nobody has checked),
`/expenses` (the year's totals), `/mileage` (trips), `/recurring` (repeating expenses) and
`/recurring/invoices` (repeating sales invoices, which sits in this section only because it
shares the screen's shape).

Everything here lives in **one database table, `receipts`**. His own sales invoices are a
different table and a different section. The camera and the reading of a document are
covered in `scanner-camera.md`; this section starts where a document has already been read
and picks up what the app then does with it.

---

### The three kinds of document, and how the app tells them apart

One table, four values in a column called `document_type`, and the difference between them
decides whether the app chases him for money:

| On screen | Stored as | What it means | Chased? |
|---|---|---|---|
| **Receipt** (grey badge) | `receipt` | Already paid for. A till receipt, a card slip. | No |
| **Supplier invoice** (blue badge) | `invoice` | Somebody is asking to be paid. **This is what the app calls a bill.** | Yes, if unpaid |
| **Credit note** (red badge) | `credit_note` | Money coming back — a refund or a correction. | No |
| **Other document** (grey badge) | `other` | A delivery note, a statement, anything that is not money. | No |

Three things follow from that, and they are the whole logic of the section:

1. **A bill is exactly `document_type = 'invoice'` and `paid = false`.** Nothing else. There
   is no separate bills table and no "bill" flag.
2. **A credit note is stored with a negative amount and negative VAT** — both `amount` and
   `vat_amount` go in as minus numbers. That means every total in the app nets off
   automatically: nothing has to remember to subtract anything. A credit note can also point
   at the bill it refunds (`credit_of_receipt_id`), and then the bill's row shows the reduced
   figure and a grey **Credit note** badge.
3. **`receipts.amount` is always net — the figure without VAT — and always in pounds.** The
   forms all ask for the **total paid including VAT** and work the net out by subtraction,
   because that is the number printed on the paper. A foreign receipt is converted to pounds
   at save time and never stored in its own currency as the live figure.

**How the type is decided.** A scanned document's type is the reader's own answer, confirmed
by him on the scan page before saving. A receipt typed in by hand is **always** a plain
`receipt` — the by-hand form has no type control at all and the store defaults to `receipt`
(`src/lib/storage.ts`). So a bill can only get in by being scanned, emailed in, or created as
a recurring expense; it cannot be typed on `/receipts/new`. Once saved, the type shows on
every card and cannot be changed by editing — **Edit** on a row will let him change the
supplier, date, category, figures, invoice number, due date and Paid tick, but not turn a
receipt into a bill.

---

### Receipts & bills — `/receipts`

- **What it is for.** The whole record of paper that came in: shop receipts, supplier
  invoices waiting to be paid, and credit notes. Header line: *"Receipts, supplier invoices
  (bills) and credit notes you've captured."*
- **How you get there.** Header → **Money out ▾ → Receipts & bills**. Also from the dashboard
  whenever a receipt is tapped (arrives as `/receipts?open=<id>`), from the file library, and
  from the **Needs review** badge on a row.
- **What is on it**, in screen order:
  1. **"Receipts & bills"** with the sub-line, and top right **Download for a spreadsheet**
     (only once there is at least one row) and **Scan receipts** / **+ Add** (the standard
     `ScanOrAdd` sheet, whose by-hand route here is `/receipts/new`).
  2. **A tip** the first few times (`tip:receipts-batch`): *"Tip: **Scan receipts** keeps the
     camera open, so you can photograph a whole pile in one go, then check them and save them
     one after another."*
  3. **The supplier-linking offer** — a grey card, only when there is something to offer:
     *"4 documents match your suppliers · which?"* with a ✕ to dismiss. Three or fewer and
     the list is open already; more and **which?** unfolds it. Each line is a tick box
     reading `Screwfix Direct · INV-8812 → Screwfix`, and the button says **Link 4**. See
     *Linking a document to a supplier* below.
  4. **Filter** (a fold-out, already open when any filter is set): **Payment status** (*All
     statuses*, *To pay*, *Overdue*, *Due in the next 7 days*, *Paid*), **Document type**
     (*All types*, *Receipts*, *Supplier invoices*, *Credit notes*, and *Other documents*
     only if any row is one), **From**, **To**, **Category**, **Supplier**, a **Kept handy
     only** tick box, a **Tag** dropdown if any row is tagged, and **Clear filters**. The
     payment-status filter only ever matches supplier invoices — picking *To pay* hides every
     receipt, because a receipt is already paid. With a payment filter on, the rows re-sort
     **soonest due first** and anything with no due date goes last.
  5. **The rows**, one white card each. A thumbnail (a document icon for a PDF; the words
     **Emailed to you** where the photograph has been aged out — see `file-tools.md`), then
     the supplier name, the amount in bold, then badges: the **type** badge always, a **bill
     status** badge for a supplier invoice, and a blue **Needs review** badge that is a link
     to `/receipts/review`. Under that, `INV-8812 · 14 Sep 2026 · Materials & stock`.
     Then a row of actions: **Details ▾**, **Mark as paid** (only on an unpaid supplier
     invoice that is not waiting on review), **★ Keep handy** / **Kept handy**, **Edit**,
     **Remove**.
  6. **Details** opens: net and VAT (`£1,032.00 excl. VAT · £215.00 VAT`, and where there is
     a credit note the netted figures plus *"£250.00 credited"*), the original currency if
     there was one — `(from EUR 1450.00 @ 0.8600)` — whether a supplier is linked, what name
     was printed on the paper if it differs, *"Credit note for INV-8812"*, a page count if
     the document has more than one page, the notes, every extra field the reader pulled off
     the document (account number, sort code, IBAN, BIC, payment terms, reference, PO number,
     order number, customer reference, supplier address, supplier VAT number, supplier email,
     supplier phone, delivery address — `DOCUMENT_DETAIL_LABELS` in `src/lib/storage.ts`),
     a warranty line if one was entered (*"Warranty: 24 months (until 2028-09-14)"*), the
     tags as grey pills, and the individual items if the receipt was split.
  7. **Empty state:** *"No receipts or bills yet. Scan a few at once, or add one by hand."*
     or *"Nothing matches these filters."* — and neither ever shows when the load failed.
  8. **Arriving at one particular row.** `?open=<id>` scrolls that card into the middle of
     the screen, rings it, opens its details, and fades the ring after four seconds; the
     address tidies back to `/receipts`. There is no page for a single receipt, so the list
     brings the row to him instead. If the row is not there any more he is told —
     *"That receipt isn't here any more. It may have been merged into another one."* — rather
     than landing silently at the top of a long list.
- **The bill status badge, exactly.** `billStatus()` in the page, and it only ever appears on
  a supplier invoice:
  - paid → green **Paid**
  - unpaid, no due date → grey **To pay**
  - unpaid, due date in the past → red **Overdue · was due 12 Sep**
  - unpaid, due **today** → **To pay · due today**; **tomorrow** → *due tomorrow*; otherwise
    *due 18 Sep*
  - and the colour of that last one is **amber when the due date is 3 days away or fewer**,
    grey when it is further off.
- **What it does behind the scenes.** Four reads on arrival — suppliers, receipts, the
  business profile (for the category list) and the page counts — straight from Supabase under
  row-level security. Every figure is worked out in the browser. Editing a row is done
  **inline on the card**, not on another page. **Download for a spreadsheet** writes
  `receipts-<date>.csv` of **the filtered rows only**: date, type, invoice_number, due_date,
  paid, vendor, supplier, category, amount_excl_vat, vat, amount_incl_vat, notes, tags.
  **Remove** asks first and names what goes — *"Remove Screwfix, £1,247.00? It won't be in
  your records any more, and this can't be undone."*
- **Where it takes you next.** `/scan`, `/receipts/new`, `/receipts/review`, and the standard
  add sheet's other routes (`/invoices/new`, `/quotes/new`).
- **Free, gated or not built.** Behind sign-in. **Costs nothing to run** — no model call, no
  paid API, no switch. Only the **Scan receipts** button leads to something that costs money
  and is limited (see `scanner-camera.md`). Editing, filtering, marking paid and the CSV are
  unlimited.

**Linking a document to a supplier.** A scanned receipt keeps the name printed on the paper
in `vendor`; being *linked* to a supplier record is separate, and often the supplier did not
exist yet when the document was scanned. The offer card catches up afterwards, and the
matching is deliberately **stricter than at scan time** (`src/lib/supplierLinks.ts`):
`bulkMatchSupplier` takes an exact name, or every significant word of the supplier's name
appearing as a whole word on the document — so *"Screwfix Direct"* is Screwfix, but
*"Espresso Bar"* is **not** Esso and *"Costain"* is not Costa. A name with no significant
word (*BP*, *B&Q*) must match exactly. Two suppliers fitting equally well (*Travis*,
*Perkins*) is treated as a guess and not offered. The reason for the extra strictness is
written into the file: linking in bulk is one tap over many rows, with nobody reading each
one. Unticking a line, or dismissing the card, remembers that row for ever — in
**localStorage**, per device (`receipts-link-skip`), so the offer comes back on his other
phone. A row where **No supplier** was chosen on purpose (`details.noSupplier`) is never
offered again, and clearing the supplier in the Edit form sets that flag.

---

### New receipt — `/receipts/new`

- **What it is for.** Typing in one receipt by hand, with or without a photograph — for the
  paper he has lost, or a purchase with no paper at all.
- **How you get there.** **+ Add → Add a receipt by hand** from the add sheet anywhere, or
  **+ Add** on `/receipts` itself.
- **What is on it**, in screen order: a big dashed **drop zone** — *"Drop a photo here, or
  click to browse"*, which on a phone opens the camera — then **Supplier** (the type-ahead,
  *"Supplier — type a name, or tap the arrow"*, with **No supplier / general expense** as an
  option and suppliers ordered by how often he uses them), **Date** (today) and **Category**
  side by side, **Shop or supplier** (the name as printed), **Total paid (GBP, incl. VAT)**
  with a **currency** dropdown beside it, **Of which VAT (GBP, optional)**, the exchange-rate
  row when the currency is not GBP, a small live line *"→ £1,032.00 excl. VAT, recorded
  automatically"*, **+ Split into multiple items**, **Notes**, **Warranty length in months**,
  **Tags, comma separated**, then **Save receipt** and **Clear form**.
- **What it does behind the scenes.** The photograph is shrunk in the browser before it is
  stored (`src/lib/imageDownscale.ts`); a HEIC straight off an iPhone cannot be decoded and
  says so — *"Couldn't read that photo. Try a JPEG or PNG."* The **category defaults to the
  one he uses most** (`mostUsedCategory` in `src/lib/categories.ts`). Two refusals stand
  between the form and a save: *"Enter the total paid before saving."*, and the
  exchange-rate check below. Then a **duplicate warning** (`src/lib/duplicates.ts`) — *"This
  looks like it might already be saved — Screwfix, £124.70 on 2026-09-14."* with **Save it
  anyway**; changing the vendor, date or total clears the confirmation so the check runs
  again. It always saves as a **receipt**, never a bill, and `needsReview` is false because
  he was looking at it.
- **Where it takes you next.** `/receipts` on save.
- **Free, gated or not built.** Behind sign-in. Costs nothing — nothing is read by any model
  on this page and nothing is uploaded anywhere but his own database. **Splitting a receipt
  across categories only exists here and in the scan flow**, not in the inline editor on the
  list.

**Splitting one receipt across categories.** **+ Split into multiple items** adds lines of
Item / Qty / Price / category, under the note *"give each its own category to split this
receipt across categories (e.g. Groceries + Household)"*. Worth knowing for the design
conversation: the lines are stored and shown, but **the receipt's own single category is
still what every total on `/expenses` and the tax card counts by**. The per-line categories
are a record, not an allocation.

---
