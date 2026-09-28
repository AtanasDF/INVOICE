## What happens to a photograph after it is taken

`scanner-camera.md` covers the camera itself — holding the phone, the green corners, the
shutter. This is everything after the picture exists. Written 2026-09-28 by reading the code.

---

### Reading a document — `/scan`

- **What it is for.** Turn a photographed receipt, supplier invoice or credit note into a row
  in the accounting record, with the supplier, date, total and VAT already filled in.
- **How you get there.** The big black **"Scan a receipt or bill"** button on the dashboard;
  **Scan** under Tools in the menu; the **"+ Add"** sheet; or the scan button on the receipts
  list. Also from **"Upload photos or PDFs"**, which skips the camera and hands files straight
  in.
- **What is on it.** Either the camera, or — once pictures exist — one document at a time with
  its figures in a form: supplier, date, total, of which VAT, category, invoice number, due
  date, whether it is already paid, and a picture of what was read. Underneath: **Save and
  next**, **Skip**, and when several are waiting, **Save all ready**.
- **What it does behind the scenes.**
  1. The picture (or PDF) goes to `POST /api/scan` with the signed-in person's token.
  2. `src/lib/scanExtraction.ts` asks the reader for a structured answer — 29 fields.
  3. `src/lib/splitDocuments.ts` checks whether one photograph holds more than one document,
     and if so splits it into separate entries in the walk.
  4. `src/lib/documentDate.ts` reads the printed date **day-first** (British order), server-side.
  5. `src/lib/scanSanity.ts` looks for readings that are probably wrong.
  6. Saving writes a row in `receipts`, and the picture to a private bucket.
- **Where it takes you next.** The receipts list, or the next document in the walk.
- **Free, gated or costs money.** **Signed in only, and it costs money every time** — this is
  the only part of the app whose cost grows with use. **It is also the only part that is
  rationed.** See the limits below.

---

### Which reader, and what it costs

Two are wired in (`src/lib/extractors.ts`):

| | Model | Speed (measured) | Used by |
|---|---|---|---|
| **Gemini** | `gemini-3.5-flash-lite` | **4.3 s** median | `/scan` — the default everywhere |
| **Claude** | `claude-opus-5` | **7.0 s** median | the "copy an old invoice" paths, and anyone who opts in |

Measured on 2026-09-26 over ten benchmark documents (`notes/engine-accuracy.md`): **both got
every field right on all ten** — type, supplier, date, total, VAT, invoice number, line count.
So Gemini is the same accuracy, 1.6× faster, and far cheaper.

**A picker exists but is hidden**: `/scan` only shows it on a device where `scan-engine` has
been set in localStorage. Visiting `/scan?engine=gemini` once sets it. This matters — if a
phone was left on `claude` during testing, every scan on it is the slow, dear one.

**Worth knowing for the cost conversation:** copying an old invoice asks for **Claude
explicitly**, both from the Free page (where there is a visible picker, so it is a choice) and
from `/invoices/new` line 427 (where it is hard-coded with no picker at all). That decision
dates from 19 September, before the benchmark existed. It has not been changed because the
benchmark tested reading a *receipt*, not copying an invoice's layout, so it does not prove
Claude is unnecessary here — but it is the slower, dearer engine on a path nobody can opt out
of.

**One gap in the counting:** "Describe it and it's filled in for you"
(`/api/invoice-from-text`) calls Claude and is guarded only by 60 an hour per person — it does
**not** come out of the scan allowance below.

---

### What the reader refuses to fill in

The rule, from Atanas on 2026-09-23: *"tell them honestly and add only what is sure for."*

A field the reader is not certain about is **left empty and said out loud**, never filled with
a good guess. The reasoning is that a wrong total or a wrong date that looks confident goes
into the accounting record unchallenged, while an empty box gets looked at.

In practice:
- An **ambiguous date** (03/04/2026 — March or April?) must be confirmed on screen rather than
  resolved quietly.
- A field it could not read comes back empty with a note, not filled in.
- `src/lib/scanSanity.ts` adds two checks found in Atanas's own real records: a **misread year**
  (a receipt dated 2012 that arrived last week) and a **total of zero** where both the amount
  and the VAT read as nothing.
- A **possible duplicate** — the same supplier, date and amount as something already saved,
  including documents saved earlier in the same run — is warned about before saving.

---

### Several documents in one photograph

If one picture holds two receipts side by side, the reader returns both, each with the part of
the picture it came from. `/scan` then replaces that one entry with two in the walk. Photos are
cropped to each document with a 3% margin and the whole photo kept as a second page; a PDF is
cut per document. Pages added or retaken by hand are merged back into one document.

### "Save all ready"

Saves, through exactly the same path as pressing Save on each, every remaining document that:
is read; is a receipt, invoice or credit note; has a total it is sure of; has a date; has
nothing waiting to be confirmed; is in pounds, or has a fetched exchange rate; and is not a
possible duplicate. **Anything that fails one of those stays behind with the reason shown.**

---

### The limits — the most important thing on this page

**Live in production since 23 September**, enforced, and visible to people as they use it.
The project notes said they were switched off until 27 September; they were not.

| | A day | A month |
|---|---|---|
| An account's **first 7 days** | **300** | no cap |
| **After that** | **50** | **600** |
| A `paid` account | unlimited | unlimited |

**No paid tier exists.** The database has a `plan` column, it defaults to `free`, and nothing
in the app sets it to anything else. Everyone is on the free allowance.

The generous first week is deliberate, in the migration's own words: somebody catching up on a
year of receipts should not meet a wall on their first evening.

**What a person sees** (`src/components/ScansLeft.tsx`): "Today — 12 of 50" and "This month —
233 of 600", with a line underneath: *"If you run out this month, you can ask for another 600
once, free."*

**There is a free top-up**: 600 more, once per month, granted on asking. Once used: *"You have
already had your extra 600 this month. It starts again on the 1st."*

**What the wall says** (`src/lib/scanLimit.ts`) — plain words, never an error code, and always
with what still works:

> *"That's 50 documents today, which is the most a free account can read in one day. It starts
> again tomorrow morning. You can still copy a document or write an invoice by hand."*

> *"That's 600 documents this month. You can have another 600 for this month — just ask, once."*

> *"That's the extra 600 used as well. It starts again on the 1st. You can still copy a
> document or write an invoice by hand."*

There is also a **burst guard** separate from the allowance — 60 an hour per account and 200
an hour across everybody — which exists to stop a runaway loop, not to ration anybody. The
route's own comment flags it as a launch risk: **600 an hour is shared by everyone**, so a
depot where twenty drivers catch up on a year of receipts in one evening would exceed it
between them and each be told "scanning is busy right now" — at exactly the moment a depot
starts talking about the app.

---

### Worth deciding

- **Is 50 a day and 600 a month the right free allowance?** It is already live, so this is a
  change to something people may be relying on, not a blank page.
- **Should the free top-up be automatic rather than "just ask"?** Asking means a message to
  Atanas; nobody has asked yet.
- **Should the app tell people about the generous first week?** Today it is invisible unless
  you read the code — somebody could hit 50 on day 8 and think it had always been 50.
- **Copying an old invoice always uses the slower, dearer reader, with no way to choose on
  `/invoices/new`.** Should it use Gemini like everything else, or be benchmarked properly on
  that path first?
- **"Describe it and it's filled in for you" costs money and is not counted.** Should it come
  out of the same allowance?
- **The shared 200-an-hour burst guard is a launch risk** if the app ever reaches more than a
  handful of people at once. Worth raising before, not after.
