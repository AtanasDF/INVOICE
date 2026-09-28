## Asking suppliers to price a list — and the two newer pages

Two different things live here, and they are only in one file because they are the last
corners of the app nothing else covers.

The first is **Quotes from suppliers**: he writes a list of what he needs, sends it to up
to ten suppliers at once, each gets their own private web page to type prices into, and the
answers come back side by side with the cheapest way to buy the lot worked out — including
splitting the order between two suppliers when that genuinely wins. This is the mirror
image of `quotes.md`: there he prices a job **for** a customer, here he asks suppliers to
price a list **for** him. Same tab bar, opposite direction.

The second is **Jobs** and **Money** — two newer pages that group things he has already
got, rather than adding anything new.

---

### Quotes: From suppliers — `/quotes/requests`

- **What it is for.** Every list he has ever sent out to be priced, and where each
  supplier's answer stands. Header line: *"Ask suppliers to price a list, then compare their
  prices line by line."*
- **How you get there.** Header → **Money in ▾ → Quotes**, then the **From suppliers** tab.
  The page's `h1` is just **"Quotes"** — the two tabs (**My quotes** / **From suppliers**,
  `QuotesTabs.tsx`) are the only thing that tells you which half you are on, and both halves
  share the same heading. There is no header link straight to it.
- **What is on it**, in screen order:
  1. **"Quotes"**, a tip the first few times (`tip:quote-requests-how`): *"How it works:
     list what you need, send it to a few suppliers, and each gets their own private link to
     fill in. Their prices come back here side by side, with the cheapest way to buy the lot
     worked out for you."* Then the sub-line.
  2. Top right, **New request** (the dark primary button).
  3. The **My quotes / From suppliers** tabs.
  4. **The rows**, one card per request: the name of the request, an **Open** or **Closed**
     badge, then `4 items · asked 12 Sep · needed by 30 Sep`. Under a divider, one line per
     supplier asked: their name, their total ex VAT if they have replied, and a status badge.
     A supplier who has priced only some of the list shows the total with `(3/4)` after it in
     grey — so a cheap-looking total that is only cheap because half of it is missing says so
     on the row.
  5. **Empty state:** *"No requests yet. Make one to email your suppliers a list to price."*
- **What it does behind the scenes.** Three parallel reads on arrival — the requests, every
  supplier row, and his contacts (`src/lib/quoteRequests.ts`, `src/lib/storage.ts`) — and
  every total on the page is worked out in the browser by `supplierTotal()` in
  `src/lib/quoteCompare.ts`. The supplier's name is looked up from the contacts list and
  falls back to the word **"Supplier"** if the contact has gone.
- **Where it takes you next.** `/quotes/requests/new`, `/quotes/requests/<id>`, `/quotes`.
- **Free, gated or not built.** Behind sign-in. Free to look at — no model call, no paid API,
  no switch.

---

### New quote request — `/quotes/requests/new`

- **What it is for.** Writing the list and choosing who to ask. Sub-line: *"List what you
  need; each supplier gets their own email with a link to price it."*
- **How you get there.** **New request** on `/quotes/requests`. Nothing else links to it.
- **What is on it**, in screen order (`components/quoteRequest/RequestForm.tsx`):
  1. **← Quotes from suppliers**, the heading, the sub-line.
  2. **What it's for** — a name for the whole request, placeholder *"e.g. Kitchen extension,
     12 High St"*, 200 characters.
  3. **Items to price** — one block per line: the description (*"What you need, e.g. 4x2 C24
     treated 3.6m"*), a ✕, then **Qty**, **Unit** (*"Unit, e.g. lengths, bags, m²"*) and a
     third optional box, **Note**: *"Note (optional): brand, size, or equivalent"*. Then
     **Add item**. The ✕ is disabled on the last remaining line, so the list can never be
     emptied.
  4. **Needed by (optional)** — a date.
  5. **Deliver to (optional)** — the app's standard address block (`AddressFields`), which
     means the postcode lookup works here like everywhere else (see `settings.md`).
  6. **Notes for the suppliers (optional)** — *"Access, delivery times, anything they should
     know"*, 4,000 characters. This text is shown to every supplier on their own page.
  7. **Ask these suppliers (up to 10)** — a tick box per supplier, showing the name and
     under it their email, or, where there is none, *"No email saved: you can type their
     prices in when they reply"*. Ticking stops at ten. With no suppliers saved at all:
     *"No suppliers yet. **Add a supplier** first, with their email."*
  8. **Save request** / **Cancel**.
- **What it checks before saving.** Five refusals, each in plain words: a missing name
  (*"Give the request a name, e.g. the job it's for."*), no items, any quantity not above
  zero (*"Every item needs a quantity above 0."*), a needed-by date in the past (*"The
  needed-by date is in the past: suppliers couldn't answer."*), and no supplier ticked
  (*"Pick at least one supplier to ask."*). Blank lines are dropped silently rather than
  refused.
- **What it does behind the scenes.** Two writes, not one: the request row first, then the
  supplier rows. If the second fails the page still goes to the request, with
  `?suppliers=failed` in the address, and the request page says so and offers to add them
  there — so a half-made request is never silently left looking complete.
- **Where it takes you next.** `/quotes/requests/<id>` (always, after saving),
  `/quotes/requests`, `/clients/new?kind=supplier`.
- **Free, gated or not built.** Behind sign-in. Free. **Ten suppliers is a hard ceiling and
  it is not arbitrary**: the comparison tries every combination of suppliers when it looks
  for a split, so the cost of that search doubles with each one added (`MAX_SUPPLIERS = 10`,
  and the comment in the code says exactly that).

---

### The request itself — `/quotes/requests/<id>`

The working page of the whole area: the list as sent, every supplier's standing, the
comparison, and the order to place.

- **What it is for.** Chasing the answers and deciding who gets the order.
- **How you get there.** Any row on `/quotes/requests`, or saving a new request.
- **What is on it**, in screen order (`src/app/quotes/requests/[id]/page.tsx`, 444 lines):
  1. **← Quotes from suppliers**, the request's own title as the `h1`, an **Open**/**Closed**
     badge, and `4 items · asked 12 Sep · needed by 30 Sep`. **Edit** appears top right, but
     only while **every** supplier row is still unsent and waiting — one email out and the
     list is frozen for good (`editable`).
  2. **What you asked for** — the list, each line with its note under it and the quantity on
     the right, then **Needed by**, **Deliver to** and **Notes** underneath.
  3. **Suppliers** — one bordered block per supplier. Name, their email or *"No email
     saved"*, a badge (**Not sent** / **Waiting** / **Replied** / **Can't quote**) and, once
     they have replied, their total ex VAT with *"3 of 4 lines"* under it when they have not
     priced everything. Then one plain-English line of where it stands:
     - *"Not sent yet."*
     - *"Sent 2 days ago. Waiting for their prices."*
     - *"Priced online by Dave Hughes, yesterday."*
     - *"Read from their quote, 3 days ago."* / *"Typed in by you, 3 days ago."*
     - *"Said they can't quote (yesterday): no stock until November."* or *"Marked by you as
       can't quote (…)"*
  4. **The buttons on each supplier**, while the request is open: **Email request** (or
     **Send again** once it has gone), **Copy link**, **Enter prices** / **Change prices**,
     **Can't quote**. Under them in small type: **Their quote document** (when one was
     scanned), **See their page** (their own link with `#o`, so he sees what they see
     without counting as them), **Stop this link**, and — once they have answered — **Ask
     them again**.
  5. **Add a supplier…** — a dropdown of every saved supplier not already on the request,
     with an **Add** button, while the request is open and under ten suppliers. With none
     left: **Add a new supplier**.
  6. **The comparison** (`components/quoteRequest/Compare.tsx`) — see below.
  7. **The order lists** (`components/quoteRequest/OrderLists.tsx`), once anybody has replied.
  8. **Close request** / **Reopen request** at the bottom.
- **The three confirmations, in their own words.** *"Mark Jewson as can't quote? Their link
  stops taking prices."* · *"Stop Jewson's link? It stops working at once; send or copy the
  new one."* · *"Ask Jewson again? Their link opens for new prices; this answer is kept in
  the request's history."* · *"Close this request? Suppliers' links stop taking prices. You
  can reopen it."*
- **What it does behind the scenes.**
  - **Copying a link counts as sending it.** `copyLink` calls `markSent` first (only where
    `sent_at` is still null), so a link texted to a supplier freezes the list exactly as an
    email would.
  - **Coming back to the tab re-reads the answers** — suppliers reply while the phone is in
    a pocket. But **not while a prices form is open**, and the comment says why at length: the
    form's draft is frozen when it opens while the row it checks against is read fresh, so a
    refresh under an open form would quietly adopt a supplier's newly arrived answer as "the
    one he has seen", and saving would overwrite their prices with his without the clash ever
    showing. The answer is picked up the moment he closes the form.
  - **Every save carries the answer time the page showed** (`record_quote_request_response`
    takes `p_seen_responded_at`), so typing prices over an answer that changed in the
    meantime is refused rather than silently winning. The answer it replaces is kept in
    `previous`.
  - **The owner cannot write the answer columns directly** — migration-028 revokes it. Typed
    or scanned prices go through `record_quote_request_response`; the supplier's own through
    `submit_quote_request_response`.
  - Files: `src/lib/quoteRequests.ts` (both stores, `offerOf`, `uploadQuoteDocument`),
    `src/lib/quoteCompare.ts` (every figure), migration-028 and migration-032.
- **Where it takes you next.** `/quotes/requests`, `/clients?tab=supplier`,
  `/clients/new?kind=supplier`, `/r/<token>#o` in a new tab, and a signed URL to the
  supplier's own document (one hour).
- **Free, gated or not built.** Behind sign-in. Free to use, with two costs: **emailing a
  supplier the request** goes through Resend (`POST /api/quote-requests/send`), and
  **scanning a supplier's quote** to read their prices is a model call on Atanas's key and
  now **counts against the scan limits** — see the note at the end.

---

### Typing in or scanning a supplier's answer — the **Enter prices** screen

Not a route of its own: it replaces the request page in place
(`components/quoteRequest/AnswerEntry.tsx`).

- **What it is for.** Most suppliers will not use the link. They ring up, or email a PDF, or
  send a photo of a scribbled sheet. This is where that becomes an answer the comparison can
  use.
- **What is on it.** A price box per line with **Can't supply** beside it and a note, a
  **Delivery** box, a **Prices include VAT** tick, a **Valid until** date, and a note for the
  whole answer — the same `PriceForm` the supplier sees on their own page, so the two paths
  cannot drift. Plus the way in from their own document: a photo or a PDF, read by the
  scanner, with every matched line shown for him to confirm or change.
- **How the matching works.** `matchScannedLines` in `src/lib/quoteCompare.ts` scores each
  requested line against each line read off their quote by the words they share, with
  **sizes and codes counted half again** — *"100mm" and "3.6m" say more than a word like
  "timber"*. Best scores are paired off first, each scanned line used at most once, and
  anything under 0.2 is left unmatched. Delivery lines are spotted by their own words
  (`isDeliveryLine`: delivery, carriage, haulage, transport, shipping, postage, courier) and
  go to the delivery box, not to a line. Where a unit price was not printed,
  `scannedUnitPrice` shares the line total over the quantity. **He confirms or changes every
  match before anything is saved** — the code says so in its own comment.
- **Free, gated or not built.** Behind sign-in. Typing prices in is free. Reading their
  document costs a model call and counts against the scan limits.

---

### What the supplier gets — `/r/<43-character token>`

- **What it is for.** The one page a supplier ever sees: the list, and a form to price it
  **once**.
- **How you get there.** Only the link — emailed by the app, or copied and texted. `/r/` is
  one of the three customer-link prefixes on the public list in `src/app/AppShell.tsx`, so
  **no account is needed and nothing is asked of them**. No sign-up, no app, no password.
  Atanas's own copy is the same address with `#o` on the end.
- **What is on it** (`src/app/r/[token]/page.tsx` → `components/quoteRequest/PublicRequestView.tsx`):
  1. A small **QUOTE REQUEST** label, the request's title, and *"Sanchez Plastering Ltd
     would like your prices, Jewson."*
  2. **Needed by** and **Deliver to** where they were filled in, then the notes for the
     suppliers.
  3. **Your prices** — one row per line showing the description, the quantity and the note,
     a price box, a **Can't supply** tick, and a note of their own; then **Delivery**,
     **Prices include VAT**, **Valid until**, a note for the whole quote, and **Your name
     (optional)**.
  4. **Send prices** (black) and **We can't quote for this**.
  5. *"Prices can be sent once. To change them afterwards, contact Sanchez Plastering Ltd."*
  6. *"Sent with Invoiceover"* in small grey type. There is no link into the app.
- **Once they have sent it**, the whole form is replaced by *"Thank you: your prices have
  gone to Sanchez Plastering Ltd."*, their own answer written back out line by line in
  **their own VAT terms** — priced lines, "Can't supply", "No price", delivery, the total —
  and *"To change anything, contact …"*. Coming back to the link later says *"You sent these
  prices on 14 September 2026."* with the same summary.
- **Every other state has its own sentence**, and none of them is an error:
  - already answered, but not from this browser: *"Sanchez Plastering Ltd already has your
    prices for this. Contact them if anything has changed."*
  - closed by the owner: *"This request is closed: … isn't taking prices for it any more."*
  - past the needed-by date: *"This was needed by 30 September 2026, so the request has
    closed. Contact … if you'd still like to quote."*
  - the owner's own `#o` copy: *"This is your copy of the link. The supplier sees a form here
    to price each line."*
  - a link that has been stopped or never existed: its own page — **"This link isn't
    working"** / *"It may have been replaced by a newer one, or the sender may have stopped
    it."* / *"Ask whoever asked you for prices to send the link again. Nothing has gone wrong
    at your end."* It says nothing about whether the link ever existed, so guessing tokens
    teaches nothing.
- **Declining** asks first — *"Tell Sanchez Plastering Ltd you can't quote for this?"* — with
  an optional **Reason** box, then **Yes, we can't quote**.
- **What it refuses, in its own words.** *"Nothing is priced. If you can't supply any of it,
  tap "We can't quote for this"."*
- **What it does behind the scenes.**
  - **The read** (`src/lib/publicQuoteRequest.ts`) is done on the server with the service
    role. The page is `force-dynamic`, **noindex and no-referrer** on every `/r/` address
    found or not (`src/app/r/layout.tsx`), and it shows nothing about the sender beyond their
    business name.
  - **The answer** posts to `/api/quote-requests/respond` → `submit_quote_request_response`
    (service role only), which takes **one** answer and only while the request is open and
    not past `needed_by`.
  - **Sending twice is guarded by a ref, not a disabled button** — the same trap as the
    quote page, and the comment records what it cost: `disabled` lands a render too late, so
    two taps in one tick both post, the database refuses the second, and the page showed that
    refusal to the supplier right beside the prices that had just gone through. A send that
    **failed** is made retryable again; one that worked is not.
  - **The date it judges "expired" by is the London one** (`ukDate`), not UTC.
- **Where it takes you next.** Nowhere at all, by design.
- **Free, gated or not built.** **Completely open — no account, no sign-in, nothing to
  install.** This is the only place in the app where somebody who is not a customer of
  Atanas's does real work, and it costs nothing per use: no model call, no paid API.
