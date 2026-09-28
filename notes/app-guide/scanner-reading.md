## What happens to a photograph after it is taken

`scanner-camera.md` ends the moment the shutter goes — holding the phone, the green
corners, what gets captured. This picks it up there: the photograph (or the uploaded
PDF) goes to a model, comes back as a form with amber flags on anything it was not
sure of, gets checked by a person, and becomes a row in the accounting record.
Nothing is ever saved without somebody seeing it, and every figure can be typed over.

Three things here are the ones worth an opinion. **The scan limits**, which are live
and refusing people today. **Which of the two readers runs where**, which is
inconsistent and costs real money on four paths. And **what the reader is told never
to fill in**, which is the rule the whole accuracy story rests on.

---

### Scan — `/scan`

- **What it is for.** The reading-and-checking screen. One document, or a whole
  stack: it reads each one, shows what it found, and you save it as a receipt, a bill
  or a credit note.
- **How you get there.** **+ Add → Scan it** from anywhere the add sheet appears;
  **Tools ▾ → Scan a receipt** in the header; the **Scan a receipt** tile on the
  dashboard; **Upload photos or PDFs** under it, which skips the camera; **Scan
  more** after a save. The camera opens on arrival unless you got here with files
  already picked. `/scan?engine=claude` (or `gemini`) sets the reader on that phone
  and reveals the picker from then on (`src/app/scan/page.tsx:142`).
- **What is on it**, in screen order. Most of it only appears when it has something
  to say:
  1. **A summary line** after a bulk save — *"Saved 4. 2 need a look: Booker (total
     unclear), Bidfood (possible duplicate)."*
  2. **"Document 3 of 7"**, when the batch holds more than one.
  3. **A split note** — *"IMG_0412.jpg had 3 documents — they're listed separately."*
  4. **"Needs a look: possible duplicate."** on a document Save all left behind.
  5. **How much of today's allowance is left**, in small grey type, and only when it
     is nearly gone.
  6. **The heading** — not "Scan" but what it turned out to be: **Invoice**,
     **Receipt**, **Credit note**, or for something else **Bank statement**,
     **Business card**, **Contract**, **Barcode**. Beside it **Not an invoice?**,
     which opens three pills to force the type by hand.
  7. **A how-it-works tip** the first few times (`tip:scan-how`): *"hold the phone
     over the paper. It takes the photo when the page is still, reads what's on it,
     and you check the numbers before saving."*
  8. **"Reading 3 pages…"**, then *"The document has been read — check the details
     below before saving."* And, only on a device that has ever picked one, a **Read
     with** dropdown: Claude / Gemini.
  9. **The form**, greyed out while it is still reading: supplier (a picker plus
     **Add as supplier**), document number, **Due date** on a bill, **Date**,
     **Category**, the strip of page thumbnails, **Total (incl. VAT)**, **Of which
     VAT**, **Currency** with an exchange-rate box when it is not GBP, the line
     items, **Already paid / To be paid**, notes, and for a credit note which invoice
     it credits.
  10. **Amber flags** beside individual boxes: a small pill reading **double-check
      this** (`src/components/scan/FieldFlag.tsx`) wherever the reader marked itself
      unsure.
  11. **Save receipt** (or *Save invoice* / *Save credit note* / *Save to your
      files*), with **and next** appended when more are waiting; beside it **Save all
      ready** when more than one is unsaved; then **Skip** / **Discard**.
- **What it does behind the scenes.** The pages go to `POST /api/scan` in batches
  small enough for Vercel's 4.5MB body limit (`src/lib/scanClient.ts`, 3.5M
  characters a batch — a single page bigger than that is refused outright with
  *"Export it at a lower resolution or photograph the pages instead."*). Several
  batches are stitched back into one document by `mergeScanResults`: header fields
  from the first batch that read them, line items concatenated in page order,
  **totals from the last** batch, because the grand total is on the last page. Reads
  start three at a time (`READ_CONCURRENCY = 3`), so the next document is usually
  ready by the time you have saved the one in front of you. The reading becomes form
  fields in `formFromResult` (`src/app/scan/page.tsx:198`), which never overwrites a
  box you have already typed in. Saving goes through `prepareSave`, then
  `receiptsStore.add`.
- **Where it takes you next.** `/receipts` after the last save, `/receipts/new` (type
  it in by hand), `/` on Discard, and the camera screen for another page or a retake.
- **Free, gated or not built.** Signed in only — `/api/scan` answers *"Sign in to
  scan documents."* without a token (`src/app/api/scan/route.ts:42`). **Every read
  costs Atanas money**, so this is the one page in the app with a real allowance
  attached, and the allowance is switched **on** in production. Two burst guards sit
  behind it as well, which are not the allowance and are not shown anywhere: **300 an
  hour per account** and **3,000 an hour across everybody**
  (`src/app/api/scan/route.ts:24-25`). Hitting the global one says *"Scanning is busy
  right now."*

---

### Step by step, from a taken photograph to a saved receipt

1. **The page is captured or picked.** Photos from the camera screen, files from
   **Upload a photo or PDF**, both held in memory as data URLs.
2. **The browser checks the size** and splits multi-page work into batches
   (`src/lib/scanClient.ts:14`).
3. **`POST /api/scan`** checks the sign-in, the two burst guards, that every page is
   a JPEG, PNG, WEBP, GIF or PDF under 10MB, and that there are at most 20 pages.
4. **The allowance is asked before the reader runs** (`src/app/api/scan/route.ts:110`).
   Somebody already over their limit is told straight away, rather than after a slow
   read they are not allowed to keep.
5. **The model reads it.** One call, one forced tool named `record_documents`, whose
   shape is built per request in `src/lib/scanExtraction.ts`: 29 fields per document,
   including a separate **confidence** of *high* or *low* on the supplier, the date,
   the total and the VAT.
6. **The answer is forced into shape** by `conformToSchema`
   (`src/lib/extractors.ts:90`). Model output is not strictly typed: a field can come
   back missing, as `""`, as `"£1,200"` instead of `1200`, or as a value that is not
   on the list. This walks the schema and fixes each case, so a stray answer can
   never take the scan screen down.
7. **The dates are re-read, deterministically, on the server**
   (`src/lib/documentDate.ts`). The model's own reading is discarded whenever the
   printed text parses.
8. **Only what actually came back is spent** (`src/app/api/scan/route.ts:120`). A
   read that fails, times out or returns nothing costs nobody a document — the
   comment at `src/lib/scanLimit.ts:47` puts it well: charging for our own mistake
   *"would punish exactly the awkward documents we most want people to try."*
9. **One photograph may hold several documents**, in which case it is cut up in the
   browser (`src/lib/splitDocuments.ts`) and each piece becomes its own entry in the
   walk.
10. **The form is filled**, with **double-check this** beside anything marked low
    confidence, an amber panel on a date that needs confirming, and an amber line
    where the reading found no total at all.
11. **You check it and press Save.** The duplicate check runs at that moment; a match
    stops the save and asks. Amounts are converted to GBP, a credit note's amounts
    are negated, extra pages go to `receipt_pages`, and the row lands in `receipts`.

---

### The two readers: which one, where, and what it costs

Two engines, both wired through one function (`extractStructured`,
`src/lib/extractors.ts:48`):

| | Claude | Gemini |
|---|---|---|
| Model | `claude-opus-5` | `gemini-3.5-flash-lite` |
| Median, ten benchmark documents | **7.0 s** | **4.3 s** |
| Fields right out of seven, over ten documents | **all of them** | **all of them** |
| Cost per read | much the higher | much the lower |
| How hard it thinks | adaptive, `effort: medium` | `thinking_level: low` |

The timings and scores are from `notes/engine-accuracy.md` (2026-09-26,
`harness/bench-engines.mjs`, the real keys, one document at a time). **Neither missed
a single field across twenty reads** — not one wrong total, date, VAT figure or
invoice number. So Gemini is the same accuracy, 1.6× faster and far cheaper on
documents of that kind. That file is honest about its own limit: the ten are
synthetic, generated flat, square and evenly lit. A creased till receipt photographed
at an angle on a worktop is a different problem, and how often the reader is right on
**Atanas's own paper** is still not known.

**Where each engine actually runs — this is not consistent, and both halves of the
claim put to this session are true:**

- **`/scan` defaults to Gemini.** `readEngine()` at `src/app/scan/page.tsx:143`
  returns `"gemini"` unless this device's `scan-engine` in localStorage says
  `"claude"`. A phone that once visited `/scan?engine=claude` keeps using the slow,
  dear reader for ever, until it visits `/scan?engine=gemini` once.
- **The invoice form's scan paths use Claude**, two different ways:
  - **Copy an invoice you have sent before** sends `engine: "claude"` **hard-coded**
    (`src/app/invoices/new/page.tsx:427`), even though `/api/invoice-template` would
    otherwise have defaulted to Gemini (`src/app/api/invoice-template/route.ts:80`).
    There is no picker on that screen.
  - **Scan an invoice to fill this form** sends **no engine at all**
    (`src/app/invoices/new/page.tsx:392`), and the server's own default is Claude
    (`src/app/api/scan/route.ts:63`). Claude by omission.
- **The business-card scan** sends no engine either
  (`src/app/clients/new/page.tsx:27`), and `/api/contact-scan` defaults to Claude
  (`src/app/api/contact-scan/route.ts:38`).
- **The emailed-in importer** runs whatever `extractDocuments` defaults to, which is
  Claude (`src/lib/scanExtraction.ts:369`, `src/app/api/inbox/ingest/route.ts:265`).
- **The Free page's "start from an old invoice"** has a visible **Read with** picker,
  and it starts on **Claude** (`src/components/free-invoice/FreeInvoiceBuilder.tsx:63`).
  Worth flagging: `notes/engine-accuracy.md` says Gemini is already the default "on
  `/scan` and the Free page". For the Free page that is not what the code does.

So the cheap fast reader is used on the one screen where somebody is standing there
waiting, and the expensive one on five paths where nobody chose it. Nothing is broken;
money is leaking in five places.

The **Read with** picker on `/scan` is deliberately hidden from anybody who has not
already used it (`engineChosen`, `src/app/scan/page.tsx:428`) — a Claude/Gemini
dropdown means nothing to a builder with a receipt in his hand.

---

### What the reader refuses to fill in, and why

The rule, in Atanas's own words on 2026-09-23: *"tell them honestly and add only what
is sure for."* A field the reader is not certain about is **left empty and said out
loud**, never filled with a confident-looking guess. The reason is in `CLAUDE.md`: a
wrong total or a wrong date that looks right goes into the accounting record
unchallenged, while an empty box gets looked at.

How it is actually enforced — all of it in the prompt at
`src/lib/scanExtraction.ts:291-349` and the schema above it:

- **Every important field carries its own confidence.** Supplier, date, total and VAT
  each get a separate *high / low*. The prompt ends: *"never mark something 'high'
  just to fill the field in."* A *low* shows as **double-check this** on screen and
  stops **Save all ready** dead.
- **The total is read, never calculated.** The model is asked for the grand total
  **including VAT** exactly as printed, and told explicitly not to subtract VAT
  itself and not to report a subtotal. Net is worked out by the app as total minus
  VAT. Asking a model to copy a printed number is far safer than asking it to do
  arithmetic.
- **VAT is read, never worked out — with one narrow exception.** Where no VAT figure
  is printed but a single rate is (*"incl. VAT @ 20%"*), the app does that one sum
  itself (`src/lib/vatFromRate.ts`), marks the field **low** confidence, and says
  under the box: *"VAT worked out from the 20% rate printed; the document shows no VAT
  figure."* Never done where more than one rate applies, or anything is zero-rated or
  exempt.
- **No exchange rate is ever guessed.** The model reports only which currency the
  document is in; the rate is fetched and shown for you to accept.
- **The supplier is the issuer, never the addressee.** Said three times in the prompt,
  because "bill to" is the easiest mistake on the page.
- **The customer is never guessed at all** — *"do not guess who the client or
  supplier is, that is always chosen by the person reviewing this."* A supplier is
  linked only where the form showed you the match, or the names are
  character-for-character the same; a supplier record is never created behind your
  back. Only **Add as supplier** does that.
- **Four things that look like invoices are not filed as invoices.** Added after
  scoring the reader against 106 test documents on 2026-09-24, when all four came
  back as invoices: a **pro forma** (the real VAT invoice follows, so filing both
  counts the cost twice), a **quotation or estimate** (money not yet owed and possibly
  never), a **purchase order or order confirmation** (nothing owed until the supplier
  invoices it), and a **remittance advice** (a record of a payment already made, not a
  new cost). Each is filed as *other*, with a note saying which it is.
- **Notes are for warnings, not summaries** — *"never a summary of the document"*. A
  smudged total, a handwritten alteration, or nothing.

---

### Ambiguous dates, and the misread year

Two different problems, both ending in the same amber panel.

**The printed date is parsed by code, not by the model.** The model is asked to copy
the date *character for character*, and `src/lib/documentDate.ts` parses that string
day-first, deterministically. Whenever that parse succeeds it **replaces** the model's
own reading. Where both orders are possible — `08/09/26` could be 8 September or 9
August — the alternative is carried alongside.

- On a **UK document the day comes first and there is nothing to ask**, so the
  question is only put when the document is in another currency (`askOrder`,
  `src/app/scan/page.tsx:201`) — an American supplier being the case that matters.
- Where the printed text cannot be parsed at all, the model's reading stands but is
  flagged ambiguous with its day/month swap offered — a date nobody could check is
  exactly the one a model may have read the American way.
- **A till's own clock nearly cost a year.** A receipt printing `FRI SEP 18 12:57:01
  2026` put the `12` of `12:57` exactly where a two-digit year goes, and the first
  real receipt scanned was filed in **2012**. Times are now stripped before anything
  is matched (`TIME_RE`, `src/lib/documentDate.ts:41`).

**A misread year is worse than an ambiguous date, because it parses cleanly.**
`src/lib/scanSanity.ts` exists because of two rows found in Atanas's real records on
2026-09-26, neither of them from a test:

- **GO OUTDOORS, £29.00, dated 2012-09-18, added 2026-09-22.** The year was misread.
  It parses perfectly, so nothing questioned it — and a receipt dated fourteen years
  ago falls outside every VAT quarter and every tax year, so the £29 is simply gone
  from his books.
- **Rawlings & Son, £0.00 including £0.00 VAT**, saved beside a real £8.50 from the
  same supplier on the same day. A reading that found nothing, saved as if it had.

So any date more than **two years** old, or **in the future**, now gets the same
one-tap confirmation as an ambiguous one (`misreadYear`). Two years is deliberately
generous — somebody catching up on a year of paperwork is normal and must not be
nagged — and still catches a misread year, which is usually wrong by a decade. And a
total of **£0.00 with £0.00 VAT** gets an amber line: *"Nothing was read as the total.
Put in what the document says, or it goes into your records as costing nothing."*
Said, not blocked, because a genuinely free item exists.

**What the panel looks like** (`src/components/scan/DateConfirm.tsx`): *"Read as 8
September 2026 — the document shows 08/09/26. If it meant 9 August 2026, swap."* with
**Swap** and **Confirm**. Until one is pressed **Save is blocked**, the reason being
*"Confirm the date first."* It is the only thing on the page that blocks a save
outright.

A document with **no date printed at all** is a quieter trap: the box shows today's
date, which is not what the document says, and the model's honest confidence about
what it read would be *high*. So the app overrides it to **low** on purpose
(`src/app/scan/page.tsx:237-241`), or a July receipt scanned in September would go
into the wrong VAT quarter with nothing on screen suggesting a check.

---

### Several documents in one photograph

Three receipts on a table, or a supplier PDF holding four invoices, is one read and
several documents.

The reader is told the default firmly: *"Normally they are all pages of ONE
document… Return more than one only when the pages clearly hold separate documents —
different suppliers, different invoice or receipt numbers, several receipts
photographed together, several invoices in one PDF — and never split one document's
pages apart."* Continuation sheets, terms and conditions and a remittance slip all
stay part of the same document.

For each document it returns its **page numbers** (1-based, counting every page of a
PDF) and, only where a page holds more than one, a **box** — where on that page it
sits, as `[ymin, xmin, ymax, xmax]` on a 0-1000 scale.

`src/lib/splitDocuments.ts` then cuts the capture up in the browser:

- **A photo** shared with other documents is cropped to this document's box plus 3%,
  and **the whole photo is kept after it as a second page**, so a box that is slightly
  off loses nothing.
- **A PDF** is cut to that document's own pages with `pdf-lib`.
- **A PDF that cannot be cut** goes whole to every document, each carrying a note
  saying which pages are its own.
- **The important safety net:** if any page was claimed by **no** document, the split
  is abandoned and the whole file goes to every document instead. The comment explains
  why (`src/lib/splitDocuments.ts:69-73`): on a supplier PDF holding three three-page
  invoices, a reader that lists only the page each one *starts* on (1, 4, 7) would
  leave pages 2-3, 5-6 and 8-9 — the line items, and a total carried overleaf — in no
  part at all, and three one-page receipts would be saved as the whole record of those
  invoices. *"Losing the split is cheap; losing a page of a receipt is not."*

Each piece becomes its own entry in the walk, the screen says **"Document 2 of 5"**,
and a note appears: *"IMG_0412.jpg had 3 documents — they're listed separately."*
Pages added or retaken by hand are merged back as one document. Every document found
in a split photograph **counts separately against the allowance**
(`spendScans(token, documents.length)`), which is right — three receipts read is three
receipts read — but is worth knowing before setting the numbers.

---

### The duplicate warning, and the checks that are not about duplicates

**The duplicate check** (`src/lib/duplicates.ts`) runs at the moment you press Save,
against your own saved documents, including ones saved earlier in the same run. It
compares like with like only: credit notes against credit notes, and only the same
supplier (the same linked record, or the same name once punctuation and case are
stripped). Then, in order:

1. **The same document number** — that alone is enough.
2. Otherwise, **the same gross amount to the penny, within three days**. The three-day
   window is there because the date on a re-scan is often read slightly differently.

A match blocks nothing. The save stops and shows: *"Looks like a duplicate of Bidfood,
£248.40 on 2026-09-18, number INV-44218."* — and pressing Save again goes through.
Under **Save all ready** a possible duplicate is never saved unseen; it stays in the
walk marked **possible duplicate**.

**The check is only as good as the list it checks.** If the first load of your saved
documents failed, it is loaded again at save time rather than checking nothing, and if
that fails too the save is refused with *"Couldn't load your saved documents to check
for duplicates."* (`checkedReceipts`, `src/app/scan/page.tsx:935`). A duplicate check
that silently checked an empty list would be worse than none.

**Three other quiet checks on the same screen**, none of which block a save:

- **The lines don't add up** — *"The lines add up to £212.50 but the total says £218.40
  — worth a check."* Allowed either against the gross total or against
  total-minus-VAT, with 2p of slack, since documents list lines both ways.
- **Nothing was read as the total** — the £0.00 amber line above.
- **The usual category for this supplier.** Not a warning: the category is pre-set to
  whatever you have used most often for that supplier, and labelled **Category (usual
  for this supplier)**.

---

### "Save all ready", and every condition a document must meet

With more than one unsaved document in the batch, **Save all ready** appears beside
Save. It saves, through exactly the same `prepareSave` as the Save button, every
document that needs nothing from you, and leaves the rest in the walk with the reason
written on them. It waits for reads still running first — *"Waiting for 3 to be
read…"* — then counts up, *"Saving 2 of 7…"*.

A document is saved unseen **only** if all of these hold (`lookReason`,
`src/app/scan/page.tsx:307`, then the currency and duplicate checks inside `saveAll`):

1. **It was read at all** — otherwise *couldn't be read*.
2. **It is a receipt, an invoice or a credit note.** A bank statement, business card,
   contract, barcode, or anything filed as *other* (including those four invoice
   look-alikes) is left: *not a receipt or invoice*.
3. **A total was read** — *no total read*.
4. **The total was not marked unsure** — *total unclear*.
5. **The VAT was not marked unsure** — *VAT unclear*. The comment says why this one is
   not a nicety: *"A VAT figure the model called a guess goes straight into box 4 of
   the VAT return. It earns an amber flag when he is looking at the form, so it must
   not be saved unseen either."*
6. **A date was read** — *no date read*. Today's date does not count.
7. **No date is waiting to be confirmed** — *date to confirm*. Covers both the
   ambiguous date and the suspicious year.
8. **A bill marked "to be paid" has a due date** — *no due date*.
9. **If it is not in GBP, an exchange rate could be fetched** — *in USD, no exchange
   rate*.
10. **It is not a possible duplicate** — *possible duplicate*.
11. **And the save itself worked** — *couldn't be saved*.

Two details worth knowing. A document Save all has never shown you is linked to a
supplier **only** where the name is exactly the same — nothing looser, because you are
not there to see the match. And the document currently on screen goes as its form
stands, with whatever you have typed into it.

Afterwards: *"Saved 4. 2 need a look: Booker (total unclear), Bidfood (possible
duplicate)."* If everything went, the screen becomes **All saved** — *"Nothing needs a
look."* — with **See them in Receipts** and **Scan more**.

---

### The scan limits, in full

**This is live.** The project notes said for four days that it was switched off;
`SCAN_LIMITS` is `on` in production, and reading a document has been limited for
everyone since. **There is no paid tier** — nobody can pay to lift any of it. The
`paid` plan exists as a column in the database with nothing in the app that can set
it.

**The numbers** (`web/supabase/migration-036-scan-limits.sql`, function
`scan_limits`):

| Who | A day | A month |
|---|---|---|
| A new account, **first 7 days** | **300** | no monthly limit at all |
| A free account after that | **50** | **600** |
| Plus a self-serve top-up, once a calendar month | — | **+600** |
| `plan = 'paid'` | unlimited | unlimited |

The seven days runs from the account's creation date in `auth.users`. The 300 is
explicitly there to let somebody catch up on a pile of old paper in their first week.
The month is a **calendar** month, resetting on the 1st; the day resets overnight. The
counting is done in the database with the day's row locked, so two phones scanning at
once cannot both slip past the last allowed document.

**What counts as one document:**

- One document read = one spent. **Three receipts in one photograph = three**, because
  three documents were read.
- A read that **fails, times out or returns nothing costs nothing.**
- A photograph of an **old invoice to copy** (`/api/invoice-template`) = 1.
- A photograph of a **business card** (`/api/contact-scan`) = 1.
- **Copying a document** (`/copy`), **changing a file** (`/convert`) and writing
  anything by hand cost nothing and are never counted — Settings says so.
- **Two things that cost money and count against nothing at all**, both checked:
  **emailing a document in** to the inbox importer
  (`src/app/api/inbox/ingest/route.ts` imports no part of `scanLimit.ts`), and **"Or
  describe it and it's filled in for you"** on the invoice form
  (`/api/invoice-from-text`, hard-coded to Claude at
  `src/app/api/invoice-from-text/route.ts:29`, guarded only by 60 an hour per account
  held in one server's memory, 2,000 characters a go).

**What a person sees on the way to the wall.** One line of small grey type on `/scan`,
and only when it is nearly gone (`src/components/ScansLeft.tsx`): *"7 more documents
today."* It appears at **a quarter of the day's allowance left, or ten documents,
whichever comes first** — so at 12 left of 50, or 75 left of 300. Below 50 left in the
month it adds *"38 left this month."* The reasoning is written into the file: without
it *"someone photographs a stack of receipts and is stopped at the fortieth with no
idea it was coming"*, while a counter on screen all day *"would make a generous
allowance feel like a meter running."*

The whole picture is on **Settings**, as a card called **What your account allows**
(`PlanCard`, same file, rendered at `src/app/settings/page.tsx:933`): *"Free: 50
documents a day, and 600 in a month. Copying a document, changing a file and writing
invoices by hand never count."* — with **Today 38 of 50**, **This month 214 of 600**,
and *"If you run out this month, you can ask for another 600 once, free."* A new
account reads instead: *"You are new, so you have a bigger allowance for your first
week — 300 documents a day, to catch up on a pile of old paper."*

**What the wall says.** Never an error code, and never without something that still
works (`refusalText`, `src/lib/scanLimit.ts:63`):

- **Out for the day:** *"That's 50 documents today, which is the most a free account
  can read in one day. It starts again tomorrow morning. You can still copy a document
  or write an invoice by hand."*
- **Out for the month, top-up still available:** *"That's 600 documents this month. You
  can have another 600 for this month — just ask, once."* This one is shown as a calm
  grey panel rather than a red error (`src/components/ScanLimitNotice.tsx`), with a big
  button **Give me another 600 this month** and under it *"Once a month, and it costs
  you nothing."* Press it and the panel becomes *"That's another 600 for this
  month."* plus **Read it now**, which reads the document that was just refused —
  without that button the only way to spend what had just been granted would be to
  work out for yourself that the page needed reloading. **It is self-serve**: one
  press, `claim_scan_topup` in the database, nobody asked and nothing waiting on
  Atanas.
- **Top-up already used:** *"That's the extra 600 used as well. It starts again on the
  1st."*

Three deliberate details in that panel. It is a **grey panel, not a red error**,
because a refusal is not a failure — nothing broke and nothing was lost. The top-up is
**asked for rather than granted automatically**, so the generosity is felt once rather
than never noticed. And the button is guarded by a `useRef`, not `disabled`, because
React applies `disabled` only on the render *after* the first press: two taps in one
tick both went through, and the second came back "already", telling somebody they had
used their extra 600 one beat after it was granted.

**Two soft spots, both real:**

- **A day refusal does not get the calm panel.** `topUpOffered` is true only when the
  refusal carries `topUpAvailable`, and only a *month* refusal does
  (`src/lib/scanAllowance.ts:19`, `src/lib/scanLimit.ts:31-38`). So hitting the
  **daily** 50 shows the right sentence inside the ordinary **red error box**, with a
  **Try again** button that cannot work until tomorrow.
- **A limit that cannot be read is not a limit.** If the allowance lookup fails,
  `allowScans` answers "yes" on purpose (`src/lib/scanLimit.ts:40-45`): *"the cost of
  letting a few documents through is pennies, and the cost of refusing a paying
  tradesman at a depot is the whole plan."* A count lost after a successful read is
  swallowed the same way rather than charged.

**The other limits nobody is told about**, which are burst guards rather than budgets:
300 an hour per account and 3,000 an hour across everybody on `/api/scan`; 60 and 200
on `/api/invoice-template`; 60 an hour on the describe-it box. The comment at
`src/app/api/scan/route.ts:14-22` flags the shared one as a launch risk in its own
words — twenty drivers at a depot catching up on a year of receipts in one evening
could exceed it between them and each be told *"scanning is busy right now"*, at the
exact moment a depot starts talking about the app.

---

### Two claims checked, with the lines

Both were put to this session as things another agent had reported. Both are true.

1. **"The invoice form's scan paths hard-code Claude while /scan uses Gemini."**
   `/scan` defaults to Gemini at `src/app/scan/page.tsx:143`. The invoice form's
   **copy an invoice** path hard-codes `engine: "claude"` at
   `src/app/invoices/new/page.tsx:427`; its **scan to fill this form** path at
   `src/app/invoices/new/page.tsx:392` sends no engine and gets Claude from the server
   default at `src/app/api/scan/route.ts:63`. The business-card scan
   (`src/app/clients/new/page.tsx:27` → `src/app/api/contact-scan/route.ts:38`), the
   emailed-in importer (`src/lib/scanExtraction.ts:369`) and the Free page's picker
   default (`src/components/free-invoice/FreeInvoiceBuilder.tsx:63`) are Claude too.
2. **"'Describe it and it's filled in for you' calls Claude without counting against
   the scan allowance."** The box is at `src/app/invoices/new/page.tsx:723-724`. It
   posts to `/api/invoice-from-text`, which calls `invoiceFromText(text, "claude")` at
   `src/app/api/invoice-from-text/route.ts:29` and imports nothing from
   `src/lib/scanLimit.ts` — no `allowScans`, no `spendScans`.

---

### Worth deciding

1. **Is 50 a day and 600 a month the free tier, or the whole app?** There is no paid
   tier and nothing that can switch one on, so today these numbers *are* the product.
   They were written as the free half of a plan that does not exist yet — and they are
   already live, so changing them changes something people may be relying on.
2. **Does Gemini read his real paperwork as well as Claude?** On ten synthetic
   documents they scored identically and Gemini was 1.6× faster. If that holds on his
   own post, the five Claude paths should follow `/scan` and the cost of the whole
   feature falls sharply. If it does not, `/scan` is quietly reading everybody's
   receipts with the weaker reader to save money. This is the one open question that
   several others hang off, and it needs his documents, not more synthetic ones.
3. **The two paths that cost money and count nothing** — email-in and describe-it.
   Either they join the allowance, or somebody who has hit the wall can walk round it
   by emailing the same receipt to themselves.
4. **The daily wall arrives in a red box** with a **Try again** that cannot work until
   tomorrow. The words are right; the packaging says something broke.
5. **A stale `scan-engine` on his own iPhone.** It is per device. If that phone was
   ever pointed at `?engine=claude` during the engine testing, every scan he has made
   since has gone through the slower reader — a candidate explanation for "the scanner
   is slow" that has nothing to do with the camera. One visit to `/scan?engine=gemini`
   fixes it.
6. **The global burst guard**, 3,000 an hour shared by everybody, is a launch risk the
   code itself flags. It wants a number before anyone talks about the app in a depot,
   not after.
7. **Who gets the 300-a-day week.** It runs from the account's creation date, once, and
   there is no way to grant it again — the obvious first lever if the free tier ever
   needs to feel more generous without costing more every month.
8. **Nothing about the allowance is visible until it is nearly gone.** A defensible
   choice, and also the reason somebody could plan a morning's work around an allowance
   they have never seen. Settings answers it, if they think to look.
