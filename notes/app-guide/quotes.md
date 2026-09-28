## Quotes to a customer

Everything below was read out of the code on 2026-09-28, in `/Users/nasko/INVOICE/web/`. Four pages: `/quotes`, `/quotes/new`, `/quotes/<id>`, and the customer's own page `/q/<token>`. The "From suppliers" tab next to the quotes list (`/quotes/requests`) is a different thing — asking several suppliers to price a list — and is covered elsewhere.

**Shape of the whole area in one paragraph.** A quote is a priced offer. It starts as a **draft** and can be edited freely. The moment it leaves draft — sent, or marked accepted/declined straight off — it is **frozen**: lines, dates, notes and the deposit can never be changed again, and the VAT setting it was priced under is stamped onto it for good. Sending it makes a private link the customer opens and taps **Accept quote** or **Decline** on. Once accepted, **Turn into invoice** copies the lines into a draft invoice. If a deposit was set, that goes out as its own invoice first and comes off the final one.

**Quotes can never be deleted.** Not by a button, not at all: `migration-020-quotes.sql` revokes DELETE on the table from `authenticated`. There is no delete control anywhere in the area, and nothing to decide about it.

---

### Quotes — `/quotes`

- **What it is for.** The list of every quote given to a customer, with what each one is worth, whether it has been answered, and a nudge for the ones that have gone quiet.
- **How you get there.** Header → **Money in** → **Quotes** (a phone shows one **Menu** button holding the same list). Also from the dashboard's fourth-row link **Make a quote**, and by saving a quote after making one.
- **What is on it** (`src/app/quotes/page.tsx`), in screen order:
  1. Heading **"Quotes"**, under it **"Price a job before you start. Once it's accepted, turn it into an invoice in one tap."**, and the **+ Add** button on the right (`AddAnything` — Scan it, Upload a photo or PDF, Add a receipt by hand, Write an invoice, Make a quote).
  2. Two tabs: **My quotes** | **From suppliers** (`src/components/quoteRequest/QuotesTabs.tsx`).
  3. A first-few-times note (`Tip id="quotes-intro"`): *"Tip: send the quote from its page. When the customer says yes, tap **Accepted**, then **Turn into invoice**: the lines are copied, nothing to type twice."*
  4. **"Waiting on an answer"** card — *"Sent a while ago and still open. A nudge often decides it."* One row per quote that is **sent**, was dated **5 or more days ago** (`QUIET_DAYS = 5`) and has not passed its valid-until date: *"Q-0004 · Jane Customer"*, then *"£1,200.00 · sent 8 days ago · holds until 12 Oct 2026"*, then the message-writer (see below). With no customer on the quote: *"Pick who it's for on the quote to message them."*
  5. The list itself. Each row: **number · customer name** (or "No customer"), a status badge, the date; on the right the total, a grey **"£300.00 deposit"** line when there is one, and **"until 12 Oct 2026"** while the quote is still open. Empty: *"No quotes yet. Make one to price a job before you start."* A failed load says so instead, and the empty line is suppressed, so "No quotes yet" can never stand in for a broken connection.
- **The statuses**, all six (`src/lib/quoteStatus.ts`): **Draft** (grey), **Sent** (blue), **Accepted** (green), **Declined** (red), **Invoiced** (grey), **Expired** (amber). Expired is not a real status — it is what a **sent** quote is shown as once its valid-until date has passed, and such a quote can still be marked accepted by hand. Only the customer's own online Accept is blocked after that date.
- **The message-writer** on the quiet rows (`src/components/TextCustomer.tsx`): two chips, **"Any thoughts on the quote?"** and **"Here's your quote"**, a **Message** box already written (*"Hi Jane, just checking you got the quote for £1,200.00 (it holds until 12 Oct 2026) — any thoughts, or anything you'd like changed?"*), a button **"Add the link to view and accept it"**, the customer's mobile if one isn't saved, then **Text message** and **WhatsApp**. It opens the phone's own apps — nothing is sent from the app.
- **What it does behind the scenes.** One read of `quotesStore.all()`, `clientsStore.all()` and the business profile (`src/lib/storage.ts`). Sorted newest date first, then number descending. Each quote is totalled under **its own** VAT stamp (`q.vatRegistered ?? profile.vatRegistered ?? false`), so a quote sent before VAT registration keeps its old price on the list.
- **Where it takes you next.** `/quotes/<id>` (any row, any quiet row's title), `/quotes/requests` (the other tab), `/quotes/new`, `/scan`, `/receipts/new`, `/invoices/new` (the + Add sheet).
- **Free, gated or not built.** Behind sign-in. Free. No model call, no paid API, nothing switched off.

---

### New quote — `/quotes/new`

- **What it is for.** Writing the quote: who it is for, the lines, how long it holds, and whether a deposit is wanted.
- **How you get there.** **+ Add → Make a quote** from anywhere that shows the button, the dashboard tile **Write a quote**, the dashboard link **Make a quote**, or the free public builder's **Save to my quotes** (which arrives as `/quotes/new?import=1`).
- **What is on it** (`src/app/quotes/new/page.tsx` + `src/components/quote/QuoteForm.tsx`), in screen order:
  1. **"← Quotes"**, heading **"New quote"**, **"What the job will cost. It stays a draft until you send it."**
  2. When it came from the free page: *"Brought over from the Free page: check the details, then save it."*
  3. **Who it's for** (`CustomerPicker`). With nobody saved yet it opens straight on the new-customer form. Otherwise a list in two groups, **Customers** then **Suppliers** (a quote may go to a supplier), each row showing the name, the contact or email or first address line, and **Company** / **Private** on the right. A search box appears above the list once there are **7 or more** contacts. **+ New customer** adds one on the spot; once picked, the card shows the name, *"Company · VAT GB123456789"* or *"Private customer"* (plus *"· one of your suppliers"*), the contact line, and a **Change** button.
  4. Straight under the picked customer, one grey line: **"Check Acme Kitchens Ltd on the Companies House register — free, before you send your prices."** It opens that exact company when the contact was picked off the register, otherwise the search. This line is here on purpose (Atanas, 2026-09-23: *"so people can check companies before they send the quotation"*).
  5. **Quote number** (filled in as **Q-0001**, **Q-0002**…), **Date** (today), **Valid until** (date + 30 days).
  6. The lines: **Description** ("What the work or item is"), **Qty**, **Unit price** ("Price £"), and a **VAT** dropdown only when the account is VAT registered. **✕** removes a line (disabled on the last one). **Add line** under them. Under any line with words in it, **"Find it cheaper"** — see the cost note below.
  7. **Deposit to book the work (optional)**: a dropdown — **No deposit** / **% of the total** / **Fixed amount (£)** — and a number box beside it (starts at **25** for a percentage, **0** for an amount). Under it, live: *"£300.00 incl. VAT, invoiced on its own once the quote is accepted."*
  8. **Notes (printed on the quote)** — placeholder *"What's included, what isn't, start date…"*
  9. Right-aligned totals: *"Subtotal £1,000.00 · VAT £200.00"* and **"Total £1,200.00"**.
  10. **Save quote**, **Cancel**, and **Clear** on the right.
- **What it refuses, in its own words.** "Finish adding the new customer (Add customer), or cancel it, first." / "Pick who the quote is for." / "Give the quote a number." / "Add at least one line." / "A deposit percentage is between 0 and 100." / "The deposit has to be more than £0 and no more than the total." A number already used: *"Quote number "Q-0004" is already in use."*
- **What it does behind the scenes.** `quotesStore.add` inserts one row in `quotes` with `status: 'draft'`, the deposit written to **either** `deposit_percent` **or** `deposit_amount` (a database check refuses both at once, and refuses a percentage that is not between 0 and 100). The number is unique per account (`unique (user_id, number)`). Then it goes to the quote's own page.
- **Numbering is not reserved the way invoice numbers are.** `nextQuoteNumber` (`src/lib/storage.ts`) simply offers one past the highest number **matching `Q-0000` exactly**; anything typed by hand ("JOB-12") is invisible to the sequence, and two tabs open at once will both be offered the same number — the second gets the "already in use" message rather than a wrong number. There is no `assign_quote_number` function and nothing burns a number.
- **Where it takes you next.** `/quotes/<id>` on save, `/quotes` on Cancel, `/check-company` from the register line.
- **Free, gated or not built.** Behind sign-in. Free **except one button**: **"Find it cheaper"** on a line is a Gemini call on Atanas's own key every press (`POST /api/price-guide` → `src/lib/priceGuide.ts`, signed in, **120 an hour per account**, 60-second limit). Without `GEMINI_API_KEY` it answers *"Price guides aren't configured on this deployment."* Nothing shows a counter or a price, and there is no daily cap. The Companies House name lookup in the new-customer form needs `COMPANIES_HOUSE_API_KEY` (free API, set in production, **not in `web/.env.local` on this Mac** — locally those are plain boxes). The VAT-number box only does its own check-digit test: the HMRC lookup behind it needs `HMRC_CLIENT_ID`/`HMRC_CLIENT_SECRET`, which are **not set in production** (sandbox only, locally).

---

### Quote &lt;number&gt; — `/quotes/<id>`

The busiest page in the area: the quote, its status buttons, every way of sending it, the online link, and the deposit machinery.

- **What it is for.** Everything after the quote exists — send it, record the answer, raise the deposit invoice, raise the final invoice.
- **How you get there.** Any row on `/quotes`, saving a new quote, the push notification when a customer opens or answers one (which links straight here), and from an invoice made from it.
- **What is on it** (`src/app/quotes/<id>/page.tsx`, 599 lines), in screen order:
  1. **"← Quotes"**, **"Quote Q-0004"** with its status badge, **"Dated 12 September 2026"**. On the right: **Edit** (drafts only) and **Print** — and note **Print only appears once the quote is past sending**, i.e. declined or invoiced. While it is draft/sent/accepted, printing lives in the Send card's PDF tab instead.
  2. A first-few-times note: *"How it works: send it, and the customer gets a link they can accept or decline. Once accepted, "Turn into invoice" copies the lines across — a deposit goes out as its own invoice first, and comes off the final one."*
  3. **The "For" card**: the customer's name, *"Company · VAT …"* / *"Private customer"*, the contact line, then three figures — **Total** (labelled *"Total incl. VAT"* when registered), **Deposit** (the amount and *(25%)*, or **"None"**), **Valid until** (or **"No end date"**).
  4. **The status card.** If the customer answered online, a line first: *"Accepted online by Jane Smith, 14 Sept 2026, 09:12."* Then one sentence for the state:
     - draft — *"Not sent yet. Send it below, or mark it sent if you gave it to them another way."*
     - sent — *"Waiting on the customer. When they say yes, mark it accepted."*
     - accepted, deposit still to raise — *"Accepted. Invoice the £300.00 deposit to book the work, or turn the whole quote into an invoice."*
     - accepted, deposit already invoiced — *"Accepted, deposit invoiced. Invoice the balance when the work is done."*
     - accepted, no deposit — *"Accepted. Turn it into an invoice when you're ready to bill."*
     - declined — *"Declined. Reopen it if they change their mind."*, or with an unpaid deposit invoice *"Declined. The deposit invoice INV-1001 is still open and will keep being chased: credit it on its page if it won't be paid."*
     - invoiced — *"Turned into an invoice."* + **Open the invoice**.
  5. **The buttons**, which depend entirely on the status:
     - **draft**: Mark as sent · Accepted · Declined · Turn into invoice (Edit is in the header)
     - **sent**: **Accepted** (black) · Declined · Turn into invoice
     - **accepted**: **Invoice the deposit** (black, only while a deposit is set and unraised) · **Turn into invoice** / **Invoice the balance** · Not accepted after all
     - **declined**: Reopen
     - **invoiced with no invoice found**: *"This quote was being turned into an invoice, but no invoice from it can be found."* + **Put it back to accepted**
  6. **The amber VAT warning**, when the quote's stamp and today's setting disagree: *"This quote was sent while you were not VAT registered. An invoice raised from it now is issued under today's setting, so it will add VAT to the quoted figures — check the draft before sending it."*
  7. **The Send card** (only while draft, sent or accepted — `src/components/quote/QuoteSendCard.tsx`). Heading **Send**, under it *"£1,200.00 · Q-0004, valid until 12 October 2026"*, then four tabs: **Email | Text | WhatsApp | PDF**. It opens on Text when the customer has a mobile but no email.
     - **Email**: *"Send to"*, a message box, a copy-to-yourself tick, and the note that the quote *"goes as a PDF."* The PDF is made in the browser and the private link is put in the email.
     - **Text / WhatsApp**: the same message-writer as the list, with **"Add the link to view and accept it"**, ending in **Open in Messages** or **Open in WhatsApp**.
     - **PDF**: *"The quote as a PDF, to send from any app, keep or print."* → **Share (WhatsApp, Messages…)**, **Download PDF**, **Save as**, **Print**. **Save as** gives all seven shapes: PDF, Picture (.png), Smaller picture (.jpg), Word (.doc), Web page (.html), Plain text (.txt), Spreadsheet (.csv).
  8. **"View and accept online"**, inside the Send card (or on its own once the quote is past sending, if a link was ever made). Before there is a link: *"A private link where your customer can see the quote and accept or decline it. You'll see when they open it and get a notification when they answer. Emails include it, and a text or WhatsApp can."* + **Make and copy the link**. After: *"Not opened yet."* or *"Opened 3 times: first 13 Sept 2026, 18:04, last 14 Sept 2026, 09:11."*, the link in a read-only box, **Copy link**, **Open** (which appends `#o`, the owner's own copy), and **Stop this link and make a new one**.
  9. The quote sheet itself at the bottom (`src/components/quote/QuoteDocument.tsx`) — the business name, logo and address, VAT number, **Quote &lt;number&gt;**, date, valid-until, the **For** block, the line table, subtotal and VAT per rate, the big **Total:** box with *"Deposit to book the work: £300.00 (25%)"* and *"This quote is valid until 12 October 2026."* under it, then the notes. This is exactly what the PDF, the print-out and the customer's page show.
- **What it does behind the scenes.**
  - **Sending is what freezes a quote.** `quotesStore.setStatus` / `markSent` stamp `quotes.vat_registered` from the account's current setting the moment the quote leaves draft (migration-033), and a failed read of that setting **fails the send** rather than guessing. `updateDraft` is keyed on `.eq("status","draft")`, so an edit that arrives late is refused: *"This quote isn't a draft any more, so it can't be changed. Reload to see it."*
  - **Every status change carries the status the page was showing** (`setStatus(id, status, from)`), so an answer the customer gave online in the meantime is never overwritten unseen — it says *"This quote has changed since the page loaded (the customer may have answered online). Reload to see it."*
  - **Sharing the link sends the quote.** Copying it, or adding it to a text, marks a draft **sent** first, after a confirm: *"Sharing the link sends the quote: it's marked as sent and can't be edited after. Carry on?"* Emailing does it the other way round — only after the send actually worked — so a failed email does not lock the draft. A draft's link is never put in share-sheet text, because the customer's page shows a draft nothing at all.
  - **Turning into an invoice claims the quote first** (status → `invoiced`, `invoice_id` still null), so a second tap or a second tab cannot make two invoices; the invoice is then built from the **claimed row**, not from what a possibly stale page shows, and linked. If the insert seems to have failed it looks for an invoice tagged `from Q-0004` before releasing the claim, because a lost reply can hide an invoice that was actually made. The new invoice is a **draft**: the quote's lines, the quote's notes, a due date of today plus the customer's own payment terms (or 30 days), and the tag `from Q-0004`. The page then goes to `/invoices/<id>`.
  - **A lost link repairs itself**: an invoiced quote with no `invoice_id` re-finds its invoice by that tag on the next page load and relinks it.
  - **Coming back to the tab re-reads the quote** (focus and visibility change), so an old copy cannot be sent or invoiced from a phone left open.
  - Files: `src/lib/storage.ts` (`quotesStore`, `quoteLinksStore`), `src/lib/quoteDeposit.ts`, `src/lib/quoteStatus.ts`, `src/components/quote/*`, `src/components/SendInvoicePanel.tsx` (the email form and share buttons are shared with invoices), migrations 020, 022, 026, 033, 034, 035, 041.
- **Where it takes you next.** `/quotes`, `/invoices/<id>` (the final invoice, the deposit invoice), `/q/<token>` (via **Open**), the phone's Messages/WhatsApp, `/login?next=/quotes/<id>` if the session has gone.
- **Free, gated or not built.** Behind sign-in. Free to use. Two things cost money when used: **emailing** the quote (`POST /api/send-invoice` — signed in, Resend, **30 an hour and 100 a day per account**, 60 an hour across everyone, PDF capped at 4 MB of base64; `RESEND_API_KEY` is set in production, **not on this Mac**), and **"Find it cheaper"** while editing a draft. Push notifications for "opened" and "answered" need the VAPID keys, which are set in production. Nothing in this area is behind an off switch — it is all live.

---

### What the customer sees — `/q/<43-character token>`

- **What it is for.** The one page a customer ever sees: the quote, a PDF to keep, and **Accept quote** / **Decline**.
- **How you get there.** Only the link — emailed, texted, WhatsApp'd, or pasted. `/q/` is one of three customer-link prefixes on the public list in `src/app/AppShell.tsx`, so **no account is needed**. The owner's own copy is the same address with `#o` on the end.
- **What is on it** (`src/app/q/[token]/page.tsx` → `src/components/quote/PublicQuoteView.tsx`), in screen order:
  1. **One card at the top**, which is the whole point of the page, and is a single announced region so a screen reader hears each outcome:
     - not answered yet: *"Sanchez Plastering Ltd sent you this quote for £1,200.00, valid until 12 October 2026."* then **Accept quote** (black) and **Decline**.
     - after tapping either: *"Accept quote Q-0004 for £1,200.00?"* or *"Decline quote Q-0004?"*, a **Your name** box (*"e.g. Jane Smith"*, 120 characters), then **Yes, accept the quote** / **Yes, decline it** and **Back**.
     - answered: *"You accepted this quote on 14 September 2026. Sanchez Plastering Ltd has been told and will be in touch."* or *"You declined this quote. … has been told."*
     - already settled by the owner: *"This quote has been accepted."* / *"This quote was declined."*
     - past its date: *"This quote was valid until 12 October 2026. Please contact Sanchez Plastering Ltd for an up-to-date one."* — and no buttons.
     - the owner's `#o` copy: *"This is your copy of the link. Your customer sees Accept and Decline buttons here."*
  2. **Download PDF**, **Save as** (the same seven shapes), **Print**.
  3. The quote sheet, identical to the owner's.
  4. *"Sent with Invoiceover"* in small grey type.
- **A link that no longer works** shows its own page (`not-found.tsx`): **"This link isn't working"** / *"It may have been replaced by a newer one, or the sender may have stopped it."* / *"Ask whoever sent you the quote to send the link again. Nothing has gone wrong at your end."* It says nothing about whether the link ever existed, so guessing tokens teaches nothing.
- **What it does behind the scenes.**
  - **The read** (`src/lib/publicQuote.ts`) uses the service role on the server, and **every single query is scoped to the link's owner**. A token must be exactly 43 characters of `A-Za-z0-9_-`. A **draft** quote returns nothing, so the page 404s. Ids are blanked before anything reaches the customer's browser, and only the fields the PDF shows are read.
  - **The price is the quote's own stamp, never today's setting** — *"a customer holding a link must never see the total change under them, least of all on the button they tap to accept."*
  - **noindex and no-referrer** on every `/q/` page, found or not (`src/app/q/layout.tsx`).
  - **Opens are counted** by the page's own script (`POST /api/quote-links/seen` → `record_quote_link_view`, service role only), never for `#o` and never from a browser that has a Supabase session in localStorage. Limits: 30 per address per half hour, and one per token-and-address per half hour. The **first** open pushes the owner: *"Quote opened — Jane Customer opened quote Q-0004."*
  - **The answer** goes to `POST /api/quote-links/respond` → `respond_to_quote_link` (service role only, 10 tries an hour per address). The typed name is stripped to printable characters on one line, 120 max. The database function changes the quote **only** while it is `status = 'sent'` and `valid_until` is null or **on or after the London date** (`public.uk_today()`, migration-041 — before that, Postgres's UTC date meant a quote could be accepted for an hour after the customer's own page had already said it had expired). Anything else answers: *"This quote can't be answered any more: it may have been answered already, withdrawn or expired. Please contact the sender."* A success pushes the owner: *"Quote accepted — Jane Smith accepted quote Q-0004."*
  - **Answering twice is guarded by a ref, not a disabled button** — `disabled` lands a render too late, and the second post used to show the customer a refusal ("contact the sender") right beside the acceptance they had just made.
  - **The owner can let them answer again**: putting an accepted or declined quote back to **sent** (Reopen / Not accepted after all) makes the buttons live again, because an answer only counts while the quote still stands on it.
- **Where it takes you next.** Nowhere. There is no link into the app, no sign-up prompt, no navigation — by design.
- **Free, gated or not built.** **Public, no account, free.** No model call, no paid API. The only costs behind it are the push notification to the owner and the database read.

---

### Deposits, in full

This is the one place in the app where one sum is split into two documents, and it is worth reading whole.

**Setting one.** The deposit is part of the quote, set in the quote form, and **only while the quote is a draft** — the Edit button disappears the moment it is sent, and `updateDraft` refuses anything that is not a draft. There is no way to add, change or remove a deposit on a sent quote. Two shapes:

- **% of the total** — must be **more than 0 and less than 100**. Both the form and a database check enforce it, so **100% cannot be set through the app** even though the maths handles it.
- **Fixed amount (£)** — more than £0 and no more than the total, **gross, including VAT**.

Stored as `quotes.deposit_percent` (5,2) or `quotes.deposit_amount` (12,2), never both (migration-022). The figure shown everywhere is `depositGross()` in `src/lib/quoteDeposit.ts`: the quote's gross total, times the percentage if that is the shape, clamped to between £0 and the whole quote, rounded to the penny.

**Raising it.** Once the quote is **accepted**, **Invoice the deposit** appears as the black button. It claims the deposit first (`deposit_claimed = true`, so a double tap or a second tab cannot make two), then creates a **draft invoice**:

- lines from `depositLines()` — see below
- notes: *"Deposit to book the work quoted in Q-0004. The balance will be invoiced when the work is done."*
- due **7 days** from today, payment terms *"7 days"*
- tagged `deposit for Q-0004`
- status **draft** — it still has to be sent like any other invoice, which is when it takes a real invoice number

Then it opens that invoice. If the insert fails it looks for the tag before releasing the claim; if the invoice truly went missing the quote page offers **"Let me invoice the deposit again"** behind a confirm.

**What the deposit invoice charges.** Not VAT registered, or a quote with no rates: **one line**, *"Deposit (25%) for quote Q-0004"*, at the gross figure. VAT registered: **one line per VAT rate present in the quote**, each at that rate's share of the gross (*"Deposit (25%) for quote Q-0004, Standard 20% part"* when there is more than one), priced to **whole pence net**. So the deposit invoice carries VAT in the same proportions as the quote — a quote that is half standard-rate and half zero-rate produces a deposit whose VAT is the right share, not 20% of the lot.

**What comes off the final invoice.** **Invoice the balance** builds the final draft invoice as **the quote's own lines, plus the deposit invoice's lines put back negated** — quantity **-1**, the same unit price, the same VAT rate, the same labour/materials marking, described as *"Less deposit (invoice INV-1001)"*. It takes off **exactly what the deposit invoice charged**, read back off that invoice, not recomputed — so the two documents agree whatever the deposit invoice ended up saying. Three refusals before it will do it:

- deposit claimed but no deposit invoice found → *"The deposit invoice can't be found: it may still be being made, or it was removed. Reload the page to see which."*
- deposit invoice still a draft → *"The deposit invoice is still a draft. Send it first, so the final invoice can take it off."*
- deposit worth more than the whole quote → *"The deposit invoice is for more than the whole quote, so the balance would be negative. Check the deposit invoice."*

**Credit notes against the deposit.** If some of the deposit invoice was credited, the deduction lines **shrink in proportion** and the description becomes *"Less deposit (invoice INV-1001, less its credit)"*. A deposit credited **in full** takes nothing off at all, so the balance invoice is the whole quote again.

**The deposit invoice cannot be deleted once a balance invoice exists.** A trigger (migrations 034 and 035) refuses it — *"The balance invoice for this quote takes this deposit off, so the deposit invoice can't be removed."* — and it also counts a balance invoice that is only findable by its `from Q-0004` tag, because the invoice is created first and linked second. Without that guard, deleting the deposit invoice silently cleared the link and left the "Less deposit" line on the balance invoice: a £1,200 job invoiced as £360 + £840 would have become £840 asked for in total, with the £360 in no invoice, no turnover and no VAT return, while the customer still held the emailed deposit invoice.

**Backing out with a deposit still open** is confirmed, because the deposit invoice outlives the deal and its payment reminders keep going: *"The deposit invoice INV-1001 is still open, and its payment reminders will keep going until it's paid or credited. Carry on? You can add a credit note on the invoice's page."*

**The two pence, and why it is not a bug.** The deposit and the balance can each miss the quote by up to **two pence**. VAT is rounded once per rate on every document, and the deposit invoice and the final invoice are **two documents**, each a real VAT invoice, so each rounds on its own. How little was measured rather than assumed: **a million generated quotes, four seeds, one to four VAT rates, totals up to £98,000 — the worst gap is 2p, and it does not grow with the money or with the number of rates.** That flatness is the actual test (`harness/test-money-invariants.mjs`, `MAX_SPLIT_PENCE = 2`): rounding is bounded, so a real error in the split would scale with the job and a £50,000 quote would be out by pounds. Nothing on screen mentions the two pence to the customer.

---

### Two things worth knowing that do not fit above

- **Scanning is limited; quotes are not affected.** `SCAN_LIMITS` is **on** in production, so reading a document is capped for every account today — 300 a day for an account's first seven days, then 50 a day and 600 a month, with nobody on a paid plan and no paid tier in existence. **Nothing in the quotes area to a customer spends a scan.** Writing, sending, accepting and invoicing a quote read no document. (The neighbouring **From suppliers** tab does scan supplier replies, and those do count.)
- **The help chat's own description of `/jobs` claims quotes are grouped there, and they are not.** `src/lib/helpFacts.ts` says *"Work grouped by job, so a customer's invoices, quotes and costs for one piece of work are together"*, but `src/app/jobs/page.tsx` reads invoices, receipts, credit notes and payments only — `quotesStore` is never called there. So a quote does not appear on the job it belongs to. Worth knowing because the help chat would tell somebody it does. (`NEXT_PUBLIC_HELP_CHAT` is off, so nothing is saying it out loud yet.)

---

### Worth deciding

1. **Should quotes ever be part of a paid tier, and which half?** Writing and sending a quote costs almost nothing to run. What costs money is **emailing** it (Resend) and **"Find it cheaper"** (a Gemini call per press, 120 an hour per account, no daily cap, no counter). If a free tier ever has to be drawn, those two are the only paid moments in the whole area — the quote itself, the private link, the customer's page and the PDF are all free forever. Should "Find it cheaper" get a visible allowance the way scanning has one?
2. **Should a sent quote be editable at all?** Today it is frozen absolutely: a typo in a line, a wrong date, a deposit set at 25% when 20% was meant — none of it can be changed, and there is no "revise this quote" or "make version 2". The only route is a brand new quote with a new number. Is that right, or should there be a **"Send a revised quote"** that copies the lines into a fresh draft and marks the old one superseded?
3. **Should a deposit be allowed to be 100%?** The maths handles it and the database refuses it (percent must be under 100). Paid-in-advance jobs exist. A fixed amount equal to the total is allowed, which is the same thing by another door — so the rule is inconsistent rather than principled.
4. **Should the customer be able to pay from their own quote page?** There is a comment in the code marking the exact spot for it: *"Payment options (taking the deposit or the total from the customer's link) belong beside sending, once there's a payment provider."* Accepting a quote and paying its deposit in the same tap is the single biggest thing this area does not do. It needs a payment provider, which is a money decision, not a design one.
5. **Should an expired quote still be acceptable by the owner?** A sent quote past its valid-until date shows as **Expired** in amber, and the **customer** is refused online — but the owner can still tap **Accepted** and invoice it. That is probably right (the phone call happened), but it means "Expired" means two different things depending on who is looking.
6. **Does the quiet-quote nudge belong at five days, and should it chase by itself?** "Waiting on an answer" appears after **5 days** and writes the message, but a person still has to tap Messages or WhatsApp. Invoices have an automatic reminder cron; quotes have nothing. Should a quote chase itself the way an invoice does?
7. **Should quote numbers be reserved like invoice numbers?** They are not: `Q-0001` is only a suggestion, two tabs get offered the same one, and a hand-typed number is invisible to the sequence. That is deliberately loose because a quote number is not an accounting record — worth confirming it should stay loose.
8. **Should a quote show on the job it belongs to?** See the mismatch above. `/jobs` groups invoices, receipts and payments; quotes are left out entirely, which is arguably the wrong half of the story for a job that has not been invoiced yet.
