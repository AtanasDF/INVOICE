## The tools beside the scanner — Copy a document, Change a file, Files

Three pages that have nothing to do with invoicing and nothing to do with the AI reader.
They exist because Atanas asked for them (2026-09-22: *"another scanner button which is going
to scan files, no matter what files"*, and *"every file needs to be able to be turned into
every other file so the app works as a file transformer too"*). The scanner reads a document
and puts figures into the accounting record; these three just move paper and files about.

**The one thing to hold on to before reading any of it:** `/copy` and `/convert` cost nothing
to run — not a penny, not a model call, not a paid API, not a scan out of the daily
allowance. The only thing anywhere in this section that costs real money is **emailing the
finished file**, and that is Resend at a fraction of a penny a send.

---

### Copy a document — `/copy`

- **What it is for.** Photograph any piece of paper — a letter, a form, a certificate, a
  delivery note — and get **one PDF** back, to save, share or email. Header: *"Photograph any
  paper — a letter, a form, a receipt. Each page is straightened, and they all go into one
  file you can save or send."*
- **How it differs from scanning.** It uses the **same camera** as `/scan` (the same
  `DocumentCapture`, the same edge-finding and straightening), and then stops. **Nothing is
  read by the AI** — no model is called, no figures are pulled out, no supplier is matched,
  nothing is counted against the scan allowance. **Nothing is stored** — no receipt row, no
  upload to the `receipts` bucket, nothing in the database. The pages live in the page's own
  memory and go when the page is left, which the last line on screen says out loud:
  *"Nothing is kept: the pages stay on this screen until you leave it."*
- **How you get there.** Header → **Tools ▾ → Copy a document**; the dashboard's fourth tile,
  **Copy a document**; the **+ Add** sheet everywhere it appears (*"Copy a document —
  Photograph any paper into one file to save or send"*); and a line at the foot of the Free
  invoice page: *"Need a copy of any paper? **Copy a document** into one file to save or
  send."*
- **What is on it**, in screen order:
  1. **"Copy a document"** and the sub-line.
  2. **A tip** the first three times (`tip:copy-how`, three appearances then it stops, or
     **Got it** stops it at once): *"How it works: take photos or pick files, put them in
     order, and they become one file to save, share or email."*
  3. Two big buttons side by side: **Take photos** (**Take more photos** once there are
     pages) and **Choose files** (**Add from files**). The file button accepts photos and
     PDFs.
  4. Once there are pages, a white card: **"4 pages"**, then a grid of thumbnails, each
     numbered, each with **←**, **Remove**, **→** so the order can be fixed. A PDF page shows
     the word **File** instead of a picture.
  5. **Name for the file** — one box, placeholder *"Document 26 Sep 2026"* (today's date).
  6. **Save the file** and **Share** (**Making the file…** while it works).
  7. **Or email it to someone** — *Their email address*, *A note (optional)*, **Send**, and
     *"It goes from Invoiceover with your email address to reply to."*
- **What it does behind the scenes.** `src/lib/documentPdf.ts` (`pagesToPdf`) builds the PDF
  with `pdf-lib` **in the browser**: a photo gets an **A4 page turned to match it**
  (landscape photo, landscape page) with the picture fitted inside an 18-point margin; a PDF
  dropped in has **its own pages copied through as they are**. `pageCount` counts what the
  finished file will really have (a 6-page PDF counts as 6, not 1). `pdfName` cleans the typed
  name down to letters, digits, spaces and dashes. The camera side is
  `DocumentCapture purpose="copy"`, whose review screen says **"Check your photos"** /
  **"Use N pages"** and — unlike the scanner's — has no grouping into separate documents.
  `src/lib/saveFile.ts` hands the file to the device. Two details worth knowing before
  anything here is restyled: **pdf-lib is half a megabyte** and is fetched only once the
  first page is added (every page linking to `/copy` was making Next preload it for visitors
  who never copy anything); and **Save and Share are guarded by a `useRef`, not by
  `disabled`**, because React applies `disabled` on the render *after* the first press — two
  taps in one tick gave two identical PDFs in Downloads, or a second share sheet, which
  throws.
- **Where it takes you next.** Nowhere: it is a dead end on purpose. The file goes to the
  device, the share sheet or an email. The only link off the page is the sign-in link, which
  cannot be reached (below).
- **Free, gated or not built.** **Behind sign-in** — the Gate in `src/app/AppShell.tsx`
  redirects a stranger straight to `/login`, and this was Atanas's own rule that everyone
  signs in before scanning anything. Free to run: **no model, no paid API, no scan counted,
  no environment switch**. Only the email costs anything.
  - **A dead branch worth knowing about.** The page has its own signed-out card — *"It needs
    a free sign-in first. Nothing to pay."* with **Sign in to copy a document** pointing at
    `/login?next=%2Fcopy` — and **it can never be seen**, because the Gate has already
    bounced the visitor to a bare `/login` with no `next=`, so they do not come back here
    after signing in either. Whoever decides whether `/copy` should be public is deciding
    which of those two is the mistake.

---

### Change a file — `/convert`

- **What it is for.** Turning what somebody already has into what they need, with no upload
  anywhere. Header: *"Turn a photo into a PDF, a PDF into pictures or words, a spreadsheet
  into data. It happens on your own phone or computer: nothing is sent anywhere."*
- **How you get there.** Header → **Tools ▾ → Change a file**, and **that is the only way
  in.** No dashboard tile, no row in the **+ Add** sheet, no link from `/copy` or the Free
  page. It is the most hidden tool in the app.
- **What is on it**, in screen order:
  1. **"Change a file"** and the sub-line.
  2. **A tip** (`tip:convert-how`): *"How it works: choose your files, pick what you want them
     to become, then save what comes out or email it."*
  3. **Choose files** — one big button, any number of files, added to a list.
  4. **The list** — each file's name, and under it what kind it is (*picture*, *PDF*, *words
     or rows*, or *not one we can change*) and its size in KB, with **Remove**.
  5. **"Turn it into"** / **"Turn them into"** — a grid of buttons, only the ones **every**
     chosen file can become:

     | Button | Ending | What it says |
     |---|---|---|
     | PDF | .pdf | One file, good for sending and printing |
     | Picture | .png | Sharp, bigger file |
     | Smaller picture | .jpg | Smaller, good for a message |
     | Web picture | .webp | Smallest of the three |
     | Plain text | .txt | The words on their own |
     | Spreadsheet | .csv | Rows and columns for Excel or Numbers |
     | Data | .json | For another program to read |
     | Web page | .html | Opens in any browser |

  6. If nothing fits: *"We can change pictures, PDFs, and files of words or rows. That one we
     can't."*
  7. **"Your file is ready"** / **"Your 6 files are ready"** — each with **Save**, plus
     **Save all 6**, and the email form **only when exactly one file came out and it is a
     PDF**.
- **What every conversion actually is** (`src/lib/convert.ts`). Three kinds in, eight out,
  and the table below is the whole of what is allowed — `kindOf` decides the kind from the
  type and the file name:
  - **A picture** → PDF, .png, .jpg, .webp. Redrawn through a canvas; anything see-through
    goes onto white first, or a JPEG turns it black.
  - **A PDF** → PDF, .png, .jpg, **.txt**. Each page is drawn at **twice its own size** so the
    words stay sharp and comes out as a picture of its own (*"invoice page 3.png"*); .txt
    pulls the real text out, line by line, with `pdfjs-dist`. There is **no OCR**: a PDF that
    is only a photograph inside gives an empty .txt, and nothing on screen explains that.
  - **Words, rows or data** (.txt, .csv, .tsv, .json, .html, .md, .log, .xml, .yml) → PDF,
    .txt, .csv, .json, .html. A CSV is parsed properly, quotes and all (`parseCsv`, and a
    tab-separated file is spotted); a spreadsheet becomes an HTML **table**; JSON becomes rows
    with a header line; plain words become an A4 PDF, wrapped where the line runs out, with a
    word longer than the page cut rather than run off it (`textToPdf`).
  - **Several pictures or PDFs asked for as one PDF come back as one file** — the same
    `pagesToPdf` as `/copy`. Everything else comes back one file for one.
  - **Anything else is "other" and can be turned into nothing.** In practice that means
    **Word and Excel documents are not supported**: *spreadsheet* here means .csv or .tsv, not
    .xlsx, and there is no .docx path at all.
  - **A mixed pile narrows the options to the overlap**, because `targetsFor` keeps only what
    *every* file can do. A picture and a spreadsheet together offer PDF and nothing else; a
    picture and a Word document offer nothing.
  - **All of it runs on the device** — canvas, `pdf-lib`, `pdfjs-dist` and `DOMParser`.
    Nothing is uploaded, nothing is stored, no server is involved at all. The `pdfjs` worker
    is a file copied to `public/vendor` at build time.
  - **Error wording is fenced.** Only four sentences written for people are allowed on screen
    (`WRITTEN_FOR_PEOPLE`: *"This browser can't change pictures."*, *"That picture couldn't be
    made."*, *"This browser can't draw the pages."*, *"That file couldn't be read."*).
    Anything pdf-lib or the browser says — *"Invalid PDF structure"*, a bare DOMException —
    is logged and replaced with *"Those files couldn't be changed. Try one at a time."* Same
    rule as the refusals section.
- **Where it takes you next.** Nowhere. Files out, or an email.
- **Free, gated or not built.** **Behind sign-in** (the Gate; and unlike `/copy` this page has
  no signed-out card of its own, so a stranger simply lands on `/login`). **Free to run —
  genuinely nothing:** no model, no API, no scan counted, no environment switch, no server
  request. Only the email costs anything. It is the one feature in the app that could be given
  away without limit at no cost whatsoever.

---

### File library — `/files`

- **What it is for.** Every photograph and PDF already attached to a **receipt** — the
  scanned and uploaded supplier paperwork — as tiles, newest first, with a way to look at one
  and take it off the app.
- **What it is not.** It does **not** hold what `/copy` or `/convert` made. Those files are
  never stored anywhere, so nothing from them ever appears here. The library reads
  `receipts` and shows only rows that still have a picture.
- **How you get there.** Header → **Tools ▾ → Files**; the dashboard's **Your file library
  →** strip (`src/components/FileStrip.tsx`, which shows recent documents with a
  Photos/Files switch and a date roller, and offers *"open the whole library"*).
- **What is on it**, in screen order:
  1. **"File library"** — *"Every scanned or uploaded receipt document, in one place."*
  2. **A tip** (`tip:files-how`): *"How it works: every photo and file you have saved is here,
     newest first. Tap one to see it or save it to your device."*
  3. **The emailed-photos notice**, only when there are any: *"3 older photos have been
     emailed to you and cleared from here to keep the app free. Those receipts are all still
     in your records — the supplier, the date, the amount and the VAT are untouched."* This
     belongs to the photo-ageing job, which is **switched off** (`PHOTO_AGEING` is not set),
     so today nobody sees it.
  4. **Save these to your device** (`src/components/SaveThese.tsx`), acting on whatever the
     filter is showing, with four shapes: **A folder of files** (a zip, named by date and
     supplier), **Pictures only**, **One PDF** (everything in date order), **One PDF per
     supplier**. *"Nothing is uploaded — it is all made on this device."*
  5. **Filter** — **From**, **To**, **Supplier** (*All suppliers*), **Clear filters**.
  6. **The tiles** — a square picture (or a document icon for a PDF), then supplier or
     category, then `26 Sep 2026 · £48.20`, and `3 pages` where there are extra pages.
  7. **Empty:** *"No scanned or uploaded documents yet. **Scan one**."* — or *"No files match
     these filters."*
  8. **Tapping a tile** opens a full-screen black preview: name, date, amount and supplier
     across the top, a **✕**, the picture (or the PDF in a frame), then a white panel with
     **Save it** and *"3 pages, as one file."*, the **Or email it to someone** form, and
     **Previous / Page 2 of 3 / Next** at the foot.
- **What it does behind the scenes.** Three reads on arrival — receipts, contacts and the
  extra-page counts — under row-level security (`src/lib/storage.ts`). A stored photograph is
  a **signed link** into the private `receipts` bucket, not a file in the page, so **Save it**
  fetches each page back, reads its real type (*"a PNG embedded as a JPEG makes no file at
  all"*) and builds one PDF with the same `pagesToPdf` as `/copy`. The big export shapes are
  `src/lib/fileExport.ts` and `src/lib/zip.ts`, both on the device; pdf-lib is imported only
  when a PDF is actually asked for, because importing it here once dragged the whole PDF
  writer onto every signed-in page. The preview is a real dialog: everything behind it goes
  `inert`, Escape closes it, and focus returns to the tile that opened it. A failed load
  shows one red line and **never** the empty-state sentence.
- **Where it takes you next.** `/scan` from the empty state. Otherwise: files to the device,
  or an email.
- **Free, gated or not built.** Behind sign-in. **No model, no paid API, no environment
  switch** — every export is built in the browser. Only the email costs anything. Nothing on
  this page deletes anything, and nothing here is limited.

---

### Emailing a file — the one thing here that costs money

All three pages share one form (`src/components/EmailFileForm.tsx`) and one route,
`POST /api/send-document`. It sends **the PDF and nothing else** through Resend from
`documents@invoiceover.com`, with the sender's own address as Reply-to, and it is fenced the
same way sending an invoice is, *"since any route that emails an attachment from the app's own
domain is a relay if it isn't fenced"*:

- **Signed in, and the email address confirmed** — an unconfirmed account is told to check
  its inbox first.
- **It must be a real PDF** — the name has to end `.pdf`, the bytes have to start `%PDF-` and
  end `%%EOF`, and it has to be under about 4 MB (*"Remove a page or two, or save it and
  share it another way"*), because Vercel refuses a bigger body before the handler even runs.
- **The wording is fixed.** Subject: *"you@example.com sent you a document: Delivery note
  26 Sep.pdf"*. The sender's note appears only as a quoted, escaped block.
- **10 an hour and 30 a day per account, 60 an hour across the whole app.** With no
  `RESEND_API_KEY` the route answers *"Email sending isn't switched on yet."* (it is set in
  production).
- **Those caps are softer than they look.** `src/lib/rateLimit.ts` counts **in memory, per
  serverless instance** — *"a cold start forgets every count, and parallel instances each keep
  their own"*. The scan limits go through the database; these do not. It is a speed bump, not
  a limit.
- **Send is guarded by a `useRef`, not `disabled`** — *"an email, unlike a saved row, cannot
  be taken back."*

Atanas's own words behind the whole form (2026-09-22): *"every document scanned, created,
uploaded, you should be able to send it via email to anyone for free."* There is no daily cap
on making copies themselves — *"keep it open"*.

One relative worth knowing about: the scanner's walk has a **Just the file** panel
(`src/components/scan/JustTheFile.tsx`) that does exactly what `/copy` does, for a document
photographed at the scanner that should not become a receipt at all — *"Saved to your device.
Nothing was added to your records."* Same PDF builder, same email form.

---

### Worth deciding

1. **`/convert` costs nothing whatsoever to run and is buried in a menu.** No model, no
   server, no storage — it is the only feature in the app that is free in the literal sense.
   If the free tier needs something generous and safe to put on the front of it, this is it.
   Should it get a dashboard tile, a row in **+ Add**, and a line on the front door?
2. **Should `/copy` and `/convert` be open to strangers?** They cost nothing to run and store
   nothing, so the usual reason for a sign-in wall does not apply. Against it stands Atanas's
   rule that *nothing works before an account* — and the fact that a free file converter is a
   good reason for somebody to make one. The page has already been half-built both ways: the
   sign-out card on `/copy` exists and cannot be reached.
3. **The dead sign-in card on `/copy` needs settling either way.** Either the Gate should let
   `/copy` through and show that card, or the card should go. And if a page is ever opened up,
   the Gate should carry `next=` so signing in brings people back to where they were.
4. **No Word or Excel.** *Spreadsheet* on `/convert` means .csv; .xlsx and .docx are "not one
   we can change". For a restaurant or a builder, an emailed .xlsx is very common. Worth
   knowing it is a real library each way, not a switch.
5. **A PDF that is a photograph gives an empty .txt, silently.** There is no OCR on
   `/convert`, and the app *does* own a reader that could do it — at a cost, and counted
   against the scan allowance. Leave it honest and free, say so on screen, or offer "read the
   words with the scanner" as a paid-ish path?
6. **The email caps are in-memory and per instance.** If emailing documents is to be a free
   feature that people lean on, the count should move to the database the way `hit_rate_limit`
   does for scanning — otherwise the real limit is unknown.
7. **The email form on `/convert` shows up only for a single PDF.** Six pictures out of a PDF
   can be saved but not sent, which is arbitrary. Zip them, or allow sending what came out?
8. **`/copy` keeps its pages in memory only.** Leave the page — or lose the tab on a phone —
   and a set of photographs is gone with no warning. Nothing is stored by design, and that is
   the promise on the page; the question is whether a "you have 6 pages, are you sure?" is
   worth it.
9. **The Files page is the receipt photo library, not a file library.** Its name and the
   dashboard's *"Your file library"* both promise more than it holds — nothing from **Copy a
   document** or **Change a file** ever lands there. Either rename it or give copies somewhere
   to live.
