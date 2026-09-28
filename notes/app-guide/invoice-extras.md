## What leaves the app once an invoice exists

An invoice is written on `/invoices/new` and issued on `/invoices/<id>` — that is somebody
else's section. This one is about everything that happens **after** it exists: the two tax
schemes that change what the customer actually pays, the seven shapes the finished document
can be saved in, the private web link a customer can be sent, the email that carries the PDF,
and the five reminders the app sends on its own while nobody is watching.

There are no new pages here. Everything below is a control on `/invoices/<id>`, a route with
no screen (`/api/...`), or a public page the customer sees and the owner never does
(`/i/<token>`). That is worth saying out loud, because it is the part of the app that runs
when he is asleep and the part a customer judges him on.

---

### CIS, in plain English

**What it is.** On building work in the UK there is a scheme called CIS — the Construction
Industry Scheme. When a builder (the **contractor**) pays a smaller builder (the
**subcontractor**) for construction work, the contractor is required by law not to hand over
the full amount. They **keep back a slice of the labour and send it to HMRC** as tax paid in
advance on the subcontractor's behalf. The subcontractor gets the rest, and at the end of the
year that slice counts as tax he has already paid.

**Who keeps back what.**

| | |
|---|---|
| **20%** | of the labour, when the subcontractor is registered with HMRC for CIS. |
| **30%** | of the labour, when he is not registered. The penalty for not registering. |
| **Nothing** | off materials, and nothing off the VAT. Only labour. |

`src/lib/cis.ts` holds this in about forty lines, and it is the whole of the rule:
`CIS_RATES = [20, 30]`, labelled on screen as *"20% (registered)"* and *"30% (not
registered)"*.

**What the customer actually pays.** This is the important bit, and it is why a CIS invoice
carries **two different numbers**:

> 3 days labour at £250 = £750
> Materials = £250
> Subtotal £1,000, VAT at 20% £200, **Total £1,200**
> CIS deduction, 20% of £750 of labour = **−£150**
> **The contractor pays you: £1,050**

The **total (£1,200)** is what the work was worth. Turnover, the VAT return and the tax card
go by that. The **£1,050** is what actually lands in the bank, and **every figure in the app
about money owed goes by that one**: the balance, the status, "owed to you" on the dashboard,
the chase emails, "Mark as paid", and the amount printed in large type at the bottom of the
invoice. The function is `invoiceCharge()`, which returns the ordinary VAT totals plus two
extra fields, `cis` and `due`.

**Three details in that file that are easy to get wrong and are already right.**

1. **A line with no label counts as labour.** `withKinds()` marks every unlabelled line
   `labour` when a CIS rate is set, so a forgotten pill deducts too much rather than too
   little. Under-deducting is the one that gets the contractor a penalty.
2. **The deduction can never be negative.** A discount or a deposit entered as a negative
   labour line can outweigh the real labour; `cisDeduction` clamps the labour at zero, so the
   app can never tell a contractor to pay the subcontractor *extra* tax.
3. **A credit note is credited before CIS, and the deduction shrinks with it.**
   `creditOffDue()` takes the credit off in the same proportion: £500 credited against
   £1,000 of labour at 20% takes **£400** off what the contractor pays, not £500. Credit the
   full total and the whole thing cancels to nil.

Everything is worked in whole pence (`pence()` = `Math.round(n * 100)`) so the screen, the
PDF, the customer's link and the reminder email can never disagree by a penny.

**What the app does *not* do with CIS.** It does not file anything, it does not produce a
monthly CIS return, and it does not produce the **payment and deduction statement** the
contractor is legally required to give the subcontractor. The deduction is printed on the
invoice and counted as tax paid on the tax card. That is all.

- **Free, gated or not built.** Free. Pure arithmetic in the browser, no model, no paid API,
  no environment switch. It is on for anybody who ticks the box.

---

### The VAT reverse charge, in plain English

**What it is.** Since 1 March 2021, on most CIS building work between two VAT-registered
businesses, the builder **does not charge VAT at all**. The customer works out the VAT
themselves and pays it straight to HMRC. It exists because of fraud: builders were charging
the 20%, being paid it, and disappearing without passing it on.

So on a reverse-charge invoice the VAT line is **£0** and the total is the net figure — but
the invoice still has to state the VAT the customer must account for.

**When it applies — four conditions, all of them.** From `src/lib/reverseCharge.ts`, read off
HMRC's own guidance on 2026-09-25 rather than from memory:

1. Both sides are UK VAT registered.
2. The payment is reported under CIS.
3. The work is standard-rated (20%) or reduced-rated (5%). Zero-rated and exempt work is
   outside it entirely.
4. The customer has **not** told the supplier in writing that they are an **end user** or an
   intermediary supplier. That written declaration turns the whole thing off — it is the
   customer's statement, not a guess, and it is stored per contact as
   `clients.reverse_charge_end_user` (migration-039, default false).

**How the app handles it: it asks, it does not decide.** `src/lib/reverseChargePrompt.ts` is
explicit about why. Two of the four conditions are things only he knows — whether the customer
really is VAT registered, and whether a declaration has arrived — and getting it wrong either
way is a tax error. So when he is VAT registered, CIS is on, and the customer is a company or
has a VAT number, an amber box appears on the invoice form:

> **Should this invoice charge VAT at all?**
> *"This is CIS work for a business. If they are VAT registered, you must not charge them the
> VAT — they pay it to HMRC themselves, and the invoice has to say so. Charge it anyway and
> they cannot reclaim it."*
> *"Unless they have told you in writing that they are an end user, which most builders are
> not — they pass the work on."*

Answering **They pay the VAT** switches every standard line to *Reverse charge (20%)* and
every reduced line to *Reverse charge (5%)*. Answering **No** leaves it alone. Either way it
is asked once per invoice.

The comment in that file says why the feature exists at all: the reverse-charge rate had been
in the rate picker for a long time and almost nobody ever picked it, **because almost nobody
knows the rule exists.** A plasterer who has ticked CIS and picked a limited company has just
described, in the app's own words, the exact situation the rule covers. The app knows enough
to ask, and asking is the whole feature.

**What prints on the invoice, and why it has to.** The VAT Regulations 1995 require the words
*"reverse charge"* to appear, and HMRC require the invoice to make clear the customer must
account for the VAT and to say how much. Two lines, in a box on the sheet:

> **Reverse charge: VAT Act 1994 Section 55A applies**
> Customer to pay the VAT to HMRC: £200.00 at 20% on £1,000.00. It is not included in the
> total above.

The first is the legal form of words — HMRC accept four, and this is the one naming the
section, because a contractor's bookkeeper recognises it. The second is the same thing in
plain English, because "Section 55A" tells the person holding the invoice nothing about what to
do. **Without those words it is not a valid reverse-charge invoice.**

**Why there are two rates and not one kind.** Because the invoice has to state the *amount*,
and a single "reverse charge" cannot say whether the customer owes 20% or 5%.
`reverseChargeBreakdown()` groups the lines by rate and gives the net and the VAT for each,
in whole pence, so the figure on the invoice is the figure the customer puts on their return.

**Credit notes.** A credit against reverse-charged work reduces what the customer owes HMRC,
so the credit note has to say by how much: `reverseChargeCreditNote()` gives HMRC's own
wording — *"Reverse charge: customer to account for the output tax adjustment of £X to
HMRC."*

- **Free, gated or not built.** Free, and fully built. No model, no API, no switch. Note that
  the **quote** side stamps `quotes.vat_registered` and the **invoice** side stamps
  `invoices.vat_registered`, so a reverse-charge invoice keeps its own wording for ever even
  if he deregisters later.

---

### Save as — the seven shapes a document leaves in

`src/components/SaveAsMenu.tsx` is one grey **Save as** button that opens a list of seven.
It is used on the issued invoice, on a quote, on a customer statement and on the free-invoice
page, so this is one control described once.

The list, in the order it appears, with the exact words on screen:

| Label | Ending | The note under it |
|---|---|---|
| **PDF** | `.pdf` | *Best for sending and printing* |
| **Picture** | `.png` | *For a message or a chat* |
| **Smaller picture** | `.jpg` | *Smaller to send* |
| **Word** | `.doc` | *To edit in Word or Pages* |
| **Web page** | `.html` | *Opens in any browser* |
| **Plain text** | `.txt` | *Plain words, no layout* |
| **Spreadsheet** | `.csv` | *The lines in Excel or Numbers* |

Plain names first, the file's ending in grey after it, so nobody has to know what a PDF is to
pick one. Atanas asked for this on 2026-09-22: *"the more options the better even in the free
version."*

**Which are drawn, and which are read off the printed sheet.** This is the distinction worth
keeping:

- **PDF, .png and .jpg are pictures of the sheet.** The PDF goes through
  `src/lib/invoicePdf.ts`; the two images through `sheetImage()` in `src/lib/saveFile.ts`,
  which uses `html-to-image` at **twice** the screen's pixel size so it stays sharp, on a
  white background. It renders the sheet **twice on purpose** — Safari leaves images (the
  signature) out of the first capture.
- **Word, web page, plain text and spreadsheet are read off the printed sheet itself.**
  `readSheet()` in `src/lib/sheetFile.ts` walks the sheet's own DOM, skips anything marked
  `print:hidden` or `sr-only`, and returns the words and the line table in printed order.
  Then `sheetHtml()` (used for both `.doc` and `.html` — Word opens HTML as an editable
  document), `sheetText()` (columns padded so they line up in any editor) and `sheetCsv()`
  build the file.

**Why that matters.** No screen keeps its own copy of the totals. The four text formats say
exactly what the printed sheet says, so a change to the invoice layout cannot leave the CSV
quoting last month's arithmetic. It is the same reason the PDF is a photograph of the sheet
rather than a redraw. The trade-off is the other way round: because the CSV is scraped from
printed text, its shape follows the layout — a text line is split at its last `": "` into two
columns, which is a guess that works on *"Amount due: £1,050.00"* and would not survive a
restyle that dropped the colon.

**One quirk of `readSheet`.** To know what lands on a line, `innerText` needs the node in the
page — so it clones each block, parks it off-screen at `left: -10000px` at the block's own
width, reads it and removes it. Harmless, but it means the formats cannot be made on a server;
they only work in the browser, with the sheet on screen. `SaveAsMenu` takes an
`onOpenChange` callback for exactly that reason, so a page that normally keeps the printed
sheet out of the way can put it up while the menu is open.

**When it fails.** One line, in red, under the button: *"That file couldn't be made. Try
another kind, or the PDF."* File names are cleaned by `tidyFileName()` — `\ / : * ? " < > |`
are not legal in a file name on Windows or a Mac — and cut to 80 characters.

- **Free, gated or not built.** Free, and free of everything. Every one of the seven is made
  **on the device**: nothing is uploaded, no route is called, no model, no paid service, no
  switch. It is behind sign-in only because the pages it sits on are.

---
