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
receipt across categories (e.g. Groceries + Household)"*. This **does** really split the
money, but only in one place: the **By category** breakdown on `/expenses`. There, a receipt
with line items is divided across each line's own category, and each share is **scaled
proportionally** so the categories always add back to exactly the receipt's own net and VAT —
even when the lines don't quite sum to the total (rounding, or the reader misreading a line).
A line with no category of its own falls back to the receipt's. If there are no line items,
or they add up to zero or less, the whole receipt sits under its single category.

Everywhere else the split is invisible, because nothing else looks at categories at all: the
three headline totals on `/expenses`, the VAT return (`src/lib/vatReturn.ts`, boxes 4 and 7)
and the tax card (`src/lib/taxEstimate.ts`) all count `amount` and `vatAmount` off the receipt
as a whole.

---

### A receipt in another currency

The by-hand form, the scan page and the inline editor on the list all take a currency
beside the total. Three figures are stored, and it is worth knowing which is which, because
only one of them is the accounting record:

- `originalCurrency` and `originalAmount` — what the paper actually says, kept as a record.
- `fxRate` — how many pounds one unit was worth, as used at the moment of saving.
- `amount` and `vatAmount` — **pounds**, always, worked out at save time and never
  recalculated afterwards. A rate that moves next week does not move a receipt already
  filed, which is right: the money left the account at one rate.

The rate is looked up automatically from **Frankfurter** (`src/lib/fx.ts`) — the European
Central Bank's own reference rates, free, no account and no key, called straight from the
browser with a **5-second** timeout. Twenty currencies are offered. If the lookup fails or
times out, the box is left for him to type the rate in, saying *"Exchange rate lookup timed
out — enter it manually."*

**What the app now refuses.** This is a real bug that was found and fixed, and it is worth
him knowing it existed, because it is exactly the kind of thing a free-tier conversation
should not casually undo. All three forms that take a hand-typed rate used to check only
that the box was **not empty**, then did `parseFloat(input) || 0`. So:

- `"0"`, `"abc"` and a box of spaces all became a rate of **zero** — which files a receipt
  worth **nothing at all** into the accounting record.
- A **negative** rate filed a receipt with **negative VAT**, which comes straight off box 4
  of a VAT return.

Three copies of one weak check, wrong in the same way. The rule now lives in one place,
`rateProblem()` in `src/lib/fx.ts`, and all three forms call it. It refuses:

| Typed | What it says |
|---|---|
| nothing | *"Enter an exchange rate before saving (or wait for it to load)."* |
| `0`, a minus number, or anything that is not a number | *"That exchange rate doesn't look right. Enter how many pounds one EUR is worth."* |
| more than **1000** | *"That exchange rate looks far too high. Enter how many pounds one EUR is worth — usually less than 2."* |

The ceiling is loose on purpose. Across every currency offered, one unit is worth between
about 0.004 (yen) and about 1.4 pounds, so a thousand is far past anything real while still
being obviously a slipped decimal point. GBP is never checked, because there is nothing to
convert.

**The one case where pounds are not stored.** A document emailed in (below) whose rate could
not be fetched is saved with the figures *still in the foreign currency* and `fxRate` null.
The review page then shows an **amber** box — *"This is a EUR document and no exchange rate
could be fetched, so the figures above are EUR, not pounds. Put the pound amounts in before
approving it."* Grey small print was judged not enough there, because approving the row books
the wrong number.

---

### Needs review — `/receipts/review`

- **What it is for.** The holding pen for documents that arrived **by email** and were read
  by the AI with **nobody watching**. Header line: *"Receipts that came in by email — check
  what was read off them before they count toward your records."*
- **How you get there.** Header → **Money out ▾ → Needs review**. Also the blue **Needs
  review** badge on any row of `/receipts`, and the amber banner on the dashboard — *"3
  emailed receipts are waiting on review before they count toward your totals."*
- **Where these rows come from.** One place only: emailing or forwarding a document to his
  private address `u-<token>@invoiceover.com`. A Cloudflare Worker parses the mail and posts
  the attachments to `/api/inbox/ingest`, which reads each one and inserts a receipt with
  `needs_review = true`. **Nothing else in the app ever sets that flag** — a scan he watched
  (`/scan`), a receipt typed by hand, a mileage trip and a recurring expense are all saved
  with it false, because he was there. The address itself lives in Settings and is covered in
  `settings.md`.
- **What is on it**, in screen order: the heading, a first-few-times tip (*"How it works:
  check what was read off each one. Once you save it, it counts towards your totals."*), then
  one white card per waiting document. Each card: the photograph (or a **PDF** tile, or **No
  attachment**), a type badge (blue **Invoice**, red **Credit note**; a plain receipt gets
  none), then **Supplier** and **Date** side by side, **Invoice number** and **Due date** for
  a bill (credit notes get the number only), **Category**, **Total (£, incl. VAT)** and **Of
  which VAT (£)**, the currency line or the amber warning, **Notes**, a **Paid** tick box for
  a bill, *"Filed under <supplier>"* if one was matched, then **Looks good** and **Discard**.
- **The doubt is carried across, and shown.** Wherever the reader was unsure of the supplier,
  the date, the total or the VAT, the same amber flag the scan page uses (`FieldFlag`) sits
  beside that one label. The reason is written into the route: nobody saw the scan screen's
  *"could also be…"* prompt for an emailed document, so the ambiguity has to travel with the
  row or a guessed total arrives looking as confident as a certain one. An ambiguous date also
  leaves a note — *"read as 03/04/26 as 2026-04-03; could be 2026-03-04 — check this one"*.
- **What it does behind the scenes.** Three reads on arrival (receipts, suppliers, the
  business profile for the category list), then it keeps only the rows with `needsReview`.
  The form holds **positive** figures even for a credit note and puts the minus sign back on
  save. **Looks good** writes the corrected figures and sets `needsReview` false — that is
  the moment the document starts counting. One refusal: **a bill that is not ticked paid must
  have a due date**, *"A bill to be paid needs a due date."* **Discard** asks first, and the
  wording is honest about what it costs: *"Discard Screwfix? It won't be saved to your
  records, and the email it came from is the only copy left."*
- **Two small things done deliberately, worth not undoing.** A refusal is kept **against the
  one row** it is about, not at the top of the page — on a phone, a message at the top says
  nothing about which of five bills is missing a due date, and the button just reads as dead.
  And because saving a card makes it vanish (clear to look at, silent to a screen reader), a
  line appears instead: *"Screwfix saved to your records. **See it**"*.
- **Where it takes you next.** `/receipts` (the **See it** link).
- **Free, gated or not built.** Behind sign-in, and **fully built and live**. The *page* costs
  nothing; what feeds it is **the most expensive thing in the app per use** — every attachment
  is a `claude-opus-5` read on his own API key. That is fenced at the door: the Worker's shared
  secret (`INBOX_WEBHOOK_SECRET`), then **60 documents an hour per mailbox and 600 an hour
  overall**, counted per mailbox rather than per request because the caller is always the same
  Worker. At most **5 attachments per email**, each under the file-size cap. Anything left out
  is **not** left out silently — a note row lands in this same queue naming each dropped file
  and why (*"not a kind that can be read"*, *"larger than 10MB"*, *"more than 5 documents in
  one email"*), tagged `via-email` and `not-imported`. **Note the asymmetry for the free-tier
  decision:** the scan limits (`SCAN_LIMITS`, on in production) govern `/scan`, not this
  route. Email import has its own, looser, per-hour limits and **no daily or monthly cap at
  all**.

---

### How "due soon" is decided, exactly

Four places in the app say a bill needs paying soon, and they all mean the same thing. Since
he is about to decide what a free account gets, it is worth having the rule in one line:

> A **bill** is `document_type = 'invoice'` **and** `paid = false` **and** `needs_review =
> false`. It is **due soon** when it has a due date and that date is **3 days away or fewer**,
> counting today as 0 — **including a date already in the past**.

- **The list of bills** (dashboard **Bills to pay**, and `youOwe` in `src/lib/moneyScreen.ts`)
  shows **every** unpaid bill however far off, soonest first, undated last. That is a list of
  what he owes, so nothing is hidden from it.
- **The amber banner, the number on the home-screen icon and the daily push** count only the
  ones due within 3 days or already late (`daysBetween(today, dueDate) <= 3` on the dashboard;
  `.lte("due_date", daysFromToday(3))` with no lower bound in `/api/notifications/check`, so
  an overdue bill keeps being mentioned). So nothing nags him about a bill due in a fortnight.
- **The badge on a row of `/receipts`** turns amber at the same 3 days, grey beyond it.
- **A bill with no due date is never "due soon"** — it shows a grey **To pay** and sits last.
- **A bill still waiting on review is in none of it.** The reason is written into both files:
  nobody should be chased for a figure a machine read and nobody has looked at, and an
  unreviewed due date is an unchecked AI reading, not a bill he knows about.
- **"Today" is London time, never UTC** (`todayISO()`, `src/lib/today.ts`). This exact window
  was found wrong once — the 3-day bill date was built off the UTC clock while `today` two
  lines above was London, so a bill due in exactly three days would not have been pushed
  about.

---

### Expenses — `/expenses`

- **What it is for.** What he spent over a stretch of time, broken down by category, with a
  chart — and optionally set against what he invoiced over the same stretch. It is a summary
  screen: nothing is added or edited here.
- **How you get there.** Header → **Money out ▾ → Expenses**. Also from the dashboard's
  spending figure, and **← Expenses** back from `/mileage`.
- **What is on it**, in screen order:
  1. **"Expenses"**, with the period underneath as the sub-line (`2026-09`, or
     `2026-09-01 to 2026-09-07`, or `2026-08-29 to 2026-09-28`), and under that two underlined
     links: **Mileage** and **VAT**.
  2. A first-few-times tip (`tip:expenses-how`): *"How it works: every receipt and bill you
     save adds itself up here, by category and by month."*
  3. **The period picker** — four buttons, **Week / Month / Year / Custom**, and beside them
     the matching box: a date for the week, a month picker, a year number, or **From** / *to* /
     **To** for Custom. Then **Print / save as PDF**.
  4. **Expenses only** / **Combined with invoices** — two buttons.
  5. **Three cards**: **Total excl. VAT**, **VAT on those costs**, **Total incl. VAT**.
  6. **Three more cards, only in Combined**: **Invoiced (income)**, **Spent** — labelled
     *"Spent (excl. reclaimable VAT)"* when he is VAT registered and *"Spent (incl. VAT)"* when
     he is not — and **Net**, which goes red when it is negative.
  7. **By category** — a bar chart, then a line per category, biggest first:
     `Materials & stock  £1,032.00 excl. VAT · £1,238.40 incl. VAT`. Empty: *"No costs
     recorded for this month."*
  8. The standing small print: *"These figures are for your own records and to help with VAT
     review — they are not a substitute for professional accounting advice."*
- **What it does behind the scenes.** Four reads on arrival (receipts, invoices, credit notes,
  the business profile); every figure is worked out in the browser, and the whole page is one
  filter over `receipts`. Four rules worth knowing:
  - **Anything still waiting on review is excluded**, so an emailed receipt nobody has checked
    cannot skew the month.
  - **Week means Monday to Sunday.** Safari has no `<input type="week">`, on the Mac or the
    iPhone, so he picks any date and the app shows the Mon–Sun week it falls in. Every step of
    that arithmetic is done in UTC on purpose — building local midnight and converting back
    shifted the answer by a day in both directions depending on the viewer's offset.
  - **Which month it is now comes off the London clock**, not UTC: at 00:30 on the 1st in
    summer, UTC still says last month.
  - **VAT is part of the cost only when he cannot reclaim it.** Not registered, the VAT on a
    purchase is money gone, so it counts; registered, it comes back on the return and does not.
    Income is already ex-VAT, so counting reclaimable VAT as a cost would put **Net** out by
    the whole VAT bill. The tax card uses the same rule.
  - **A failed load shows one red line and no figures at all** — zeros would read as *"you
    spent nothing"*, which is the opposite of *"we couldn't reach your records"*.
- **Where it takes you next.** `/mileage`, `/vat`. Nothing else — there is no link from a
  category to the receipts behind it, which is worth noting as a gap.
- **Free, gated or not built.** Behind sign-in. Costs nothing — no model, no paid API, no
  switch. The print/PDF is the browser's own print.

**Categories** (`src/lib/categories.ts`). A category is **just a word stored on the receipt**,
not one of a fixed set, which is what lets him rename and add his own in Settings. The
starting list depends on the **kind of account** he picked:

- **Sole trader** — a 20-line list that deliberately follows the expense boxes on the
  self-assessment form, so the year's figures fall where the form wants them: Materials &
  stock, Subcontractors, Staff wages, Fuel, Mileage, Travel & hotels, Meals when away, Rent &
  rates, Gas & Electric, Repairs, Phone & internet, Office & stationery, Software &
  subscriptions, Advertising, Bank charges & interest, Accountant & legal, Insurance, Tools &
  equipment, Training, Other.
- **Limited company** — the same list with **Salaries & PAYE**, **Pension contributions**,
  **Director's expenses** and **Client entertaining** added.
- **Personal** — a household list: Groceries, Household, Rent or mortgage, Bills, Gas &
  Electric, Transport & Taxis, Fuel, Travel, Meals & eating out, Clothes, Health, Childcare,
  Subscriptions, Gifts, Other.
- **Not said yet** — the old generic twelve (Fuel, Transport & Taxis, Travel, Groceries,
  Household, Bills, Gas & Electric, Meals, Mileage, Supplies, Equipment, Other).

Three rules that protect saved data, and are the reason this cannot be tidied up freely:
**a category is never removed or renamed in the code**, only appended or reworded in place,
because existing receipts hold the exact string. Changing the account kind **adds** the new
kind's missing categories and removes nothing, keeping his own spelling of "Other" last — and
only if his list is still one of the untouched starting lists; a list he has edited is his.
And any dropdown always includes **the category the record already has** even if it has since
left the list (`withCurrent`), so a receipt filed under a category he deleted never quietly
shows as a different one. The word **Mileage** is deliberately identical to what the mileage
page files under. New receipts default to **the category he uses most** (`mostUsedCategory`).

---

### Mileage — `/mileage`

- **What it is for.** Claiming business miles instead of fuel receipts. Header line: *"Business
  miles at HMRC's rates: 45p a mile for the first 10,000 in the tax year, then 25p. Each trip
  is saved as an expense."*
- **How you get there.** Header → **Money out ▾ → Mileage**, or the **Mileage** link on
  `/expenses`. **← Expenses** goes back.
- **It is not a table of its own.** A trip is saved as **an ordinary receipt row**: vendor
  *Mileage*, category *Mileage*, VAT **0**, `paid` true, `documentType` `other`, the amount
  being what the claim is worth, and the trip itself in `receipts.details.mileage` (miles,
  from, to, vehicle, rate, purpose). So it lands in the expense totals and the tax estimate
  with everything else and needs no new table. It carries no photograph — there is nothing to
  photograph.
- **What is on it**, in screen order: the heading and the rates line, a first-few-times tip
  (*"How it works: add a trip and it is saved as an expense at HMRC's rate. No receipt
  needed."*), then the form — **Date** and **Vehicle** side by side, **From** and **To**
  (*"Postcode or place"*), then **Miles** with **Work it out** and **There and back** beside
  it, **What for (optional)** (*"e.g. Site visit, collecting materials"*), the live claim line,
  and **Save the trip**. Below the form, a card: **This tax year (2026/27)** with the total
  miles and total claimed, then the last **20** trips (`Site → Yard`, date · miles · purpose,
  amount on the right) and, beyond that, *"Showing the last 20. All of them are in Expenses."*
- **HMRC's rates and the 10,000-mile split** (`src/lib/mileage.ts`, the rates from 2011-12
  onwards):

  | Vehicle | First 10,000 miles | After that |
  |---|---|---|
  | Car or van | **45p** | **25p** |
  | Motorcycle | 24p | 24p (no threshold) |
  | Bicycle | 20p | 20p (no threshold) |

  The threshold is **per tax year and per vehicle**, and the tax year is HMRC's — it starts
  **6 April** (`taxYearStart`), not 1 January and not the calendar year. Before working out a
  claim the app adds up the miles **already claimed in the same tax year on the same vehicle**
  (`milesSoFar`), so a single trip that straddles 10,000 is **split across both rates**:
  `120 miles × 40 at 45p and 80 at 25p = £38.00`. Under the box it says how the year stands —
  *"9,960 miles claimed this tax year (2026/27); 40 left at the higher rate."* — and that line
  is hidden for a motorcycle or bicycle, which have no threshold. Motorcycle and bicycle rates
  do not change with distance at all.
- **"Work it out"** turns two postcodes into a distance without any mapping service or paid
  API: each postcode is turned into a point through the app's own `/api/address-search` (the
  free postcodes.io lookup), the great-circle distance is worked out in the browser, and it is
  multiplied by **1.25** — `ROAD_FACTOR` — because roads wander and a straight line would
  under-claim. It says so: *"About 14.3 miles each way by road. Change it if you went another
  way."* It only ever **suggests**; the miles stay his to type. No postcodes and it says *"Put
  a postcode at each end and I'll work out roughly how far it is."*; a failure says *"Couldn't
  work that out. Type the miles in."* **There and back** simply doubles the box.
- **Two small things done on purpose.** The refusal for an empty box, *"How many miles was
  it?"*, is attached **to the miles box itself** (`aria-invalid`, `aria-describedby`), not
  dropped at the bottom of the form. And **Save the trip** is guarded by a ref rather than the
  `disabled` attribute, because React applies `disabled` only on the render *after* the first
  press — two taps in one tick would otherwise both go through and claim the same trip twice.
- **Where it takes you next.** `/expenses` (the back link, and *"See your expenses"* after a
  save).
- **Free, gated or not built.** Behind sign-in, **fully built**, and **free to run** — the
  rates are in the code, the distance is worked out in the browser, and the postcode lookup is
  the free service. Nothing here calls a model or a paid API. Worth knowing for a paid tier:
  this is one of the few screens with a genuine per-use external call (two postcode lookups
  per **Work it out**), and it is free and uncapped today.
