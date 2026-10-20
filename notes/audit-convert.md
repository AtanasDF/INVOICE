# The file converter, audited (2026-10-20, cloud session)

Brief 2 in `notes/cloud-queue.md`: `web/src/lib/convert.ts` and
`web/src/app/convert/page.tsx`. Line numbers are the code **as audited**
(`origin/main` at `178483b`); the fixes are on `wip/converter-audit`.

Every finding was checked before it was believed, and most by running the
real libraries: pdf-lib 1.17.1 and pdf.js 6.3.289 in Node, and the whole page
in headless Chromium 141 against a `next start` build (`test-convert`, run
here with the harness's mock database). The brief said "no behaviour changes";
the session's task said to fix what was confirmed, so the confirmed ones are
fixed and the rest are written down.

**Proof the new checks mean something:** with the old `convert.ts` built and
served, `test-convert` went from 25/25 to **14/25** -- every one of the eleven
new checks failed, each the way the finding below predicts. The logic suite
`test-convert-logic` (47 checks) runs without a browser.

## Fixed

### 1. A PDF with any password was merged into garbage, silently — `convert.ts:257-263`, `documentPdf.ts:29`
`pagesToPdf` loads every PDF with `{ ignoreEncryption: true }`. pdf-lib cannot
decrypt; with that flag it copies the still-encrypted streams into a document
with no `/Encrypt` dictionary. Measured: a PDF with only a permissions password
(opens anywhere with no prompt -- bank statements, HMRC letters) came out of
"PDF" as one page that `pdftotext` reads as `Syntax Error: Unknown operator
'<a0>yO,'` -- a blank page in a viewer. A PDF that needs a password to open went
through **the same way, with no error at all** (old code: no alert shown).
**Now:** every PDF is opened with pdf.js first. A password-to-open PDF says
"That PDF is locked with a password…" on every target. A permissions-only one is
drawn by pdf.js (which can read it) and goes in as pictures of its pages.

### 2. A damaged PDF lost pages silently — same lines
A five-page pdf-lib PDF cut off at 30% loads in pdf-lib as **one page**, no
error. pdf.js refuses it. **Now:** pdf.js must open it and the page counts must
agree, or "That PDF is damaged, so not all of it could be read."

### 3. A page that couldn't be drawn was skipped, and the rest renumbered — `convert.ts:106-107`
`if (blob) out.push(blob)`: a `toBlob` that returns null (canvas memory
exhausted, typically on a long PDF in Safari) dropped the page, and the names
come from the output index, so page 8 was saved as "page 7". **Now** it throws.
Canvases are also emptied after each page (`canvas.width = 0`) and the pdf.js
document destroyed rather than only cleaned, which is what runs out first.

### 4. PDF to pictures failed outright in any browser a few months old — `convert.ts:84`
pdf.js 6's modern build calls `Map.prototype.getOrInsertComputed` while drawing
a page. Chromium 141 has no such method: "Picture" on a PDF failed with
`TypeError: this[#re].getOrInsertComputed is not a function`. Text extraction
did not hit it, which is why only one direction broke. The existing
`test-convert` passed on the Mac only because its Chrome is new. **Whether the
iPhone's Safari has it was not checked here.** **Now** the converter loads
`pdfjs-dist/legacy/build/pdf.mjs` and a legacy worker, copied by
`scripts/copy-vendor.mjs` under a **new name** (`pdf.worker-legacy-<v>.mjs`) so the
year-long immutable cache on `/vendor` cannot serve the old worker to the new
library.

### 5. WEBP, GIF, HEIC, AVIF and BMP could never become a PDF — `convert.ts:260`, `documentPdf.ts:34`
`kindOf` calls them pictures and offers PDF, but `pagesToPdf` picks
`embedPng` for `image/png` and `embedJpg` for everything else, which throws
"SOI not found in JPEG". The page then said "Try one at a time" -- which cannot
help. A `.jpg` that is really a PNG failed the same way (the type comes from the
name). **Now** the format is read from the bytes; only real PNG and upright JPEG
go in as they are, anything else is drawn by the browser to a JPEG first.

### 6. A phone photo came out on its side in the PDF — same lines
pdf-lib lays a JPEG down as stored and ignores the EXIF turn beside it. A
portrait phone photo is stored landscape with Orientation 6, so the PDF had a
landscape page with the picture sideways (old code: page `[841.89, 595.28]` for
a portrait photo). **Now** a JPEG whose EXIF says anything but upright is redrawn
by the browser, which applies the turn.

### 7. Pictures over 16.7 megapixels — `convert.ts:64-81`
`imageAs` makes a canvas the photo's full size. iOS Safari refuses a canvas over
16,777,216 pixels, and the iPhone's own 24 MP default (5712 x 4284) is over it.
**Not reproduced** -- there is no iPhone here; desktop Chromium allows far more,
so old code made a 5712 x 4284 PNG without complaint. Whether Safari then returns
no context ("This browser can't change pictures", wrong), a null blob, or a blank
picture was not established. **Now** every canvas, picture or PDF page, is kept
within 16.7 MP and 16,384 px a side, same shape. A 24 MP photo becomes a ~16 MP
PNG/JPEG: smaller, nothing cut off. **Atanas's iPhone is the only real test.**

### 8. Every file saved on Windows failed to become a PDF — `convert.ts:210-239`
`split("\n")` leaves the `\r` of a CRLF line on each line, and pdf-lib throws
`WinAnsi cannot encode "" (0x000d)`. That is every CSV Excel saves on Windows.
The same throw for any letter outside Western European: a Cyrillic name, `✓`,
`→`. All shown as "Those files couldn't be changed. Try one at a time." **Now**
line ends are normalised and control characters made spaces; a letter the
built-in font can't write is refused up front with "That file has letters or
symbols a PDF can't be made with here. Plain text or Web page will keep them."
-- not replaced with `?`, which would be the silent loss the brief asks about.

### 9. One long word froze the page — `convert.ts:222-228`
A word wider than the line was cut by measuring the whole remainder and taking
one letter off at a time: quadratic per line, and the outer loop measured the
whole remainder again for every line. Measured: a 2,000-letter word took 1.7 s,
an **8,000-letter word 94 s**, main thread blocked throughout. A minified JSON
file is one word. **Now** measured from the front: 100,000 letters in a few ms
(fake widths), and a 93,000-letter JSON file to PDF in 0.7 s with pdf-lib.

### 10. An inch mark swallowed the rest of a spreadsheet — `convert.ts:154`
A `"` anywhere in an unquoted cell opened a quoted cell, so `Pipe 3" copper,2`
put every later row into one cell. **Now** only a quote that opens a cell starts
quoting, as Excel reads it.

### 11. A tab-separated file with a comma anywhere was read as commas — `convert.ts:143`
`text.includes("\t") && !text.includes(",")`: one "1,200.00" anywhere, and
`01/02<tab>Board<tab>1,200.00` became two cells, `01/02\tBoard\t1` and `200.00`.
**Now** decided by the first line.

### 12. Data to spreadsheet wrote `[object Object]` — `convert.ts:309`
`String(value)` for a nested object. A list mixing records and plain values
dropped the plain ones into empty cells. **Now** nested values are written as
JSON, a list of lists becomes rows, and nothing is left out.

### 13. Spreadsheet to data dropped columns — `convert.ts:322`
`Object.fromEntries` on a header used twice keeps only the last (two "Amount"
columns became one), and cells past the header's width were dropped. **Now**
"Amount 2", and "column 4" for the overflow.

### 14. The converter's CSV had none of the CSV rules — `convert.ts:172-173`
Its own `csvCell` predates `lib/csv.ts`: no byte-order mark, so Excel shows
`Â£`; `\r` unquoted, which splits the row; and no formula guard. JSON to CSV is
where that last one bites, because a value that was inert in JSON
(`"=HYPERLINK(...)"`) becomes live when Excel opens the CSV. **Now** it uses
`lib/csv.ts` like every other export. Note that this applies to CSV to CSV too:
a cell the person's own file had as `=SUM(...)` comes out as text. That is the
project's existing rule; say if the converter should be an exception.

### 15. A note starting with `[` or `{` failed as broken data — `convert.ts:288, 306, 318`
`/^\s*[[{]/` made it JSON and `JSON.parse` threw, generic error. **Now** a file
is data only if named `.json` or it actually parses; a broken `.json` asked for
as data says "That data file has a mistake in it", and still converts to text.

### 16. A scanned PDF to text gave an empty file — `convert.ts:134`
A PDF with no text layer (most PDFs in this app are photographs) returned
`"\n"` as a ready `.txt`. Pages with no words vanished from a mixed one.
**Now** a PDF with no words at all is refused ("…its pages are pictures, like a
scan…"), and a picture page in a mixed one is marked `[Page 2 is a picture, so
it has no words to take out.]`.

### 17. HTML to text ran words together and kept script code — `convert.ts:176-179`
`textContent` of `<p>Total</p><p>£40.00</p><script>…</script>` was
`Total£40.00var secret="tracking code";`. **Now** scripts and styles are left
out and block elements end a line (`Invoice 7\nTotal\n£40.00`).

### 18. A letter became a table — `convert.ts:299-300`
To "Web page", any text that wasn't HTML or JSON went through `parseCsv`, so a
letter with a comma in each line was cut into table cells. **Now** only `.csv`
/ `.tsv` (or a CSV type) becomes a table.

### 19. A long file name could not be emailed — `convert.ts:53`, `api/send-document/route.ts:44-45`
The route cuts the name at 90 letters and then checks it ends `.pdf`. A long
name, or `… and 3 more.pdf`, was refused as "The file must be a PDF." **Now**
the converter keeps a name's stem to 60 characters, and a newline in a name
becomes a space.

### 20. Adding or removing files mid-conversion — `page.tsx:79, 91`
Choose files and Remove stayed live while a list was being changed; the old
list's results then appeared as "ready" beside a different list. Both are
disabled while busy.

## The brief's questions, answered

- **A file that is not what its extension claims** (`convert.ts:31-38`): the
  kind comes from the browser's type, which comes from the name. A PDF that
  isn't one: pdf.js refuses it -> now "damaged". A picture under the wrong
  name: `createImageBitmap` sniffs, so picture targets always worked; the PDF
  target now sniffs too (5). A text file named `.png`: `createImageBitmap` fails
  -> "That file couldn't be read."
- **Encrypted** (1), **corrupt** (2), **500 pages**: see below.
- **200 MB image**: see below; and (7).
- **A formula / `=cmd`**: CSV input is text, so nothing is evaluated here; on
  output see (14). `.xlsx` is not accepted at all (kind "other"), so the
  "spreadsheet" side is CSV/TSV only.
- **A million rows**: see below.
- **A path or a newline in the name**: browsers never put a directory in
  `File.name`, and the `download` attribute is sanitised by the browser, so a
  saved file cannot land outside Downloads. A newline survived into the name
  and the email (where the route stripped it); now stripped here too (19).
- **Silent missing content**: (1), (2), (3), (12), (13), (16) were all real.
  Remaining: an animated GIF becomes its first frame (expected, unsaid).
- **Uploaded anywhere?** No. Neither file calls `fetch`, XHR or
  `sendBeacon`; pdf.js's worker is `/vendor` on the same origin; no `cMapUrl`
  or `standardFontDataUrl` is set, so pdf.js fetches nothing else. The one way
  out is `EmailFileForm` (`page.tsx:144`), which posts the PDF to
  `/api/send-document` and on to Resend **only when Send is pressed** -- the
  heading's "nothing is sent anywhere" is about the conversion, and is true of it.

## Not fixed, written down

- **The main thread still blocks on big inputs.** Measured: `parseCsv` on
  1,000,000 rows (45 MB) is 2.2 s on this machine; `documentPdf.bytesOf`
  (`atob` and a byte loop) is 0.3 s per 50 MB, so ~1.2 s for 200 MB here and
  several times that on a phone, while the file is held about four times over
  (data URL, binary string, bytes, pdf-lib's copy). pdf-lib also decodes a PNG
  fully on the main thread to embed it. A 200 MB picture is likely to crash a
  phone tab rather than fail politely. The fix is a worker and passing bytes
  instead of data URLs through `pagesToPdf`, which `/copy` shares -- a session's
  work, not an audit's.
- **500 pages to pictures** renders all 500 (now one canvas at a time, freed),
  holds 500 blobs, and offers "Save all 500", which browsers block after the
  first few downloads (iOS saves one). A limit is a product choice: Atanas's.
- **`/copy` has holes (1) and (2) too**: it calls the same `pagesToPdf` with
  `ignoreEncryption: true`. Left alone because the brief kept this session in
  the converter; the fix is the same pdf.js check in `documentPdf.ts`.
- **Errors still don't say which file failed** in a list of several, and one
  failure throws away the others' results.
- **Semicolon CSVs** (European Excel) are read as one column.
- Already fixed elsewhere: `saveBlob` revoking the address at once (main has a
  5 s delay now).

## What the Mac must run before merging

Run here, green: `test-convert` (25/25, Chromium 141 + `next start`),
`test-convert-logic` (47/47), `test-csv-safety` (12/12); tsc, eslint, build.
Still to run on the Mac against a fresh build: `test-convert`,
`test-convert-logic`, `test-copy-document` and `test-save-as` (they share
`documentPdf` / `saveFile`), `test-weight` (the legacy pdf.js is larger; it is
loaded only by /convert), `test-odd-files` and `test-exif-rotation`. And **on
the iPhone**: a 24 MP photo to Picture and to PDF, and a PDF to Picture.
