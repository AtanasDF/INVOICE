# Customers, Settings, VAT and the company check

Written 2026-09-28 by opening the files, not from memory. Where a fact needed the live site to
settle it, it was settled by calling the live site (noted where that happened).

Six pages: **Customers & suppliers** (`/clients`), **New customer / New supplier**
(`/clients/new`), **a customer's Statement** (`/clients/<id>/statement`), **Settings**
(`/settings`), **VAT** (`/vat`), **Check a company** (`/check-company`). Plus two boxes that are
not pages but appear all over this area and decide what it can do: the **Companies House name
box** and the **VAT number box**.

**The one-line answer on money.** Nothing in this whole area costs a penny to run, with one
exception: **"Scan to fill in" on a new customer or supplier is a paid AI read and it spends one
document out of the account's daily allowance** — the same allowance a receipt spends. Everything
else here is your own database rows, the browser, or two free government APIs.

---

## Customers & suppliers — `/clients`

- **What it is for.** One list of everybody you deal with. Customers are who you send invoices
  to; suppliers are who your receipts and bills come from. The same record carries their address,
  VAT number, phone, payment terms and whether they get chased for payment.

- **How you get there.** Header → **Money in** → **Customers & suppliers**. On the dashboard, the
  **Who you work with** card has **See all** and three buttons: **New customer**, **New person**
  (`/clients/new?person=1`), **New supplier**. Also from `/quotes/requests/<id>` ("Add their email
  in Customers & suppliers") and from the scan page after saving ("View suppliers").

- **What is on it**, in screen order:
  - Heading **Customers & suppliers**, under it *"Customers are who you invoice. Suppliers are who
    invoices or receipts come from."*
  - Top right: **Download for a spreadsheet** (only when the list is not empty), then **Scan a
    customer** / **Scan a supplier** and **+ Add**.
  - Two tabs: **Customers** | **Suppliers**. The tab is in the address (`/clients?tab=supplier`),
    so a link can open either. **It is one table** — `clients` with `kind = 'client' | 'supplier'`
    — and the tab is the only thing separating them.
  - A tip, the first three times: *"Tip: photograph a business card, letterhead or invoice and the
    name, address, email and VAT number are filled in for you."*
  - **Duplicate cards**, one per suspected pair: *"**Travis Perkins** and **Travis Perkins Ltd**
    look like the same client: the same name."* with **Merge into Travis Perkins** and **They're
    different**.
  - Then a row per contact: the name (plus an **Archived** badge), and under it
    `Company · email · phone · VAT 123 4567 89 · Reminders off`. On the right, only the ones that
    apply: **Send a text** (needs a phone number), **Statement**, **Payment history** / **Hide**,
    **All invoices** (`/invoices?client=<id>`), **Edit**, **Archive** / **Unarchive**, **Remove**.
  - **Payment history** opens inline: each invoice as `INV-123 · 4 Mar 2026 · £1,200.00` with a
    status badge. The figure is **what the customer was actually asked for** — gross, incl. VAT,
    less any CIS the contractor keeps back, less credit notes — the "Amount due" on the document
    itself, not the line-item subtotal.
  - At the foot, **N archived** toggles them into view.
  - **Edit** turns the row into a form in place: Company / Individual radio, name (with the
    Companies House box for a company), Email, Address, then a 2-column grid of **VAT number**
    (with any kept HMRC references under it), Contact person, Phone, Payment terms, Default
    currency. Then, where they apply, **Send automatic payment reminders for invoices to them**
    and **They have told me in writing that they are an end user**. **Save** / **Cancel**.

- **What it does behind the scenes.**
  - Rows are `clients` (`src/lib/storage.ts`, `clientsStore`). The end-user tick is
    `clients.reverse_charge_end_user` (migration-039); the Companies House number is
    `clients.company_number` (migration-030).
  - **Remove really deletes** — the only such button in this area — and usually cannot: every
    foreign key into `clients` is `ON DELETE RESTRICT` (migrations 014/015), so anyone with an
    invoice, receipt, quote or recurring item is refused with *"Can't remove this customer or
    supplier — it still has receipts, invoices, quotes, or recurring items linked to it. Archive it
    instead…"*. It asks first either way.
  - **Archive** is the real escape hatch: hides them from every picker on new records and touches
    no history.
  - **Merging** (`clientsStore.mergeInto`, `src/lib/duplicateContacts.ts`): the pair is found when
    the names match once *Ltd*, punctuation and case are stripped, **or** the emails match, **or**
    the phone numbers match on at least 10 digits (leading `44` read as `0`). Same kind only — a
    customer and a supplier of one name are two sides of a trade, never a pair. The **fuller**
    record is the one kept (scored on how many of email, phone, address, VAT number, contact person
    are filled). The merge repoints `invoices`, `receipts`, `quotes`, `recurring_invoices`,
    `recurring_expenses.supplier_id` and `quote_request_suppliers.supplier_id`, then **archives**
    the duplicate — it is never deleted. It asks first, naming how many invoices move, and reports
    *"Merged into X: 7 records moved."*
  - **They're different** is remembered **on that device only** (`localStorage`,
    `clients-not-duplicates`). A new phone offers the pair again.
  - **Download for a spreadsheet** writes `customers-2026-09-28.csv` (or `suppliers-`) in the
    browser: name, type, email, address, vat_number, payment_terms, default_currency,
    contact_person. **The phone number is not in it.**
  - The reminder tick drives `/api/reminders/send` (the daily cron). The end-user tick is what
    switches the VAT reverse charge **off** for that customer (`src/lib/reverseCharge.ts`).

- **Where it takes you next.** `/clients/new?kind=…`, `/clients/new?kind=…&scan=1`,
  `/clients/<id>/statement`, `/invoices?client=<id>`, and whatever the **+ Add** sheet offers.

- **Free, gated or not built.** Behind sign-in. **Free — no model call, no paid API, no
  environment switch.** Two things on it depend on keys: the company-name lookup in the edit form
  needs `COMPANIES_HOUSE_API_KEY` (**set in production**), and the VAT box's HMRC half needs
  `HMRC_CLIENT_ID`/`HMRC_CLIENT_SECRET` (**not set in production** — see below).

---

## New customer / New supplier — `/clients/new`

- **What it is for.** Adding one contact, either by typing or by photographing anything with their
  details on it.

- **How you get there.** **+ Add** or **Scan a customer / Scan a supplier** on `/clients`; the
  dashboard's three buttons; *"Add a supplier first, with their email"* on the quote-request form.
  The address carries the shape: `?kind=supplier` makes it a supplier, `?person=1` opens on
  **Individual**, `?scan=1` opens the camera on arrival.

- **What is on it.**
  - Heading **New customer** / **New supplier**, same one-line explanation as the list.
  - A card with **Scan to fill in** (→ **Reading…** → **Scan again**), **Upload a photo or PDF**,
    and *"A business card, letterhead, invoice, email or any photo with their details. Names,
    addresses, emails and VAT numbers are picked out for you."* If the photo holds more than one
    business, chips appear under **Found on the page — tap the one you want**, and picking one
    re-fills the fields — but only the fields the last scan wrote, so anything you typed by hand
    survives.
  - The form: **Company** / **Individual**; **Company name** (register lookup) or **Full name**;
    **Email (optional)**; **Address (optional)**; **More details (optional)**, open by default,
    holding **VAT number**, **Contact person**, **Phone**, **Payment terms (e.g. 30 days)**,
    **Default currency (e.g. GBP)**. For a customer: **Send automatic payment reminders to this
    customer**, ticked by default. For a customer that is a company: **They have told me in writing
    that they are an end user**, with *"For CIS work, this is what means you charge them VAT as
    normal instead of the reverse charge. Only tick it if they have actually said so."*
  - **Save customer** / **Save supplier**, and **Clear form**.

- **What it does behind the scenes.** The scan is `POST /api/contact-scan` with the signed-in
  bearer token → `extractContacts` (`src/lib/contactExtraction.ts`), **Claude by default**
  (`claude-opus-5`, effort `low`) — note `/scan` defaults to Gemini and this one does not. A
  supplier form prefers the business that *issued* the document, a customer form the one it was
  *sent to*. On save, `clientsStore.add`, then the picked register entry is remembered on the
  device (`src/lib/companyRegister.ts`) and any HMRC reference is attached
  (`src/lib/keepVatCheck.ts`) — and if keeping the reference fails, it fails silently, because the
  contact is what was asked for.

- **Where it takes you next.** Saving returns to `/clients?tab=<kind>`.

- **Free, gated or not built.** Behind sign-in. **Typing is free. Scanning is not, twice over:**
  it is a paid Claude call on Atanas's key, limited to **60 an hour per account and 300 an hour
  across everyone**, files up to 10 MB — **and it spends one document from the account's scan
  allowance** (`allowScans`/`spendScans`, `src/lib/scanLimit.ts`). `SCAN_LIMITS` is **"on" in
  production**, so a business card read costs one of the day's 50 (300 in the first week). A failed
  read costs nothing.

---

## Statement — `/clients/<id>/statement`

- **What it is for.** Everything one customer has ever been invoiced, what they have paid, and
  what is still owed — one sheet to print, send or read down the phone when somebody asks *"what
  do I owe you?"*.

- **How you get there.** The **Statement** link on that contact's row in `/clients`, which appears
  only once they have at least one invoice. Nothing else links to it.

- **What is on it.** `← Customers & suppliers`, heading **Statement**, *"Everything Acme Ltd has
  been invoiced, and what's still owed."* Then a summary card: **Owing as at 28 Sep 2026** with the
  figure large; in amber, *"£1,080.00 of that is late, the oldest by 45 days (INV-118)"*; or
  *"Nothing outstanding."* Buttons: **Share (WhatsApp, Messages…)**, **Download PDF**, **Save as**
  (PDF, picture, smaller picture, Word, web page, plain text, spreadsheet), **Print**, **Copy the
  figures**.
  Then the sheet itself: *Statement of account*, the as-at date, your business name, address and
  VAT number top right, **For** and the customer's address, then a table —
  **Date | Invoice | Charged | Credited | Paid | Owing**, with *"45 days late"* under the number
  and *"£200.00 in credit"* in place of Owing where they have overpaid. **Total owing**, and **In
  your credit** when money is owed back. **How old it is**: four boxes, *Not yet late*, *1–30 days
  late*, *31–60 days late*, *Over 60 days late*. **How to pay** with your bank details, only when
  something is owed.

- **What it does behind the scenes.** `src/lib/statement.ts` (`buildStatement`, `statementText`),
  drawn by `src/components/StatementDocument.tsx`. Draft invoices are left out. Each line is the
  invoice page's own arithmetic — `invoiceCharge` for what is due (VAT in, CIS out), credit notes
  off that, payments off that, `invoiceBalance` for the balance — so the statement can never
  disagree with the document that was sent. An invoice marked paid by hand before payments existed
  owes nothing. Days late run from the due date to **today in Europe/London** (`todayISO()`). The
  ageing boxes mean exactly what they say: *Not yet late* holds only what is not yet late. The PDF
  is made in the browser from the printed sheet.

- **Where it takes you next.** Back to `/clients`. The share sheet and Save-as hand a file to the
  phone; nothing is emailed from here.

- **Free, gated or not built.** Behind sign-in. **Entirely free** — no AI, no API, no environment
  switch, nothing stored. **There is no "Email this statement" button**, although invoices and
  quotes both have one.

---

## Settings — `/settings`

- **What it is for.** Everything about you and your business that appears on documents, plus how
  you sort spending, plus your account and your data. One long page, fifteen sections.

- **How you get there.** **Settings** in the header (its own item, outside the three groups). The
  Save bar is sticky at the bottom.

- **What is on it, and what each setting actually changes.** Sections in screen order. The first
  eight are one form behind one **Save**; everything after the Save bar saves itself.

  1. **Heading and tip.** *"How it works: what you put here goes on every invoice you send — your
     business name, your address and your bank details. The VAT switch changes how new invoices are
     priced, and it never changes one you have already sent."*
  2. **Your business** (titled **About you** for personal use). *"Fill this in once."*
     - **What are you using this for?** — **A limited company** / **A sole trader** / **Personal
       use**. This does three things: it decides whether the registered-company block appears, it
       picks the **starting list of expense categories** (`src/lib/categories.ts` — the sole-trader
       list follows the self-assessment expense boxes; the limited list adds Salaries & PAYE,
       Pension contributions, Director's expenses, Client entertaining), and **Personal use hides
       the VAT, Invoice numbering, Bank details and Payment reminders cards entirely**.
     - **Business name** (or **Your name**) — the headline on every invoice, quote, reminder and
       statement. Typing offers matching Companies House companies.
     - **Registered company name** + **Company number** — shown when the kind is *limited* or
       either field is already filled, in a grey box explaining *"A limited company must print its
       registered name and number on its invoices."* They print **small at the foot** of the
       invoice (Companies Act 2006 s.82), and only when **both** are set. Typing a complete company
       number looks the name up by itself.
     - **Business address** — on documents, with the UK address lookup behind it.
     - **Logo** — **Add a logo** / **Change logo** / **Remove logo**, PNG/JPEG/WEBP. Uploaded the
       moment it is picked; kept on the profile when **Save** is pressed; removal asks first. Goes
       at the top of invoices and quotes. Hidden for personal use.
  3. **VAT** — a two-way switch, **Without VAT** | **With VAT**, and the **VAT number** box
     (disabled until *With VAT*, hint *"As it appears on your VAT certificate."*). The switch is
     what prices new invoices and quotes. It **never** changes a document already issued: the
     setting is stamped onto the invoice when it is numbered (`invoices.vat_registered`,
     migration-024) and onto a quote when it leaves draft (migration-033).
  4. **Invoice numbering** — *"The next invoice will be **INV-357358**."* **Prefix** and **Next
     number**. An amber warning if the next number is at or below the highest already used. Two
     subtleties: an untouched **Next number** writes back today's live value rather than the one
     the page loaded with (the counter moves on its own whenever an invoice is sent, possibly on
     another device), and numbers are sequential and never reused.
  5. **Bank details** — a free-text box, *"Printed on every invoice as 'How to pay'."* Also on
     reminders and on a statement where something is owed.
  6. **Expense categories** — the list used by receipts, expenses and the scanner. ▲▼ to reorder,
     type over a name to rename, **Remove**, **Add a category (e.g. Childcare)** + **Add**. If the
     list is missing any of the kind's own: *"The sole-trader list also has: …"* + **Add them**.
     **Reset to defaults**. At least one is required. **Removing a category leaves the receipts
     that used it exactly as they are** — the category is plain text on the row.
  7. **Payment reminders** — the schedule in words (*3 days before due, on the day, then 7, 14 and
     30 days after, each a little firmer*), a **How it works** fold-out, then five boxes, one per
     reminder, blank meaning "use the default wording". Tokens: `{{client_name}}`,
     `{{invoice_number}}`, `{{amount_due}}`, `{{due_date}}`, `{{pay_by}}`. Then **Tell business
     customers you can claim late-payment interest** — the Late Payment of Commercial Debts
     (Interest) Act 1998 line, printed at the foot of an invoice to a customer marked **Company**
     and repeated in the final reminder only; and **Gently remind me on the dashboard about overdue
     invoices**.
  8. **The Save bar** (sticky). **Save**, *"Unsaved changes."*, *"Saved."* Leaving with unsaved
     changes is caught — links, the header's **Sign out**, and the browser's Back — and the bar
     becomes *"You have unsaved changes."* with **Save and go** / **Leave without saving** /
     **Stay**. If the database is behind the code, it says so precisely: *"Saved, apart from what
     you're using the app for and the registered company details: those need a database update
     first. Everything else is in."*
  9. **What your account allows** (`PlanCard`, `src/components/ScansLeft.tsx`) — **the only place
     in the app that states the scan limit in full.** Today it reads either *"You are new, so you
     have a bigger allowance for your first week — 300 documents a day, to catch up on a pile of old
     paper"* or *"Free: 50 documents a day, and 600 in a month. Copying a document, changing a file
     and writing invoices by hand never count."* Then **Today** `12 of 50` and **This month**
     `139 of 600`, and *"If you run out this month, you can ask for another 600 once, free."* It
     reads the `scan_allowance()` database function and shows **nothing at all** if that fails.
     There is a `paid` branch that says *"You are on the paid plan. There is no limit…"* — **nothing
     in the app or the database can make an account paid**, so no one has ever seen it.
  10. **Tell a mate** (`InviteCard`) — **renders nothing today.** `NEXT_PUBLIC_INVITES` is not set.
      Built and the database work applied (migration-037): a **Send my link** button, the code shown
      underneath, and 300 extra documents each when the friend scans their first document.
  11. **How it looks** (`ThemePicker`) — **Follow my phone** plus five colours. Saves itself
      instantly, **on that device only** (localStorage, not the account). *"Invoices always print in
      plain ink, whichever colour you pick."*
  12. **Put Invoiceover on your phone** (`GetTheApp`) — an **Install it** button where the browser
      offers one, the three iPhone Share → Add to Home Screen steps otherwise, and nothing at all
      once it is installed.
  13. **Notifications** — **Turn on notifications** / **Turn off notifications**. On iPhone it
      refuses until the app is on the Home Screen and says why (Safari only delivers push to an
      installed app).
  14. **Email import** — your private address `u-••••••••••••@invoiceover.com` with **Show**,
      **Copy** and **Get a new address**, or **Get an address to email receipts to** if there isn't
      one. *"Treat this address like a password. Anyone who has it can send mail that creates
      receipts in your account."* A new address kills the old one instantly, and it asks first.
      Forwarded mail lands under **Needs review**, never straight in.
  15. **Your account** — *"You're signed in as …"*, then four labelled blocks: **Getting back in**
      (**Email me a sign-in link** — the same email as "forgotten my password", which signs the
      browser in and lands on `/reset-password`); **Where your data lives** (EU/Ireland, receipt
      photos through links that expire after seven days, the invoice and quote links the one
      exception); **Take it all with you** (**Download all my data** — one JSON file,
      `my-data-export-2026-09-28.json`, with the photographs inlined so nothing in it expires);
      **Closing the account** (*"There's no delete button anywhere in this app, on purpose… To have
      the account and everything in it removed, ask through Feedback and it's done by hand"*). Then
      **Sign out**.

- **Where it takes you next.** `/receipts/review` (from Email import), `/feedback` (from Closing
  the account), `/reset-password` (via the emailed link), and out of the app via **Sign out**.

- **Free, gated or not built.** Behind sign-in. **No model call anywhere on this page and no paid
  API.** Three things are switched: the company-name and company-number lookups need
  `COMPANIES_HOUSE_API_KEY` (**set in production** — without it they are plain boxes and nothing
  mentions a register); the VAT box's HMRC half needs the HMRC credentials (**not set in
  production**); **Tell a mate** needs `NEXT_PUBLIC_INVITES` (**not set** — invisible). The
  allowance card is live and real today.

---

## VAT — `/vat`

- **What it is for.** The five figures a VAT return asks for, worked out from the invoices and
  receipts already in the app, so they can be checked and copied into HMRC's own form. **It files
  nothing anywhere.**

- **How you get there.** Header → **Tools** → **VAT**. Also a **VAT** link on `/expenses`. The
  page's own back link says `← Expenses`.

- **What is on it.**
  - Heading **VAT**, *"The figures for a quarter, worked out from your invoices and receipts. Check
    them, then copy them into HMRC's form."* A tip: *"…Nothing is sent from here."*
  - If Settings says you are not VAT registered, a grey note: *"Settings says you're not VAT
    registered, so your invoices carry no VAT. The purchases below still show the VAT you were
    charged."*
  - A period card: pills **Last quarter** and **This quarter**, then **From** and **To** date
    boxes, then a two-way choice **By invoice date** | **When money moved** with the difference
    spelled out underneath.
  - The figures card, headed e.g. **Jan 2026 – Mar 2026**, with **Copy the figures**:
    - **Box 1** VAT due on sales
    - **Box 4** VAT you can reclaim on purchases
    - **Box 5** VAT to pay HMRC — or **VAT HMRC owes you** when it is the other way, shown as a
      positive number, in bold
    - **Box 6** Total sales, ex VAT
    - **Box 7** Total purchases, ex VAT
  - **What's in it** opens two lists: **Sales (n)** — invoice number, date, net and VAT, credit
    notes appearing as *"Credit against INV-118"* with negative figures — and **Purchases (n)** —
    supplier, date, net and VAT.
  - A note when the cash basis could only count a credit note in part.
  - Small print: *"A summary to check, not a filing: nothing here is sent to HMRC. Documents still
    waiting to be reviewed are left out, and anything on a margin or reverse-charge scheme needs
    checking by hand. On cash accounting, a CIS deduction counts as money received…"*

- **What it does behind the scenes.** All of it is `src/lib/vatReturn.ts` (`vatFigures`,
  `quarterOf`, `previousQuarter`, `quarterLabel`), priced by the same rules as the invoice page
  (`computeInvoiceTotals`, `invoiceVat`, `invoiceCharge`). The two bases really differ:
  - **By invoice date** (standard accounting): the whole invoice counts in the period it is dated,
    paid or not. A credit note reverses in full.
  - **When money moved** (cash accounting): only payments that landed inside the period count,
    split into net and VAT in the invoice's own proportion. **A CIS deduction is scaled back up**
    (`× total / due`) because the contractor paying HMRC on your behalf is still part of the
    consideration — without that, every CIS invoice would under-declare VAT for ever, since no
    later payment arrives to pick the rest up. A credit note only counts in proportion to what was
    actually received, and the page says so rather than quietly showing a different number.
  - Purchases are counted **by the date on the receipt on both bases** (the page says to check
    anything not yet paid for). Draft invoices and receipts still in **Needs review** are excluded.
    `receipts.amount` is already net, and a credit note is stored negative, so both simply add up.
  - Quarters offered are **calendar quarters**. A business on one of HMRC's other staggers has to
    set From and To by hand.

- **Where it takes you next.** `/expenses`. Nothing else; the copy button puts the figures on the
  clipboard.

- **Free, gated or not built.** Behind sign-in. **Free, no AI, no API, no environment switch,
  nothing stored.** **Not built, and worth being clear about:** there is no filing of any kind —
  no Making Tax Digital, no HMRC submission, no VAT registration — and **boxes 2, 3, 8 and 9 are
  not produced at all** (the page shows 1, 4, 5, 6, 7), so anybody with EC acquisitions or
  Northern Ireland movements has gaps to fill in themselves. The page does not say that.

---

## Check a company — `/check-company`

- **What it is for.** Typing a company's name or number and getting, in plain English, what
  Companies House holds: whether it is real, still trading, filing on time, who runs it, who owns
  it, whether anything it owns is pledged against borrowing, and whether it has been insolvent
  before. The moment for it is **before** you price a job.

- **How you get there.** Header → **Tools** → **Check a company**. A tile on the dashboard, put
  deliberately next to **Write a quote** (*"so people can check companies before they send the
  quotation"*). A line on the Free-invoice page: *"New customer? **Check the company** first."*
  And from the quote form, which links straight to `/check-company?number=12345678` for the
  customer it has.

- **What is on it.**
  - Heading **What is the company called?** — the biggest type in the app — and *"See if it is
    real, still trading, and who runs it. Free, nothing to join."*
  - One box, labelled **Company name, or its number**, placeholder *"Smith Building Ltd, or
    01234567"*, and a **Check** button (**Checking…** while it works). Under it: *"Not sure of the
    spelling? Type what you have. We show the close matches."* and *"Only limited companies are on
    the register. A sole trader won't be found here."*
  - Several names matching: **One match** / **N matches**, *"Pick the one you mean."*, each row
    showing the name, `Company 12345678 · active · since 4 March 2011` and the address.
  - The report, as a stack of cards: the name with **status / status detail / type** badges and
    company number, incorporation date and age; **What this means** — the plain-English lines
    (*"Dissolved on 3 June 2024 — this company no longer exists"*, *"Accounts are overdue by four
    months — they were due 30 April 2026"*, *"The confirmation statement, which says who runs and
    owns the company, is overdue"*, *"Three charges outstanding: something the company owns is
    pledged as security for borrowing"*, *"Companies House records a disqualification against an
    officer of this company"*); **Registered office** with its own warnings (*a dispute about this
    address*, *post has come back undelivered*, *this is a PO Box, not a place you can visit*,
    *this is a well-known company formation address*); **What it says it does** (SIC codes in
    words); **Previous names**; **Filings** (Accounts and Confirmation statement, each with last
    filed, next period, next due and an **Overdue by …** badge); **Officers**; **Who owns and
    controls it**; **Charges**; **Insolvency history**; **Website and social media** — *"Companies
    House holds none of these, so these are searches, not checks"*, seven prepared searches
    (Website, Reviews, Trustpilot, LinkedIn, Facebook, Instagram, X).
  - At the foot: **Copy the report**, **Share**, **View on Companies House**, **Check another**, a
    line naming anything that could not be loaded this time, and *"From the public Companies House
    register, read 28 September 2026."*
  - Refusals, all with a **Search at Companies House** link beside them: *"No company with that
    name is listed. Check the spelling, or type the company number."*, *"No company has that
    number. Check it against the paperwork."*, *"Too many checks from this connection in the last
    hour…"*, *"Companies House isn't answering just now. Try again in a minute…"*. With no API key
    the button becomes a link to Companies House and a card says **This check is coming soon**.

- **What it does behind the scenes.** `GET /api/company-check?q=` or `?number=`. A report is up to
  **five** upstream calls — profile, officers, people with significant control, and charges and
  insolvency only when the profile says there are any — built into plain English by
  `src/lib/companyReportBuild.ts` against Companies House's own enumerations
  (`src/lib/companyHouseTerms.ts`). Limits: **40 searches an hour per connection, 600 an hour
  overall; 20 reports an hour per connection, 300 an hour overall**; answers cached in the running
  function's memory for 10 minutes (search) and 15 minutes (report). The number goes into the
  address bar, so a report can be reloaded or sent to somebody. **Nothing about the company is
  stored** — no row, no history. A 404 on officers or charges means "none filed", which is an
  answer; anything else is listed as *couldn't load*, so the page never claims there are none.

- **Where it takes you next.** `/check-company?number=…` (itself), Companies House and the
  prepared searches in a new tab.

- **Free, gated or not built.** **This is the sharpest mismatch in my area.** The Companies House
  API is free and the key **is set in production** (checked live on 2026-09-28:
  `/api/company-check` answers `{"configured":true}`). The page costs nothing per use — no AI, no
  paid API. **But it is behind sign-in.** `/check-company` is not in the Gate's public list
  (`src/app/AppShell.tsx`), so a stranger lands on `/login` — while the page's own heading says
  *"Free, nothing to join"*, its `<title>` is *"Check a UK company — free Companies House lookup"*,
  and its search description was carefully rewritten away from "no account needed" for exactly
  this reason. The description was fixed; the heading was not.

---

## The two boxes that appear everywhere

Not pages, but they decide what the whole area can do.

### The Companies House name box — `CompanyNameInput`

- **Where it appears.** Settings (business name, registered company name), the new and edit
  customer/supplier forms, the Free-invoice page's business and customer fields, the quote customer
  picker. Its sibling `CompanyNumberInput` is in Settings only.
- **What it does.** Typing three or more letters lists matching companies (name, number, *since
  Mar 2011*, address, and a note if the status is anything but active). Picking one fills the name
  and keeps the company number; it fills the **address** when the address box is empty, and only
  *offers* it when something is already there (*"Registered office: … **Use this address**"*),
  because a registered office is often an accountant's. Change the name after picking and the
  number is dropped — otherwise a later check would report on a company you have nothing to do
  with, under the right name. Keyboard and screen-reader complete (combobox, arrow keys, Escape).
  On the new-contact form a note appears under the box: *"Company 12345678 on the Companies House
  register."*, or "not on the register" — but only when the name looks like a company, since most
  suppliers are sole traders and that note about a plumber is noise.
- **Behind it.** `GET /api/company-search`, 60 per five minutes per connection, 120 (signed out) /
  180 (signed in) per five minutes overall — deliberately half the key's own 600-per-five-minutes
  so the free page cannot use up what account holders need. Plain search is **active companies
  only**, so a pick can never be a dead company; `scope=all` (used when checking a name already on
  a document) includes dissolved ones. Ten-minute cache.
- **Switch.** `COMPANIES_HOUSE_API_KEY`. **Set in production.** Without it every one of these is a
  plain text box and the app says nothing at all about any register. It is free.

### The VAT number box — `VatNumberInput`

- **Where it appears.** Settings (your own number, disabled until *With VAT*), the new and edit
  customer/supplier forms, the quote customer picker.
- **Two halves, and the first always works.** A UK VAT number carries its own check digits, so a
  typo is caught **on the device, asking nobody** (`src/lib/vatNumber.ts`: mod 97 **and** mod 97-55,
  both in circulation). It says *"Those 9 numbers don't add up, so one of them is probably typed
  wrong. Check it against the paperwork."*, *"A UK VAT number has 9 numbers, and this has 8."*,
  *"That looks like a VAT number from another country. This box takes a UK one."*, *"That is a
  government department's number."* It waits 700 ms so nobody is told they are wrong after three
  digits, tidies the number to `GB 220 4302 31` when you leave the box, and **never refuses a
  save** — the paperwork in somebody's hand is a better authority.
- **The second half is HMRC, and it is off.** With credentials the box says *"Checking it with
  HMRC…"* then *"HMRC has this as Acme Builders Ltd, 4 Mill Lane, SE18 1HU."*, or *"HMRC has
  nobody registered with that number. Check it against the paperwork."*, or *"Couldn't check it
  with HMRC just now. The number itself adds up."* Plus, when the name typed alongside differs:
  *"That is a different name from the one above, so check you have the right number."* **Without
  credentials it says only *"That number adds up."*** and HMRC is never mentioned.
- **The consultation number — the one thing here nothing else on the market offers.** Send HMRC
  *their* VAT number and *yours* together and HMRC return a dated reference proving you made the
  check. That is the evidence HMRC ask for if they ever query VAT you reclaimed against a supplier
  who turns out not to have been registered. The box shows it: *"HMRC's reference for this check is
  ABC123, made 25 September 2026. Keep it with your records: it is what proves you checked."* It is
  kept in `vat_checks` (migration-038, applied) after the contact is saved, **one row per number
  per day**, the day reckoned in Europe/London; the table grants insert and select and **no update
  or delete**, because evidence you can quietly edit is not evidence. History keys on the **number**,
  not the contact, since a number is usually checked before the contact exists. `KeptVatChecks`
  shows the newest under the box (*"Checked with HMRC on 25 September 2026, who had it as Acme
  Builders Ltd. Reference ABC123. 2 earlier checks, back to 3 September 2026."*). Your own number
  is only sent **once somebody has actually typed in the box** — a consultation lookup is never
  cached, so merely opening thirty edit panels used to burn the hourly limit on references nobody
  kept.
- **Behind it.** `GET /api/vat-check`, HMRC's *Check a UK VAT number* API **version 2.0 only**
  (version 1 was removed in February 2025), 30 an hour per connection, 300 an hour overall.
  The plain answer is cached six hours; **a consultation number never is**. A 403 on the
  two-number form means *our* number was refused, not theirs, so it falls back to the plain lookup
  rather than telling somebody nothing.
- **Switch.** `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET`. **Not set in production** (checked live on
  2026-09-28: `/api/vat-check` answers `{"configured":false}`). So **on the live site nobody has
  ever seen an HMRC answer or been issued a consultation number, and `vat_checks` is empty.** The
  sandbox is set up and works, but only on this Mac (`HMRC_API_BASE` points at
  `test-api.service.hmrc.gov.uk`), and only **726129090** of HMRC's forty published test numbers
  passes the real check digits, so it is the only number the sandbox can be exercised with.
  Production access needs a production application on HMRC's Developer Hub and Terms of Use 2.0,
  which HMRC review in **up to 10 working days** — about two weeks end to end.

---

## Worth deciding

1. **Is "Check a company" the shop window or an inside tool?** It is free to run, it needs no
   account to be useful, its title and description are written to be found in a search, and its own
   heading says *"Free, nothing to join"* — but a stranger who clicks that search result is sent to
   `/login`. Either make `/check-company` public (it is the one page in the app that could be, at
   zero cost per use) or change the heading. Which?
2. **Should reading a business card cost a receipt?** "Scan to fill in" on a new customer or
   supplier spends one document out of the 50 a day, the same as a supplier invoice — and it runs on
   Claude, the expensive reader, while `/scan` defaults to Gemini. Own allowance, free, or leave it
   counted?
3. **Do we spend two weeks getting HMRC production credentials?** The consultation number is
   genuinely unmatched (nothing in the competitor notes offers it) and is the sort of thing an
   accountant tells a tradesman to keep. Is it a free feature, the first real reason to pay, or not
   worth two weeks?
4. **If a paid tier arrives, does anything in this area sit behind it?** Today: nothing. The only
   live limit anywhere is on reading documents. Candidates, if you wanted any: the HMRC check and its
   kept references, the company report, the customer statement, data export.
5. **Is "Personal use" a product?** Picking it hides VAT, invoice numbering, bank details and
   payment reminders, leaving a spending tracker with a category list. Is that a deliberate second
   audience, or should the option go?
6. **Should the statement be emailable?** It can be printed, shared, saved as seven kinds of file
   and copied as text — but invoices and quotes can be emailed with the PDF attached and this
   cannot, which is odd for the one document whose whole job is chasing money.
7. **Does the VAT page ever file?** It produces boxes 1, 4, 5, 6 and 7 and says plainly that
   nothing is sent to HMRC. Making Tax Digital is a certification exercise, not an afternoon. Stay a
   copy-out sheet — and if so, should it say out loud that boxes 2, 3, 8 and 9 are yours to fill and
   that only calendar quarters are offered?
8. **Should the "how it looks" choice and the "they're different" list follow the account?** Both
   live on the device. A new phone comes back to the default colour and re-offers every duplicate
   pair you already dismissed.
9. **Should a customer and a supplier of the same name be offered as a pair?** They are deliberately
   never merged — right, since one is sales and one is purchases — but nothing in the app says
   *"these two records are the same firm"*, and a builder's merchant is usually both.
10. **Invites: on or off for the trial?** `NEXT_PUBLIC_INVITES` is one variable away, the database
    work is done, and the reward is 300 extra documents each — which only means anything because the
    scan limit is real. Turning it on turns the limit into a thing people talk about.
11. **Is Settings too long?** Fifteen sections on one page, eight of them behind one Save button and
    seven saving themselves. The account, data and theme half could be its own page.
12. **Small, and cheap to fix if he wants it:** the customers/suppliers spreadsheet download leaves
    out the phone number.
