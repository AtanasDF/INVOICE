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
