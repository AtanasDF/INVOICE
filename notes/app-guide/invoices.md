## Sales invoices — the list, and writing one

Three routes, four screens: `/invoices` (the list), `/invoices/new` (the form), and
`/invoices/<id>`, which is **two completely different pages** depending on whether the
invoice is still a draft or has been issued. Everything here is the money **coming in** —
his own invoices to his customers. Supplier paperwork he has scanned lives in `receipts`
and is somebody else's section.

---

### Invoices — `/invoices`

- **What it is for.** The record of every invoice he has written: what is owed, what is
  late, what is still a draft. Header line: *"Make invoices, and look back at the ones you
  have sent."*
- **How you get there.** Header → **Money in ▾ → Invoices**. Also from the dashboard:
  **Owed to you** and **View all N outstanding** land here, **Overdue** and the amber
  overdue banner land on `/invoices?status=overdue` with the filter already set, and a
  customer's history opens `/invoices?client=<id>`.
- **What is on it**, in screen order:
  1. **"Invoices"** with the sub-line, and top-right two things: **Download for a
     spreadsheet** (only once there is at least one invoice) and **+ Add**, the standard
     add sheet (`ScanOrAdd` → `AddAnything`), which for this page also holds **Scan an
     invoice** — *"Photograph one and fill this page's form from it"* — and **Fill it in by
     hand**. Beside the sheet, out in the open, **Upload a file**.
  2. **A tip** the first few times (`tip:invoices-scan`): *"Tip: **Scan an invoice** you've
     sent before and it's copied as a new one — customer, lines and terms — dated today."*
  3. **"Same again"** — a white card of up to **three** buttons, one per customer, each
     showing the name and under it `#INV-0341 · £1,250.00`. *"Last month's invoice to them,
     dated today. Check it before you send it."* A customer appears only with **two or more
     issued invoices** — a one-off is not a habit (`src/lib/sameAgain.ts`, `A_HABIT = 2`).
     Tapping one writes a new draft copying the lines, CIS rate, notes and terms, dated
     today, due in 30 days, and opens it.
  4. **Filter** (a fold-out, already open if a filter is on): **Search invoice #**, **From**,
     **To**, a **Customer** dropdown (*All customers*), a **Status** dropdown (*All statuses*,
     *To receive (owed to me)*, *Draft*, *Sent*, *Partially paid*, *Paid*, *Overdue*),
     **Min total (£)**, and a **Tag** dropdown only if any invoice has a tag. Then **Clear
     filters**. The search box searches **the invoice number only** — not the customer name,
     not the description.
  5. **The rows.** Each: `#INV-0341 · Smith Ltd`, a coloured status badge, a grey **Credit
     note** badge if there is one, and for a sent or part-paid invoice an inline **Mark as
     paid** link. Second line: date · amount, and where there is a credit note the old total
     struck through — *"£1,500.00 after £250.00 credited"* — plus *"£500.00 paid, £750.00
     still owed"* and *"due 14 Oct"*. Credit notes are listed underneath, indented. Tags as
     grey pills. On the right, **Continue draft** (a draft) or **View / print**, and
     **Remove**.
  6. **Empty state:** *"No invoices yet. Scan one you've sent before to copy it, or add one
     by hand."* — or *"No invoices match these filters."* Neither ever shows when the load
     failed; a failure shows one red line instead.
- **What it does behind the scenes.** Five parallel reads on arrival (invoices, customers,
  credit notes, payments, business profile) straight from Supabase under row-level security;
  every figure is worked out in the browser. **Five statuses, four stored.** Draft, Sent,
  Partially paid and Paid are columns; **Overdue is never stored** — it is derived every time
  from status + due date (`src/lib/invoiceStatus.ts`), so it cannot go stale. *To receive*
  is not a status at all, it is the filter for sent-or-part-paid. The amount on a row is
  **what the customer actually pays**: total, less any CIS the contractor keeps back, less
  credit notes (`src/lib/cis.ts` `invoiceCharge` and `creditOffDue`,
  `src/lib/invoiceBalance.ts`). **Mark as paid** here re-reads the payments and credit notes
  from the database first (so another tab's payment counts), records exactly what is still
  owed as a payment noted *"Marked as paid"*, sets the status to paid and fires the confetti.
  **Download for a spreadsheet** writes `invoices-<date>.csv` of **the filtered rows only**,
  columns: number, date, due_date, client, total, cis_deducted, credited, paid, balance,
  status, notes.
- **Where it takes you next.** `/invoices/<id>`, `/invoices/new`, `/invoices/new?scan=1`,
  `/scan`, `/receipts/new`, `/quotes/new`, `/clients/new`, `/copy`.
- **Free, gated or not built.** Behind sign-in. Costs nothing to run — no model call, no paid
  API, no environment switch. Only **Scan an invoice** (below) costs anything.

---

### New invoice — `/invoices/new`

- **What it is for.** Writing an invoice. It always saves as a **draft** — nothing is issued
  and no number is used up until he says so on the next screen.
- **How you get there.** **+ Add → Fill it in by hand** on the invoices list or anywhere else
  the add sheet appears (there it is called **Make an invoice**); the dashboard's small line
  *"or write one by hand"*; tapping a customer's name on the dashboard, which arrives as
  `/invoices/new?client=<id>` with them already chosen. `?scan=1` opens the camera on arrival
  to copy an invoice he has sent before.
- **What is on it**, in screen order:
  1. **"New invoice"**, and under it *"Will be **INV-357358** when you send it"* — a preview
     of the next number from Settings, not a reservation.
  2. Top right, **Scan or attach a document** (camera). This reads a **source** document — a
     timesheet, a delivery note — and fills in **only the date, the line items and the
     notes**. The line under it says so, and says the customer *"is always your own choice
     below, never guessed."*
  3. **"Or describe it and it's filled in for you"** — a two-line box, placeholder *"e.g.
     Smith Ltd, 3 days plastering at £250 a day plus VAT, 14 days"*, button **Fill in the
     invoice**, and *"On a phone you can tap the microphone on the keyboard and say it."*
     Hidden in copy mode.
  4. In copy mode instead: *"Scan an invoice you've sent before to copy it."* with **Scan an
     invoice** and **Upload a file**; afterwards *"Copied from your scan: customer, lines and
     terms. Dated today — check everything before saving."* and **Scan again**.
  5. If a Free-page draft was left behind: *"Imported from your free invoice."* plus warnings
     about a different currency, a different VAT setting, and the number it carried there —
     with **Discard import**, which asks first and names what goes.
  6. **Customer** — type-ahead with an arrow (`ContactField`), placeholder *"Customer — type a
     name, or tap the arrow"*, ordered by who he invoices most. A scanned name that is not a
     customer shows *"Smith Ltd isn't one of your customers yet"* + **Add as new customer**,
     or *"…is an archived customer"* + **Unarchive and use**.
  7. **What you charge for** — up to eight chips, `+ Labour, day rate (£250.00)`, this
     customer's own past lines first, then everything he has ever charged for
     (`src/lib/savedPrices.ts`).
  8. **Invoice date** and **Due date** side by side, then **Payment terms** (*"e.g. 30
     days"*). Terms naming a number of days move the due date; typing the due date by hand
     stops that. Default is 30 days.
  9. **CIS subcontractor** — a tick box, *"The contractor keeps back CIS from the labour and
     pays it to HMRC for you. Mark each line as labour or materials."* Ticking it reveals
     **CIS rate**: *20% (registered)* or *30% (not registered)*, and a **Labour / Materials**
     pair of pills under every line.
  10. **The reverse-charge question**, an amber box that appears only when he is VAT
      registered, CIS is on, and the customer is a company or has a VAT number: **"Should
      this invoice charge VAT at all?"** with **They pay the VAT** (switches every standard
      line to *Reverse charge (20%)*, reduced to 5%) or **No, charge VAT as usual**. Asked
      once per invoice either way. `src/lib/reverseChargePrompt.ts`.
  11. **The lines** — Description / Qty / Unit price / **VAT** (the VAT column only exists if
      the account is VAT registered) / ✕, and **+ Add line**. Leaving a description fills in
      the VAT rate this customer was last charged for that exact wording, but only if the
      line is still on the default.
  12. **Notes**, **Tags** (comma separated).
  13. **Totals** — Subtotal, a line per VAT rate, **Total**, the **Save draft** button, the
      CIS summary (*"CIS deduction (20% of £1,000.00 labour): −£200.00"* / *"The contractor
      pays you: £1,000.00"*), **Clear form** (asks first), and the footnote: *"Saves as a
      draft — fully editable until you mark it sent, which is what assigns its invoice
      number, locks the rest in, and starts the due-date clock."*
- **What it does behind the scenes.** Saving inserts an `invoices` row with status `draft`
  and a **placeholder number** `DRAFT-<uuid>` (`src/lib/invoiceNumber.ts`) — the column is
  required and unique per account, so a draft needs *some* value, and a placeholder takes
  nothing out of the real sequence. Then it opens `/invoices/<id>`. A copy never guesses the
  customer on a near name: only an **exactly** matching name is picked, because
  "Riverside Building Services" once matched "Hillside Building Services" and the invoice
  went to the wrong company.
- **Where it takes you next.** `/invoices/<id>` (the draft it just saved), the camera, or
  `/clients/new` through the contact field.
- **Free, gated or not built.** Behind sign-in, and **this is the one screen in the section
  that costs money per use**:
  - **Scan or attach a document** and **Scan an invoice** both call the reader and both
    **spend one of the account's documents** (`POST /api/scan` and
    `POST /api/invoice-template`, counted in `src/lib/scanLimit.ts`). **`SCAN_LIMITS` is
    `on` in production**, so every account is limited today: **300 documents a day for the
    first seven days, then 50 a day and 600 a month.** Nobody is on a paid plan; there is no
    paid plan. Both of these paths ask for **Claude (Opus 5)** explicitly rather than the
    cheap reader — the copy path hard-codes `engine: "claude"`, and `/api/scan` defaults to
    Claude when no engine is named — so they are the slow, expensive reads.
  - **Fill in the invoice** (describe it in words) calls **Claude** too but is **not** counted
    against the document allowance at all: `POST /api/invoice-from-text` has only its own cap
    of 60 an hour per account and 2,000 characters. That is an inconsistency, not a decision.
  - Everything else on the page — typing, the chips, the CIS maths, saving — is free.

---

### Draft invoice — `/invoices/<id>` while it is a draft

- **What it is for.** The same form again, now saved, with the one button that turns it into
  a real invoice. Header: *"Nothing's been sent yet — everything here, including the client
  and line items, is still editable. Marking it sent locks the financial content and starts
  the due-date clock."*
- **How you get there.** **Continue draft** on the list, or straight off **Save draft** on
  the form.
- **What is on it.** A **Draft** badge; a plain **Customer** dropdown (not the type-ahead);
  Invoice date / Due date; Payment terms; the CIS tick box and rate; the lines with the VAT
  column; Notes; Tags; Subtotal / VAT / **Total**; then **Save draft** and **Mark as sent**.
  **Mark as sent** opens a panel rather than acting: *"This assigns invoice number
  **INV-357358**, locks the invoice in, and starts the due-date clock. There's no way to type
  a different number here — it's assigned automatically to keep the sequence gap-free."* with
  **Confirm & mark as sent** and **Cancel**. There is **no Remove button here** — deleting is
  only offered on the list.
- **What it does behind the scenes.** Editing a draft goes through
  `invoicesStore.updateDraft`, which may touch the customer, date, lines, CIS rate, due date,
  terms, notes and tags. **Confirm & mark as sent** saves the pending edits and then calls
  the Postgres function `assign_invoice_number` (migration-012, extended by 024), which in
  **one transaction** takes the next number, advances the account's counter, sets the status
  to `sent`, and **stamps the account's VAT registration onto the invoice**. One transaction
  because a dropped connection halfway must never burn a number without issuing the invoice,
  or issue one without burning it. The number shown in the panel is a preview only; the real
  one comes back from the database. Two known repairs are built into that call: a brand-new
  account with no business profile gets the defaults saved rather than failing on the first
  invoice it ever issues, and a prefix cleared to run a bare numeric series is put back to an
  empty string without touching anything else.
- **Where it takes you next.** Itself, as the issued invoice.
- **Free, gated or not built.** Behind sign-in, free, no model call, no switch.

---

### The invoice — `/invoices/<id>` once it is sent, part-paid or paid

- **What it is for.** The finished invoice: the sheet the customer sees, and everything
  around it — getting it to them, recording the money, correcting it.
- **How you get there.** **View / print** on the list, the dashboard's *Awaiting payment*
  rows, or **Confirm & mark as sent** on the draft.
- **What is on it**, in screen order:
  1. A tip (`tip:invoice-how`): *"How it works: record money as it comes in and the invoice
     keeps its own score — part paid, then paid, without you setting it."*
  2. **The status badge** (Paid green, Overdue red, Partially paid amber, Sent blue), then
     **Mark as paid** unless it is already paid, and **Mark as unpaid** — which only appears
     when the status is not *sent* **and there are no payments recorded**. On the right:
     **Edit details**, **Duplicate**, **Send or share** (jumps to the panel below), **Print /
     save as PDF**.
  3. **Edit details**, when opened: *"Only administrative details here — the invoice number,
     date, client, and line items are locked now that it's been sent, since they're what was
     actually issued. Use a credit note below for anything that needs a financial
     correction."* Four fields only: **Due date**, **Payment terms**, **Notes**, **Tags**.
  4. **The invoice sheet itself** (`src/components/invoice/IssuedInvoice.tsx`) — the same
     component drawn on screen, in print, in the PDF and on the customer's `/i/` link, so
     they can never disagree. Logo, business name and address, VAT number; `Invoice
     INV-0341`, date, terms; **Billed to**; the line table; Subtotal / each VAT rate / Total;
     the CIS deduction; a line per credit note and per payment; the reverse-charge wording in
     a box when it applies; **Amount due** in large type with the due date or **Paid**; the
     notes; **How to pay** with the bank details from Settings; the late-payment-interest
     line for business customers if that switch is on; and for a limited company the
     registered name and company number in the footer (Companies Act 2006 s.82).
  5. **Payment reminders** — the five-step schedule (3 days before, on the day, +7, +14
     'late', +30 'final') with *Sent 14 Sep* / *Goes out today* / *Goes out 21 Oct* / *Not
     sent* against each, or one plain sentence saying why there are none: no due date, no
     email on the customer, reminders switched off for them, or *"marked part-paid but no
     payments are recorded, so the balance isn't known."*
  6. **View online** — the private `/i/<token>` link. Either **Make and copy the link**, or
     the link in a box with **Copy link**, **Open**, *"Opened 3 times: first 14 Sep 09:12,
     last …"* and **Stop this link and make a new one** (asks first; the old one dies
     immediately).
  7. **Send it** — *"£1,500.00 · INV-0341 goes as a PDF, with your payment details in the
     email."* Then **Send to**, an optional **Message**, **Send me a copy (…)**, *"Replies go
     to …"*, the send button; and under a rule, *"Or share it yourself"* with **Share
     (WhatsApp, Messages…)**, **Download PDF** and the **Save as** menu (PDF, .png, .jpg,
     .doc, .html, .txt, .csv).
  8. **Text <customer>** — ready-made WhatsApp/SMS messages. A paid invoice offers *Thanks
     for paying* and *Job done*; anything else *Job done*, *On my way*, *Running late*,
     *I've arrived*.
  9. **Payments** — **+ Record a payment**, which opens **Date received**, **Amount received
     (£)** pre-filled with the balance, and **How it was paid** (Bank transfer, Card, Cash,
     Cheque, Other, *Not saying*), then **Save payment**. Each payment lists with **Remove**
     and the card ends *"Still owed: £750.00"* or *"Paid in full."* With none:
     *"Nothing received yet. Record part-payments here and the balance and reminders
     follow."* — or, where credit notes closed it, *"Settled in full by credit note. No money
     was received, and none is owed."*
  10. **Credit notes** — **+ New credit note**: date, **Amount to credit (£)**, **Reason
      (optional)**, **Save credit note**. On a CIS invoice a note first explains to credit
      the value of the work *before* CIS and names the total to cancel the lot. Each note
      lists with **Remove**.
- **What it does behind the scenes.**
  - **What locks, and why.** `invoicesStore.update` can only touch status, due date, terms,
    tags and notes. The **number, date, customer and lines are not patchable at all** once
    the status is not draft — not hidden in the UI, unavailable in the store. The reason is
    written in the code: an issued invoice is *what was actually issued*, a document the
    customer holds and HMRC may ask about, so changing it quietly is the exact problem credit
    notes exist to prevent.
  - **How a mistake is corrected.** A **credit note** — a dated row with an amount and a
    reason, which prints on the invoice as a minus line and comes off what is owed. To cancel
    an invoice completely, credit its full total. Credit notes have no number and no document
    of their own; they are lines on the invoice they belong to. On a CIS invoice the credit is
    the value of the work **before** the deduction, and the deduction shrinks by the same
    share: £500 credited on £1,000 of labour at 20% takes £400 off what the contractor pays
    (`creditOffDue` in `src/lib/cis.ts`).
  - **How the status follows the money** (`src/lib/invoiceBalance.ts`). Owed = total (less
    CIS) − credit notes − payments, each figure rounded to the penny **before** subtracting,
    so a half-penny from 5% VAT cannot leave a phantom 1p. `statusFromPayments` then says:
    **paid** once nothing is left (credited in full counts), **partly paid** while some money
    is in, **sent** otherwise. It runs after every payment and every credit-note change on
    this page — **never** just from opening it, so looking at an invoice cannot alter it. Two
    deliberate exceptions: an invoice **he** marked paid or part-paid by hand before payments
    existed keeps that status (its balance is genuinely unknown, so the reminders say so
    rather than guess), and a **£0 balance does not make it paid** — after a deposit, only him
    saying so does.
  - **Mark as paid** re-reads from the database, records whatever is still owed as a payment
    today noted *"Marked as paid"*, and celebrates. **Every one of the three money-writing
    actions on this page — record a payment, mark paid, add a credit note — is guarded by a
    `useRef` and not by `disabled`**, because React applies `disabled` on the render *after*
    the first press: two taps in one tick both got through and invoices were paid twice and
    credited twice before this was fixed. Worth knowing before any of these buttons are
    restyled.
  - **Removing a payment or a credit note** asks first, names the amount, and says the
    balance goes back up. A credit-note removal that fails **puts the note back on screen**
    and says so, because the same array feeds the printed sheet and the chase email: showing
    it gone would mean asking for money that was credited.
  - **Duplicate** makes a fresh draft dated today, due in 30 days, and strips any
    `from <quote number>` / `deposit for <quote number>` tag — a copy is not the invoice a
    quote became.
- **Where it takes you next.** `/i/<token>` (the customer's view), `/invoices/<id>` for a
  duplicate, `/clients` to fix a missing email, `/settings` for the reminder wording.
- **Free, gated or not built.** Behind sign-in. Nothing here calls a model. Two things cost
  real money: **sending the email** (Resend, capped at 30 an hour / 100 a day per account and
  60 an hour across the whole app) and the reminder emails the cron sends. The PDF is made in
  the browser, so it costs nothing. No environment switch gates this page.

---

### Deleting an invoice, and when it is refused

**Remove** exists only on the list, never on the invoice itself. It asks first — *"Remove
invoice INV-0341? It won't be in your records any more, and this can't be undone."* — and it
is offered on **issued** invoices as well as drafts, which is the one place the app is more
permissive than the project's own rules. Three things stop it:

- **An invoice with a payment recorded cannot go** (the foreign key is `ON DELETE RESTRICT`,
  migration-023): *"This invoice has payments recorded against it, so it can't be removed."*
  Removing the payments first removes the block.
- **A deposit invoice being deducted by its balance invoice cannot go** (a database trigger,
  migrations 034 and 035): *"The balance invoice for this quote takes this deposit off… Remove
  the balance invoice first if you meant to start again."*
- Nothing stops removing an invoice that has **credit notes** — they are `ON DELETE CASCADE`
  and go with it silently.

A removed invoice **does not give its number back**. The counter only ever goes forward, so
the sequence gets a hole, and a hole in an invoice sequence is the sort of thing an inspector
asks about.

---

### VAT, in plain English

**The switch.** One tick box in Settings, *VAT registered*, decides whether VAT exists at all
for this account. Turned off, the VAT column is not even drawn on the form, every line is
treated as VAT-free, and the total is just the sum of the lines — an unregistered business
cannot charge VAT.

**The six rates** (`src/lib/vat.ts`), which is what the dropdown on each line offers:

| What it says | What it adds | What it means |
|---|---|---|
| Standard (20%) | 20% | Most work. |
| Reduced (5%) | 5% | Certain work — some renovations, energy-saving materials. |
| Zero-rated (0%) | nothing | Still VAT work, taxed at nothing (new-build housing, most food). |
| Exempt | nothing | Outside VAT altogether. |
| Reverse charge (20%) | nothing | CIS work for a VAT-registered business: **they** pay the 20% to HMRC, not him. |
| Reverse charge (5%) | nothing | The same, where the work is reduced-rate. |

Four of the six add nothing, and they are deliberately **not** collapsed into one "0%" —
zero-rated counts as taxable turnover on a VAT return and exempt does not, and reverse charge
moves the liability to the customer. They are legally different things that happen to total
the same. An invoice carrying a reverse-charge line prints the wording the VAT Regulations
require — *"Reverse charge: VAT Act 1994 Section 55A applies"* — and under it, in plain words,
*"Customer to pay the VAT to HMRC: £200.00 at 20% on £1,000.00. It is not included in the
total above."* Without those words it is not a valid reverse-charge invoice.

**The arithmetic.** Everything is worked in whole pence: each rate's net is rounded, its VAT
rounded once from that, and the total is the sum — so the screen, the PDF, the email, the
`/i/` link and the balance all agree to the penny.

**Why an issued invoice keeps its own setting.** When the invoice is marked sent,
`assign_invoice_number` stamps the account's current VAT registration onto the invoice row
(`invoices.vat_registered`, migration-024). A draft carries `null` and follows whatever the
account says today. So if he registers for VAT — or deregisters — in March, **every invoice
issued before then keeps being totalled exactly as it was sent**. Without that stamp,
registering for VAT would silently add 20% to last year's invoices on screen, in the PDF and
in the customer's link, and the app would be showing a different document from the one the
customer holds. `invoiceVat()` in `src/lib/invoiceBalance.ts` is the whole rule: draft or
unstamped → the account's setting; otherwise the invoice's own. Invoices issued before the
column existed are unstamped and still follow the account, which is how they have always
behaved.

**CIS, in one paragraph** (`src/lib/cis.ts`). On construction work the contractor keeps back
**20%** of the **labour** (30% if the subcontractor is not registered with HMRC) and pays it
to HMRC as tax on his behalf. Materials and VAT are untouched. So the invoice has two
different numbers on it: the **total**, which is what the work was worth and what turnover and
VAT go by, and **what the contractor pays**, which is the total less the deduction and what
every balance, reminder, status and "owed to you" figure goes by. The tax card treats this
year's CIS as tax already paid.

---

### Worth deciding

1. **Reading a document is the only thing in this section that costs money — should the free
   tier give 50 a day, and should writing an invoice by hand ever be limited?** Today the
   limits bite on the two scan buttons and nothing else. Typing an invoice, printing it,
   emailing it and recording payments are all unlimited and nearly free. Is that the shape of
   the free tier — **unlimited invoicing, limited reading** — or should sending emails be
   capped too?
2. **"Describe it and it's filled in for you" calls Claude and is not counted at all.** It is
   a model call on every press, capped only at 60 an hour. Should it spend a document like a
   scan does, get its own smaller allowance, or move to the cheap reader?
3. **The two scan paths on the invoice form use Claude Opus, the expensive and slow reader,
   while `/scan` uses Gemini.** On an iPhone that is the difference between a few seconds and a
   long wait. Was that deliberate for copying an invoice's layout, or is it left over from
   testing?
4. **An issued invoice can be deleted, and its number is never reused.** Should removing an
   issued invoice be refused outright (credit it to nil instead), or kept with the warning it
   has now?
5. **A credit note has no number and no document of its own.** HMRC expect a credit note to be
   a document with its own reference. Should it become a printable, sendable document, or stay
   a line on the invoice?
6. **"Search invoice #" only searches the number.** Nobody remembers invoice numbers; they
   remember the customer and what the job was. Should it search names and line descriptions?
7. **"Same again" appears on the list but nowhere on the dashboard**, which is where most
   people start. Should it be on the dashboard, where the strongest friction-saver in the
   whole competitor review would actually be seen?
8. **Tags exist, are typed free-hand, and are filtered on — but nothing else uses them.** Keep
   them, promote them into something like jobs or sites, or drop them from the form?
