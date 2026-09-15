# Invoicer — UX review and competitive analysis

Reviewed 15 September 2026 against the live app at invoice-omega-rust.vercel.app, signed in as the owner account. Every page walked: dashboard, scan, receipts, invoices (list, new, detail/print), clients, suppliers, expenses, settings.

Comparison tools examined: FreshBooks, Wave, Zoho Invoice, QuickBooks, Invoice Ninja, plus HMRC's own VAT invoice rules.

Nothing was changed. Findings are ordered by how much difference fixing them makes.

---

## First, what's genuinely good

Worth stating before the criticism, because these should not be "fixed":

- **The receipt gross/net fix landed well.** "Total paid (GBP, incl. VAT)" and "Of which VAT (GBP, optional)" is clearer than what most competitors do. Wave and Zoho both make you work out net yourself.
- **Warranty tracking with computed expiry** ("24 months (until 2028-09-14)") is genuinely novel. No competitor reviewed does this. Keep it.
- **Payment terms auto-fill from the client record** onto a new invoice. FreshBooks charges for that tier of automation.
- **Custom expense categories with reorder/rename** is better than Wave's fixed list.
- **"Download all my data" as a single JSON including attachments.** Most competitors make export deliberately painful. This is a real differentiator; say so out loud somewhere.
- **The three-figure expense summary** (excl. VAT / VAT / incl. VAT) is exactly right for UK VAT review.

---

# PART 1 — Priority fixes

## 1. Invoice numbers are random, not sequential — this is a legal problem

**What I saw:** two invoices generated `INV-357357` and `INV-840642`. Random six digits each time.

**Why it matters:** HMRC requires a *unique, sequential* invoice number. The rule is explicit — numbers must follow a pattern, and you cannot skip or repeat. Random numbers fail this. In an inspection, a non-sequential series is one of the first things queried, because it makes it impossible to prove no invoice is missing.

**Fix:** store a counter per user. Next number = highest existing + 1. Offer a configurable prefix and starting number in Settings (`INV-`, start at `1001`), which is what every competitor does. Keep the field editable but warn on a gap or duplicate.

**Effort:** small. **Impact:** removes a compliance failure.

## 2. No VAT anywhere on invoices

**What I saw:** the invoice form has description, qty, unit price, and a single `Total: £4320.00`. No VAT rate, no VAT line, no net subtotal. Meanwhile you store *your* VAT number and the client's, and print both on the invoice — which makes the missing VAT more conspicuous, not less.

**Why it matters:** a VAT-registered business legally cannot invoice with this. HMRC's required fields include unit price excluding VAT, total net amount, VAT rate applied to each item, and total VAT payable — with rates shown separately where more than one applies. Printing a VAT number on an invoice that shows no VAT is arguably worse than showing neither.

**Fix:** VAT rate per line (20% / 5% / 0% / Exempt / Reverse charge), defaulting from a business-level setting. Totals block becomes:

```
Subtotal (excl. VAT)    £4,320.00
VAT at 20%                £864.00
─────────────────────────────────
Total                   £5,184.00
Amount due              £5,184.00
```

Where multiple rates appear, show one line per rate. Add a "Not VAT registered" switch in Settings that hides the whole block and suppresses your VAT number.

**Effort:** medium. **Impact:** the single biggest gap between this and a usable product.

## 3. Nothing can be edited — only deleted

**What I saw:** receipts offer Remove. Clients offer Payment history and Remove. Invoices offer View/print and Remove. There is no Edit action anywhere in the app.

**Why it matters:** this is the finding most likely to make you abandon your own app. Mistype a client's postcode and the only remedy is to delete the client — which, given `on delete set null`, orphans every receipt attached to them — and retype everything. FreshBooks puts edit and duplicate as quick-action icons on every list row.

**Fix:** an Edit route for each entity reusing the create form pre-filled. Invoices need care: once an invoice is *sent*, editing should either be blocked or create a revision, which is why status (below) matters.

**Effort:** medium. **Impact:** turns a demo into something usable daily.

## 4. The dashboard doesn't show money owed to you

**What I saw:** three counters (1 client, 1 receipt, 1 invoice) and "This month so far" showing three expense figures. An outstanding invoice for £4,320 exists and appears nowhere. The dashboard of an invoicing app shows only expenses.

**Why it matters:** the freelancer's actual daily question is "who owes me money and is anyone late". Every competitor leads with this:

- **Zoho Invoice** opens with *Total Receivables*, split *Current* vs *Overdue*, each clicking through to an ageing report.
- **FreshBooks** leads with *Outstanding Invoices*, split into Overdue and Outstanding, plus ageing totals by interval.

Counting your own records ("1 client") is a vanity metric — you know how many clients you have.

**Fix:** replace the three counters with three money figures:

```
£4,320.00        £0.00           £549.99
Owed to you      Overdue         Spent this month
2 invoices       —               excl. VAT
```

Below that, a short list: *Awaiting payment* — invoice number, client, amount, due date, days remaining or overdue. Keep the scan CTA, drop the counters.

**Effort:** small–medium. **Impact:** makes the home screen answer the question people open the app to ask.

## 5. Invoice status is binary; it needs a lifecycle

**What I saw:** invoices are Unpaid or Paid, toggled by clicking a grey pill reading "Unpaid — click to mark paid".

**Why it matters:** "unpaid" conflates four different situations — not finished yet, finished but not sent, sent and waiting, and late. You can't chase what you can't distinguish. Invoice Ninja uses eight statuses: Draft, Sent, Partial, Paid, Cancelled, Deleted, Reversed, Archived.

**Fix:** a realistic subset — **Draft → Sent → Partial → Paid**, with **Overdue** derived automatically from due date rather than stored. Colour it: Draft grey, Sent blue, Overdue red, Paid green. The current grey pill gives an overdue invoice the same visual weight as a draft.

Add **Mark as sent** as an explicit action; that's what starts the clock.

**Effort:** medium. **Impact:** prerequisite for reminders, ageing, and edit-safety.

## 6. No "Amount due", and no way to pay

**What I saw:** the printed invoice ends with `Total: £4320.00`. Bank details sit in small grey text at the very bottom, in a free-text Notes box I had to type by hand.

**Why it matters:** on an unpaid invoice the client needs two things immediately — how much, and by when. "Total" is a statement of fact; "Amount due £5,184.00 by 14 October 2026" is an instruction. QuickBooks' entire invoicing pitch is built on a Pay Now button, and payment-link adoption is the single most-cited lever for getting paid faster.

**Fix, in order of effort:**
- Add an **Amount due** line under Total, with the due date beside it, set larger and bolder than anything else on the page.
- Move **bank details into Settings** as a structured field and render them in a bordered "How to pay" block, not buried in Notes.
- Later, a **payment link** (Stripe/GoCardless) rendered as a button in the HTML invoice.

**Effort:** small for the first two. **Impact:** directly affects how fast you get paid.

## 7. The scan feature — your biggest CTA — dead-ends

**What I saw:** the black "What do you want to scan or add?" banner is the largest element on the dashboard. Clicking it opens a full-screen black page showing "Starting camera…" indefinitely. I confirmed camera permission was still at `prompt` and a camera device was present. No error, no timeout, no explanation, no prompt to allow access. Nav is hidden; the only escapes are a small "Cancel" and an equally small "Upload" in the bottom corners.

**Why it matters:** the most prominent thing on your home screen leads to a black screen that appears broken. On desktop — where you'd normally upload a file rather than use a webcam — "Upload" is the smallest text on the page.

**Fix:**
- If permission is `prompt`, say so: *"Allow camera access to scan a receipt"* with an Allow button that triggers the request.
- If `denied` or no camera, skip the camera entirely and show the upload/drop zone as the primary path.
- Add a timeout (~5s) with a fallback message.
- On desktop, make **Upload** the primary action and camera secondary.
- Keep the app nav visible, or add a clear back arrow.

**Effort:** small. **Impact:** rescues the feature you're leading with.

## 8. No automatic payment reminders

**Why it matters:** chasing late payers is the worst part of freelancing and the most automatable. FreshBooks supports up to three reminders per client, each configured as N days *before* or *after* the due date, sent automatically to whoever the invoice went to, with editable text — plus optional late fees as a percentage of the invoice, percentage of the outstanding balance, or a flat fee, applied N days after due.

You already have the hard parts: due dates, paid status, a push-notification pipeline, and a daily cron. The missing piece is reminders aimed at the *client*, not at you.

**Fix:** start with three fixed reminders (3 days before due, on due date, 7 days after) as a per-client on/off, using the existing cron. Later make the schedule configurable.

**Effort:** medium. **Impact:** high, and builds on infrastructure you've already paid for.

## 9. No invoice duplication

Freelance work repeats monthly; retyping is the main cost of using an invoicing app. FreshBooks exposes duplicate as a one-click icon on every list row and in bulk. Add **Duplicate** to the invoice row and detail page: copy client, line items, terms and notes; new sequential number; today's date; due date recalculated from terms; status Draft.

**Effort:** small. **Impact:** disproportionate to effort — likely your most-used button.

---

# PART 2 — Layout, spacing, wording

These are smaller but cheap, and several are one-line changes.

## 10. Every page puts an empty form above your data

Receipts and Clients both open with a large empty form; your actual records sit below, requiring a scroll past eight fields. On Receipts the form is roughly 600px tall before you see a single receipt.

Competitors invert this: the list is the page, and creating is a button that opens a form or a separate route. Invoices already does it correctly with **+ New invoice** top-right — so the app disagrees with itself.

**Fix:** make Invoices the pattern. List first, **+ Add receipt** / **+ Add client** buttons top-right.

## 11. Invoice line-item columns have no headers

The new-invoice form shows a description box, then two unlabelled boxes containing `1` and `0`. Nothing says which is quantity and which is unit price — you infer it from the values. The printed invoice labels them correctly (Qty, Unit price, Amount); the form doesn't.

**Fix:** add a header row above the line items using the same labels as the printed invoice.

## 12. Settings fields have no labels

Business name, VAT number and address are three identical-looking boxes. Placeholders vanish once filled, so a completed form is three anonymous values. I could only tell them apart because I'd typed them.

**Fix:** persistent labels above each field. This is the clearest instance of a pattern repeated across the app — placeholder-as-label. It fails as soon as a field has content.

## 13. The category bar chart has no maximum bar width

With one category the bar spans about 75% of the chart, reading as a solid black slab rather than a chart. It's rendering correctly — it's just unconstrained.

**Fix:** cap bar width (~80px) and left-align. Consider a horizontal bar chart instead, which reads better for category breakdowns with long names and handles 1–15 categories gracefully.

## 14. Emoji used as icons, inconsistently

The dashboard has 📁 "Browse your file library" and 🔁 "Recurring expenses"; the new-invoice page has 📷 on "Scan or attach a document". They render as colour clip-art against otherwise restrained black-and-white typography, and they're the only icons in the app.

**Fix:** either remove them, or adopt a proper icon set (Lucide, Heroicons) and use it consistently. Right now they read as unfinished.

## 15. The invoice's sender block is weaker than the client block

Your business name is right-aligned small grey text; the client's name is larger and bolder on the left. On a letterhead, the sender is normally the most prominent element. Current hierarchy makes the invoice look like it came *from* Northgate Studios.

**Fix:** move your business block top-left at the same weight as the invoice title, client block below-left under "Billed to". This is the conventional layout across all templates reviewed.

## 16. Smaller items

- **File input is raw and unstyled** — "Choose file No file chosen" at the top of the receipt form. Needs a styled drop zone.
- **Two "Filter" disclosures** (Receipts, Invoices) are collapsed by default and easy to miss. With few records they're clutter; with many they're essential. Consider showing a search box inline instead.
- **"Unpaid — click to mark paid"** puts an instruction inside a status label. Separate them: status pill plus a **Mark as paid** button.
- **Login page doesn't say what the app is.** Anyone you share the link with sees "Invoicer / Sign in / Welcome back". One line of description would help.
- **"Clients & suppliers" nav says only "Clients"** — suppliers are a tab inside it. Someone looking for suppliers won't find them in the nav.
- **No empty states.** With no records, pages show a form and nothing else. Competitors use empty states to teach the first action.
- **Existing receipts keep their old interpretation.** The £549.99 receipt was entered under the old ambiguous label and still shows £549.99 excl. VAT / £641.66 incl. Worth a one-off check of pre-fix receipts.

---

# PART 3 — Where competitors are clearly better

Ranked by what's worth copying.

| # | What they do | Who does it | Worth copying? |
|---|---|---|---|
| 1 | Receivables-first dashboard: Current vs Overdue, clickable into ageing | Zoho Invoice, FreshBooks | **Yes — copy directly** |
| 2 | Full status lifecycle (Draft/Sent/Partial/Paid) with colour | Invoice Ninja (8 statuses) | **Yes — adapt to 4** |
| 3 | Up to 3 automatic reminders, N days before/after due, editable text | FreshBooks | **Yes — start with 3 fixed** |
| 4 | Pay Now button / payment link on the invoice | QuickBooks, Wave | Yes, once payments are set up |
| 5 | Duplicate and edit as quick-action icons on every list row | FreshBooks | **Yes — cheap and high value** |
| 6 | Aged receivables buckets: not yet due, ≤30, 31–60, 61–90, 91+ | Wave | Later — needs volume to matter |
| 7 | Client portal where clients view and pay invoices | Invoice Ninja, FreshBooks | Later — significant build |
| 8 | Late fees: % of invoice, % of balance, or flat, applied N days after due | FreshBooks | Later — niche for most freelancers |
| 9 | Revenue by client, top four plus "Other" | FreshBooks | Later — needs history |
| 10 | Recurring invoices (not just recurring expenses) | Invoice Ninja, Zoho | **Worth considering** — you have recurring *expenses* already; the income side is the one that saves real time |

**The pattern across all of them:** they are built around *getting paid*. Status, reminders, payment links, receivables, ageing, portals — all of it serves one loop: issue → track → chase → collect. Invoicer currently does "issue" well and the rest not at all. Your expense side is arguably *better* than Wave's or Zoho's, which makes the gap on the income side more striking.

**Where you already beat them:** receipt warranty tracking, honest gross/net VAT wording on receipt entry, custom reorderable categories, and one-click full data export. None of the five tools reviewed does all four.

---

# Suggested order of work

**First — correctness and compliance**
1. Sequential invoice numbering (#1)
2. VAT on invoices (#2)
3. Amount due + bank details out of Notes (#6, partial)

**Second — make it usable daily**
4. Edit for all entities (#3)
5. Duplicate invoice (#9)
6. Invoice status lifecycle (#5)
7. Fix the scan dead-end (#7)

**Third — make it answer the right question**
8. Receivables-first dashboard (#4)
9. Automatic payment reminders (#8)

**Fourth — polish**
10. List-before-form (#10), field labels (#11, #12), chart width (#13), icons (#14), invoice hierarchy (#15), and the items in #16

Items 1, 3, 6 and 9 are individually small and together change the app's character more than anything else on the list.

---

## Sources

- [FreshBooks — payment reminders and late fees](https://support.freshbooks.com/hc/en-us/articles/227559727-What-are-payment-reminders-and-late-fees)
- [FreshBooks — how do I use my dashboard](https://support.freshbooks.com/hc/en-us/articles/115015407988-How-do-I-use-my-dashboard)
- [FreshBooks — how do I manage my invoices](https://support.freshbooks.com/hc/en-us/articles/4404632032013-How-do-I-manage-my-invoices)
- [Zoho Invoice — dashboard](https://www.zoho.com/de-de/invoice/help/dashboard/index.html)
- [Wave — aged receivables report](https://support.waveapps.com/hc/en-us/articles/4406239714452-Aged-Receivables-report)
- [Invoice Ninja — invoices, statuses and actions](https://invoiceninja.github.io/docs/user-guide/invoices)
- [QuickBooks — getting invoices paid faster](https://quickbooks.intuit.com/r/payments/20-ways-to-get-clients-to-pay-their-bills-and-invoices-faster/)
- [UK VAT invoice requirements 2026 — required fields](https://invoiceadept.com/blog/invoicing/vat-invoice-requirements-uk-2026/)
