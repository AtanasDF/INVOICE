# The file library, as Atanas described it (2026-09-24)

His words, taken down before anything is built. **More is coming** — he said so at the end
— so this is the first part of a longer brief and is not complete.

## The shape

Top to bottom:

1. **A title: "Your file library"** (or "File library"). **Tapping the title opens the whole
   library** — the full page, not the strip.
2. **Under the title, a date roller.** The kind you roll with a thumb and the numbers
   change. Three of them: **year, month, day**. You can stay at the level you want:
   - year on its own — scroll through a whole year
   - then narrow to a **month**
   - then to an exact **day**, and every document from that day shows in the strip.
3. **Beside the days, a button for a period of your own** — from one date to another —
   which then shows everything in that stretch.
4. **Under that, the photographs themselves**, in a rectangle that slides sideways.
   About **five on screen at once**, and you slide through the rest.
   He corrected himself on the size: make the rectangle **a bit bigger**, so the pictures
   are big enough to actually recognise at a glance.
5. **Tapping one photograph opens that photograph** on its own.

## The whole library

The full page reached from the title carries **the same options** — the date roller, the
custom period, and "all".

## What is not settled yet (named, not guessed)

- **Where the strip lives.** The title opening "the whole library" implies the strip is a
  section somewhere else — the dashboard is the obvious place, since that is the page he
  keeps coming back to. To confirm with him rather than assume.
- Whether the strip shows **only receipt photographs**, or invoices and quotes too. He said
  "all the invoices from that day", and also "your pictures", so possibly both.
- What the roller does on a **laptop**, where there is no thumb. It still has to work.
- Whether a day with nothing in it should be **skippable** on the roller, or roll past
  empty days like a real one.

## Why this is worth building

The file library today is a plain grid behind a filter panel nobody opens. What he is
describing is how people actually look for a receipt: *roughly when* it was, then scan
pictures until they recognise it. Dates first, pictures big, no typing.

---

# The upload tile, as he described it (2026-09-24)

*"the upload document rectangular looks beautiful, and I want it as big as it is, but it
should give you three buttons... so you don't have to click three times."*

Keep the tile exactly the size it is. Put **three buttons inside it** that go straight to
the source, instead of one button that opens a chooser that then asks again.

He floated: files, photos, an external link, "free text", and asked for better ideas.

## Recommended three

1. **Photos** — `accept="image/*"`, straight into the camera roll. The commonest case on a
   phone by a long way.
2. **Files** — the OS file picker, which is already iCloud Drive, Google Drive, Dropbox,
   Downloads and everything else in one. No need for a button each.
3. **Email it in** — **already built and currently invisible.** Every account has its own
   private import address (`business_profile.inbox_token` → `inboxAddress`), the Cloudflare
   Worker receives it and `/api/inbox/ingest` files it for review. Today it is buried in
   Settings, where nobody will ever find it.

That third one is the strong one, and it is the case his users actually have: a supplier
**emails** them a PDF invoice. On a phone, getting that PDF out of Mail and into an app is
genuinely painful — forwarding it is one tap. It costs nothing to surface because it is
finished.

## Argued against, with the reason

- **An external link / URL.** Rare — tradespeople are sent attachments, not links — and it
  means the server fetching a URL somebody typed, which is a request-forgery hole unless it
  is carefully fenced. Not worth the risk for a case that barely happens.
- **"Free text"** — typing it in by hand already exists in two places ("Type it in" on the
  invoice, "Add a receipt by hand"). A third door to the same room is what the Add sheet
  was removed from the dashboard for.

## Worth considering later, not now

- **Paste** (⌘V a screenshot or PDF) — good on a laptop, meaningless on a phone.
- **Scan** — there is already a big scan button directly above; a fourth route would repeat it.

---

# His answers, and what I recommend (2026-09-24, part two)

## The four open questions, answered

1. **Where the strip lives** — *"close to upload document, so it looks nice. Upload
   document and then you see your documents."* So: on the dashboard, directly under the
   upload tile. Upload, then see what you have uploaded. Settled.
2. **What it shows** — *"you should be able to switch from invoices and quotes to
   receipts... maybe a little buttons on top."* Settled: a switch, and he asked for a
   suggestion on its shape (below).
3. **The roller on a laptop** — *"should just switch from the sections smoothly rather than
   swiping it."* So the roller is not a touch-only control: on a laptop it moves between
   year / month / day by click and by arrow key, with the same easing. Settled.
4. **Empty days** — *"do whatever you think is best... look better, easier and fancier."*
   **Recommendation: roll past every day, like a real dial, but mark the ones that have
   something.** A dial that skips is disorienting — you lose the sense of where you are in
   the month — and it makes "nothing on the 4th" impossible to see, which is itself an
   answer somebody may be looking for. A small dot under the days that have documents gives
   the skipping benefit without the lying.

## The switch between receipts and invoices — recommended shape

A **segmented control** of two or three, sitting between the title and the roller:
`Receipts · Invoices · Quotes` — or `Receipts · Invoices & quotes` if three is a crowd on a
phone. Same shape as the dashboard's three panels, so it is a control he has already
learnt, and it reads left to right in the order people look for things. Not a dropdown: a
dropdown hides the options and costs a tap to find out what they are.

## The upload tile, settled

- **Photos · Files · Email it in.** Three buttons, as asked.
- **"Email it in"** — he likes it and says he does not fully understand it yet. Worth being
  plain in the UI, then: it is *his own private email address*; anything sent or forwarded
  to it lands in Needs review. The screen has to say that in one line, because he is the
  friendliest possible reader and it did not land.
- **A link / URL — dropped**, agreed. Server-side fetching of a typed URL is a
  request-forgery hole for a case that barely happens.

## Paste, drag and drop — his asks, and the honest answer

He asked for: paste, screenshots, and dragging photos onto the app — *"on iPhone you can
drag photos and put them on the file. That should work. Maybe on Samsung as well. That
should work on every phone."*

**Recommendation: build both, and add no buttons.** Paste and drag are *ways in*, not
choices to be offered — the whole tile becomes a drop zone, and the page listens for a
paste. His "three buttons" stays exactly three, and two more routes appear for free. One
quiet line under the buttons says so.

Honest about where each actually works:

| | Works | Does not |
|---|---|---|
| **Paste (⌘V / Ctrl+V)** | Every desktop browser: screenshots, copied images, PDFs | A phone keyboard has no paste onto a page; on iOS it needs a tap and a permission prompt |
| **Drag and drop** | Every desktop browser. iPad, properly | **iPhone Safari is unreliable** — the OS supports app-to-app dragging, the browser rarely receives it |

So **"that should work on every phone" cannot be promised**, and I would rather say so now
than have him find it on his own phone. What *does* work on every phone is the Photos
button, which is one tap, and email-it-in, which is one share.

**Screenshots** are the real win in his reasoning: *"if you cannot download it, you can copy
it from the website and paste it there. Or you can screenshot it."* A screenshot then goes
in through Photos on a phone and through paste on a laptop. Both covered.

## Free text — recommended: not now, and the reason

He talked himself round it and ended *"I don't know. Is it a good idea?"*

**No — and screenshots are why.** The case he described is a receipt on a website he cannot
download. A screenshot of it is *better evidence* than its text: it keeps the layout, the
totals and the supplier's name where HMRC expects them, and it goes through the reader we
already have. Pasted text throws that away and needs a second, text-only reading path to
maintain.

There is already a text route where text is genuinely the input — `/api/invoice-from-text`,
which writes an invoice from a description. That is a different job.

Worth revisiting if people actually ask for it. Not worth a fourth door now — which is what
the Add sheet was taken off the dashboard for this morning.

---

# "My files" — everything saved, as files (2026-09-24, part three)

Atanas: *"You need to be able to see your files in another way, not just the photos... Since
the photos will disappear, we're going to have all the data and the information, but they
need to be turned into files."*

## The idea underneath it, which is the good one

The ageing job emails a photograph away and clears it; **the record always stays** — the
supplier, the date, the amount, the VAT, the category. What he has spotted is that a record
with no photograph currently has **no file at all**, and that is the thing that makes
ageing feel like a loss.

So: **anything in the records can be handed over as a file, whether or not its photograph
still exists.** A receipt whose picture has gone becomes a one-page PDF carrying everything
the record holds, made on demand. Nothing is ever "gone" — at worst it changes shape, from
a photograph of a receipt to a statement of what that receipt said.

That closes the last gap in the ageing design, and it is worth building for that reason
alone.

## The shape he described

- A **"My files"** rectangle. **Decent size, not too big** — his words, and the contrast
  with the photo strip is deliberate.
- **Switch through the months from the rectangle itself.**
- **Tapping it opens the full view**, where everything can be narrowed: a **day**, a
  **week**, a **month**, a **year**, a **period of his own**, or **one supplier or client**.

## What counts as a file

| | Where it comes from |
|---|---|
| Receipt photographs and PDFs | the private `receipts` bucket, as today |
| Invoices, quotes, credit notes | made from the record, as the PDF already is |
| **A receipt whose photograph has gone** | **made from the record on demand** — the new part |
| The pages of a multi-page scan | `receipt_pages` |

Made **on demand, not stored**: it costs nothing to keep, it is always current if the
record is corrected, and it cannot drift from the record it describes.

## Named, not guessed

- **Two rectangles doing similar jobs is the risk here.** This morning the Add sheet was
  taken off the dashboard precisely because it repeated the four buttons above it. A photo
  strip and a files strip, one above the other, could be the same mistake wearing a
  different hat. Worth deciding with him: **one rectangle with a switch** (Photos | Files),
  or genuinely two. My instinct is one rectangle, because the switch he already asked for
  (Receipts · Invoices · Quotes) is the same kind of control and people will look for both
  in the same place — but it is his call and I would rather ask than assume.
- **"Files from this month" implies wanting them all at once.** A single zip is the obvious
  answer and a real piece of work — worth confirming that is what he means before building
  a one-at-a-time list.
- **By supplier or client** means the filter needs the contact list too, not just dates.

---

# Settled: one rectangle, with a switch (2026-09-24)

*"do one rectangular with the switch photos and files. That would be nicer. Just make it...
it's going to be bigger... Open your files and it's gonna open like a little library as
well that you'll be able to scroll through the files and choose one."*

So, decided:

- **One rectangle**, not two. It sits under the upload tile.
- **A switch across the top: Photos | Files.** Same control as the Receipts · Invoices ·
  Quotes switch, so there is one kind of switch in the app, not two.
- **Bigger than the tiles around it**, as he asked twice — the pictures have to be big
  enough to recognise at a glance, which is the whole point of looking at pictures.
- **Tapping the title opens the full library**, which scrolls, and carries the same date
  roller, the same custom period, and "all".

That also avoids the mistake removed from the dashboard this morning: two rectangles doing
similar jobs, one above the other.

---

# Downloading a period (2026-09-24, his answer)

*"you should be able to download everything from the period... as a zip, as pictures, as
one PDF... or you should also be able to combine them by suppliers — if you're downloading
files for a whole month from different suppliers you should be able to separate them into
different PDFs, including all the files from that supplier."*

So picking a month or a period and downloading it gives a choice of **four shapes**:

| Shape | What arrives |
|---|---|
| **A zip** | every file as it is, original photographs and PDFs |
| **Pictures** | every page as an image |
| **One PDF** | the lot, in date order, one page per document page |
| **A PDF per supplier** | one file per supplier, holding everything from that supplier in the period |

The last one is his idea and it is the best of the four: it is how an accountant actually
wants a month handed over, and how anybody checks one supplier's charges against each
other. Nobody in the twelve apps researched does it.

**Most of the machinery exists.** `src/lib/documentPdf.ts` already builds one PDF from
pages and copies a PDF's own pages in; `src/lib/convert.ts` already turns images and PDFs
into each other; `src/lib/saveFile.ts` is already the single place a file reaches the
device. The new parts are the zip, the grouping by supplier, and the choice of shape.

**Where it runs matters.** A month of photographs is tens of megabytes, and doing that in
the browser on a phone will fail on the one it needs to work on. This is the first thing
in the app that genuinely belongs on the server — and the receipts bucket is already there
with the service role. To be built server-side, streamed, and with a plain word when a
period is too big to hand over in one go.
