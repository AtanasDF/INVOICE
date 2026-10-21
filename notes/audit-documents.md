# Audit: how a document leaves the app (2026-10-18)

Scope: `src/lib/invoicePdf.ts`, `src/lib/documentPdf.ts`, `src/lib/sheetFile.ts`,
`src/lib/saveFile.ts`, plus what they read: `SaveAsMenu`, the five printed sheets
(`IssuedInvoice`, `InvoiceDocument` for the Free page, `QuoteDocument`,
`StatementDocument`) and the four places that mount a sheet. Read only, nothing changed.

**How it was checked.** Every finding marked *(ran)* comes from rendering the real
components in headless Chromium and running the real `readSheet` / `sheetText` /
`sheetCsv` / `sheetHtml` on them, then reading the output files. The two probe files are in
`notes/audit-documents-probe/` (esbuild bundle with `@` aliased to `web/src`, a handful of
Tailwind rules stood in by hand). Marked *(read)* is from the code alone.
Paths below are under `web/src/`.

## Short answer

1. **The rule holds structurally.** Every non-picture shape is read off the same DOM node
   the PDF photographs. No screen hands Save as its own totals.
2. **But on the Free page the rule is kept and the totals are lost anyway.** `readSheet`
   reads `thead` and `tbody` and ignores `tfoot`, and the Free page puts *every* total in
   a `tfoot`. Word, web page, text and spreadsheet from the Free page carry the lines and
   **no Subtotal, no VAT, no Total due, no CIS deduction, no Net payment due**. *(ran)*
   This is the one that matters: a customer sent a .doc from the Free page is sent an
   invoice with no total on it, and `test-save-as` passes because it looks for "480",
   which is also the line's own price.
3. CIS, reverse charge and deposits all survive on the **in-app** invoice and quote.
   The Free page loses CIS (above) and the labour/materials split; the reverse-charge
   wording survives everywhere.

## 1. Does the rule hold? (file:line)

The PDF and the other shapes are given the same element at every call site:

| Where | PDF made from | Save as reads |
|---|---|---|
| Invoice / quote / statement in the app (`useDocumentPdf`) | `sheetRef` — `components/SendInvoicePanel.tsx:58` | `pdf.sheetRef.current` — `SendInvoicePanel.tsx:129`; PDF row routes back to `pdf.download` (same cached PDF) |
| Customer's `/i/` page | `sheetRef` — `components/invoice/PublicInvoiceView.tsx:40` | `sheetRef` — `PublicInvoiceView.tsx:59` |
| Customer's `/q/` page | `sheetRef` — `components/quote/PublicQuoteView.tsx:61` | `sheetRef` — `PublicQuoteView.tsx:160` |
| Free page (desktop and phone "More") | `saveSheet` via `saveSheetAs` — `components/SaveAsMenu.tsx:29-30` | `saveSheet` — `components/free-invoice/FreeInvoiceBuilder.tsx:266`, `:296`, mounted at `:331` |

- Text shapes: `readSheet(el)` at `SaveAsMenu.tsx:35`, then `sheetHtml` / `sheetText` /
  `sheetCsv` (`SaveAsMenu.tsx:36-39`). `sheetFile.ts` has no figures of its own: it reads
  `innerText` (`sheetFile.ts:13`, `:37`) and cell `textContent` (`sheetFile.ts:14`).
- Pictures: `sheetImage` (`saveFile.ts:24-33`) and the PDF (`invoicePdf.ts:54-79`) both
  `html-to-image` the same element.
- `saveFile.ts:1-15` is the only place a file is handed over (`SaveThese`, `JustTheFile`,
  `/convert`, `/files` all go through `saveBlob`). Holds.

Outside the rule but worth knowing: the **email and share-sheet wording** is not read off
the sheet. `InvoiceEmailFields.total` is built by each page (`app/invoices/[id]/page.tsx:859`,
`app/quotes/[id]/page.tsx:563`, `components/free-invoice/SendByEmail.tsx:24`) and goes into
`shareMessageFor` (`SendInvoicePanel.tsx:39-43`). That is a second copy of "the total". It
is not Save as, so not a breach of the rule as written, but it is the same risk the rule
exists to remove.

## 2. Figures a shape loses that the PDF shows

### 2a. Free page: every total, CIS and the "Net payment due" — HIGH *(ran)*

`components/invoice/InvoiceDocument.tsx:144` puts the totals in `<tfoot>`.
`readTable` reads only `thead tr` and `tbody tr` (`sheetFile.ts:17-18`), and `readSheet`
strips the whole table out of the text before reading the words (`sheetFile.ts:31`), so the
tfoot is in neither half. A CIS + VAT Free invoice, saved as text, ends:

```
Description  Qty  Unit price  VAT                   Amount
Labour job   1    £1,000.00   Reverse charge (20%)  £1,000.00
Sand         1    £100.00     Reverse charge (20%)  £100.00
Refund       1    £-50.00     Reverse charge (20%)  £-50.00
```

and nothing else: no Labour / Materials subtotals, Subtotal, VAT per rate, "VAT to be
accounted for by the customer", Total, CIS deduction or Net payment due. Same in .csv,
.html and .doc. Same for a Free **quote** (no Total). The PDF and both pictures are fine.

Also on the Free page, the CIS group headings ("Labour", "Materials") are
`<th scope="rowgroup">` rows in tbody (`InvoiceDocument.tsx:155-158`); `readTable` keeps
only `td` and drops empty rows (`sheetFile.ts:18`), so they vanish and the rows carry no
marker of which is labour. With the totals gone too, nothing in the text shapes says what
the CIS was taken off. (The in-app invoice marks materials inline,
`IssuedInvoice.tsx:89`, so it survives there.)

`harness/test-save-as.mjs` does not catch this: its Free-page check is
`/480/.test(txt)` and the only line is priced £480, so the line's own Unit price and Amount satisfy it.

### 2b. In-app invoice: nothing lost *(ran)*

`IssuedInvoice` returns a fragment, so each block is its own child of the sheet and
`readSheet` keeps print order. A CIS + reverse-charge + deposit + credit note + payment
invoice came out with all of: every line incl. `Deposit for Q-001  -1  £250.00  −£250.00`,
Subtotal, VAT per rate, Total, `CIS deduction (20% of £728.36 labour after credit): −£145.67`,
the credit note, the payment, both reverse-charge lines, Amount due, Due, bank details,
late-payment line, registered name/number. Matches the PDF.

### 2c. Quote: nothing lost *(ran)*

Subtotal, VAT, Total and `Deposit to book the work: £330.00 (25%)` all present.

### 2d. Statement: every figure kept, two of them garbled — MEDIUM *(ran)*

- `StatementDocument` has a single root `<div>` (`components/StatementDocument.tsx:18`), so
  `readSheet` sees one child: all the words (Total owing, the ageing boxes, How to pay)
  come out **before** the table of invoices, because tables are lifted out and appended
  after the text of their child (`sheetFile.ts:31`, `:43`). The comment at
  `sheetFile.ts:22` ("in the order they are printed") is only true when the sheet's
  children are the blocks. The Free page has the same single root (`<article>`,
  `InvoiceDocument.tsx:358`), so its notes and bank details also come out above its lines.
- "N days late" is a `block` span inside the invoice-number cell
  (`StatementDocument.tsx:58`). Cells are read with `textContent` (`sheetFile.ts:14`),
  which has no notion of a block, so `INV-001` + `3 days late` becomes
  **`INV-0013 days late`** in every text shape — an invoice number that does not exist.
- Label and value sit in sibling flex spans ("Total owing" / "£380.00"), so they come out
  on separate lines and the CSV cannot pair them (it splits only on `": "`,
  `sheetFile.ts:113`).

## 3. The edge cases

| Case | PDF / pictures | Word / web page | Text | Spreadsheet |
|---|---|---|---|---|
| Very long business name (words) | wraps; fine | fine | fine | quoted; fine *(ran)* |
| Very long name, **one unbroken word** | In-app invoice wraps (`wrap-anywhere`, `IssuedInvoice.tsx:45`). **Free page header (`InvoiceDocument.tsx:222`, `:272`, `:323`) and `QuoteDocument` business and client names (`QuoteDocument.tsx:25`, `:38`) have no `wrap-anywhere`**, so it runs off the sheet's right edge and is cut off in the photograph *(read)* | whole | whole | whole |
| Client `Smith & Sons <Ltd> "Quoted"` | fine (React escapes) | escaped, `sheetFile.ts:70` *(ran)* | as written | quoted and `""` doubled *(ran)* |
| 200 lines | desktop: 8,506 CSS px tall, 9 pages, fine. **iPhone: probably fails** — see 3a | fine | fine | fine |
| Zero total | `£0.00` throughout *(ran)* | same | same | same |
| Negative line | in-app `−£5.00`; **Free page and quote print `£-50.00`** (`InvoiceDocument.tsx:12-14`, `QuoteDocument.tsx:6` don't use `lib/money.ts`) — same in every shape, so consistent, just not the house minus | same | same | text in Excel either way, 3c |
| Missing logo | nothing drawn; a non-`data:` logo is not drawn either (`IssuedInvoice.tsx:46`) | logo and signature never appear (no images in text shapes, by design) | — | — |
| Non-Latin name | rendered by the browser; fine | `<meta charset="utf-8">`; fine | **columns misalign**, 3b *(ran)* | **probably mojibake in Excel**, 3c |

### 3a. 200 lines on the iPhone — HIGH if confirmed *(read, not reproduced on a device)*

A 200-line invoice is 8,506 CSS px; at `pixelRatio: 2` that is 1,588 × 17,012.
html-to-image scales anything over 16,384 on a side down to ~1,529 × 16,384 =
**25 million pixels**. iOS Safari caps a canvas at **16,777,216 pixels** in area, and over
it the canvas is silently blank. So on the device he uses, an invoice past roughly
**110 lines** (16.7M ÷ 1,588 ≈ 10,565 px ≈ 5,280 CSS px) should come out as a blank PDF or
throw `PDF_FAILED`; the PNG/JPEG the same. Desktop Chrome is fine. This needs trying on
the iPhone before anybody fixes it; the fix would be to capture in page-sized slices
rather than one canvas.

### 3b. Plain text alignment *(ran)*

`pad` and the column widths count UTF-16 code units (`sheetFile.ts:48`, `:60`). CJK is
two columns wide on screen, Arabic is right-to-left, emoji are two code units, so a line
in a non-Latin script pushes the rest of its row out of line. Nothing is lost.

### 3c. Spreadsheet — MEDIUM *(ran for the bytes; Excel's behaviour is known, not tried)*

- **No byte-order mark.** `saveText` writes plain UTF-8 (`saveFile.ts:14`). Excel on
  Windows and on the Mac opens a BOM-less CSV in the legacy code page, so every `£`
  becomes `Â£` and any non-Latin name is garbage. Numbers and Google Sheets are fine.
- **Formulas run.** `cell` quotes only `"`, `,` and `\n` (`sheetFile.ts:100`). A line
  described `=HYPERLINK("http://x.example","click")` is written as
  `"=HYPERLINK(""http://x.example"",""click"")"`, which Excel still evaluates — quoting
  does not stop it. On the customer's `/i/` and `/q/` pages that is the issuer's text
  executing in the customer's spreadsheet. HTML escapes; CSV has no equivalent guard.
  `\r` is not quoted either.
- **Money is text, and a deduction is worse.** Amounts go out as `£1,000.00`; Excel UK
  usually reads that as currency, but `−£250.00` (U+2212, `lib/money.ts:6`) and
  `£-50.00` are text, so a SUM over the Amount column leaves out exactly the deposit
  deductions and negative lines.
- The `": "` split (`sheetFile.ts:113`) mangles any line with a colon in the middle:
  `Registered name: Nasko Ltd. Company number,12345678.` *(ran)* Nothing is lost.

## 4. Escaped in one shape and not another

| | Word / web page | Text | Spreadsheet | File name |
|---|---|---|---|---|
| `& < > "` | escaped (`sheetFile.ts:70`), title too | not needed | `"` doubled; no formula guard | `tidyFileName` strips `\ / : * ? " < > \|` (`saveFile.ts:19`) |
| Leading `= + - @` | inert | inert | **live** | — |

File names disagree with each other: Download PDF uses `pdfFilenameFor`, which turns
every non-ASCII character into `-` (`SendInvoicePanel.tsx:35`, `\w` is ASCII), while Save as
keeps them (`saveFile.ts:19`), and `documentPdf.pdfName` keeps letters in any script
(`documentPdf.ts:58`). So an invoice numbered in a non-Latin script saves as
`Invoice-----.pdf` beside `Invoice 請求.txt`. On `/i/` the PDF is `Invoice-INV-1.pdf` and
the other shapes `Invoice INV-1.*`.

## 5. Smaller things

- `readSheet` removes `print:hidden` and `sr-only` from the text clone but reads tables
  from the original `child` (`sheetFile.ts:43`), so anything hidden inside a table, or a
  table nested inside a hidden block, would be exported. No sheet does that today.
- `child.className.includes` (`sheetFile.ts:27`) throws on an SVG child (its `className`
  is an object), which would fail every text shape with "That file couldn't be made". No
  sheet has one today.
- The title is printed twice in every text shape (heading plus the h1's own line), and on
  the Free page it comes out upper-case because `innerText` applies `uppercase`.
- `documentPdf.pagesToPdf` embeds anything that is not PNG as JPEG
  (`documentPdf.ts:34`); a WebP or HEIC page would throw. Callers convert first today.
- The Free page exports its placeholders when a field is empty ("Your business name",
  "Customer name", "Describe the work on the first line") — as the PDF does.

## What I would do, in order

1. **Done 2026-10-18.** `readSheet` now reads each table's footer as lines after the table
   ("Total due: £480.00", so the spreadsheet pairs label and figure the way it does for
   `IssuedInvoice`). `test-save-as` checks for the Total due line in the .txt and .csv.
   Proved both ways against a production build: 21/21 with the fix, and the new check
   alone failing (20/21) with `sheetFile.ts` put back to the old one. The CIS Free invoice
   in the probe now carries Labour, Materials, Subtotal, VAT, the reverse-charge VAT, Total,
   CIS deduction and Net payment due. The labour/materials group headings are still
   dropped (that's item 4's cell reading), but the Labour and Materials subtotals now say
   what the CIS was taken off.
2. Try a 150-line invoice's PDF on the iPhone.
3. Prefix the CSV with a BOM, and neutralise a leading `= + - @` in a cell.
4. Read cells with `innerText` (or join block children with a space) so the statement's
   "days late" stops gluing onto the number; walk single-root sheets one level down so
   order matches print.
5. `wrap-anywhere` on the Free page and quote names; `lib/money.ts` in
   `InvoiceDocument`/`QuoteDocument`.

---

# Second pass, 2026-10-20 (cloud brief 8)

The same four files and five sheets, against today's tree (`6f403a6`). Read-only; nothing
in `web/` changed. **Line numbers above are the 2026-10-18 tree's; the ones below are
today's.** How it was checked: the real `readSheet` / `sheetText` / `sheetCsv` / `sheetHtml` /
`csvCell` (types stripped with Node's `stripTypeScriptTypes`, nothing rewritten) run in
headless Chromium over markup copied from the sheets, with the display rules `innerText`
depends on (`flex`, `grid`, `block`, `contents`, `pre-line`) stood in by hand. Marked
*(ran)* or *(read)* as above. A cloud session has no `node_modules`, so html-to-image and
jsPDF were not run.

## The rule still holds

`readSheet` reads only the element it is given (`sheetFile.ts:170-199`); `saveSheetAs`
hands one element to every shape (`SaveAsMenu.tsx:25-40`); and each caller passes the
element its PDF is made from: `SendInvoicePanel.tsx:131` and `:59` (the portal, `:101-108`,
which covers the invoice, quote, statement and Free send card), `PublicInvoiceView.tsx:59`
and `:40`, `PublicQuoteView.tsx:160` and `:61`, and `FreeInvoiceBuilder.tsx:275` / `:305` /
`:340` (no `onPdf` there, so the PDF goes through `SaveAsMenu.tsx:29-30` on the same element).
The email and share wording is still a second copy of the total, now at
`invoices/[id]/page.tsx:793-797` and `:940-944` (which repeat `IssuedInvoice.tsx:27-31`),
`SendByEmail.tsx:8-9` / `:25` and `PublicQuoteView.tsx:40`. It agrees today only because
it calls the same functions.

## What the first pass found, now

| First-pass item | Today |
|---|---|
| 2a Free page totals lost | **Fixed** (`23e7e45`): the `tfoot` is read as `Label: figure` lines (`sheetFile.ts:192-195`). *(ran)*: Labour, Materials, Total, CIS deduction and Net payment due are all present. |
| 2a CIS group headings dropped | **Open** *(ran)*. `th`-only rows are still filtered out (`sheetFile.ts:165`), so nothing in the text shapes says which lines are labour. |
| 2d Statement order / `INV-0013 days late` | **Open, both** *(ran)*: `INV-001` + `12 days late` → `INV-00112 days late` (`sheetFile.ts:161` `textContent`, `StatementDocument.tsx:57-58`); "Total owing" comes out before the table, and so do the Free page's notes, bank details and footer (`sheetFile.ts:173-196`, single roots at `StatementDocument.tsx:18` and `InvoiceDocument.tsx:358`). |
| 3a 200 lines blank on iPhone | **Fixed in code** *(read)*: `sheetPixelRatio` (`saveFile.ts:338-340`) keeps the capture under 16,777,216 px, about 1.6x at 200 lines, for both the PDF (`invoicePdf.ts:59`) and the pictures (`saveFile.ts:345`). Still never tried on the iPhone. |
| 3c No BOM | **Fixed**: `CSV_BOM` (`csv.ts:3`, `sheetFile.ts:269`). |
| 3c Formulas run | **Fixed** *(ran)*: `csvCell` (`csv.ts:9-13`). `=HYPERLINK("x")` → `"'=HYPERLINK(""x"")"`. `\r` is quoted now. |
| 3c `−£` money is text | Open; by design as long as amounts carry `£`. |
| `": "` split | **Open** *(ran)*, and it also splits the statutory sentence: `Reverse charge,VAT Act 1994 Section 55A applies` (`sheetFile.ts:264-265`, `reverseCharge.ts:62`). The words are all there, just across two cells. |
| Negative line `£-50.00` | **Quote fixed** (`QuoteDocument.tsx:6-7` uses `money()`). **Free page open**: `formatMoney`, `InvoiceDocument.tsx:12-14`, also in the send-card total, `SendByEmail.tsx:25`. |
| Unbroken long name | **Open**: Free page `InvoiceDocument.tsx:222`, `:272` (the `div` has `min-w-0` but the text has no wrap, so it spills over the title), `:323`; `QuoteDocument.tsx:21-30` (header flex with no `min-w-0`) and `:40`. **New:** `StatementDocument.tsx:25`, `:35`, and `IssuedInvoice`'s client email and address (`:65-66`). |
| File names disagree | **Open** (`pdfFilenameFor`, `SendInvoicePanel.tsx:35-37`, against `tidyFileName`, `saveFile.ts:330-333`). See N3 for `pdfName`, which the first pass thought was safe. |
| Plain-text alignment | Open (`sheetFile.ts:201`, `:213`). |
| Tables read from the original child; SVG `className` | Open, latent (`sheetFile.ts:190`, `:174`). |
| WebP or HEIC page throws in `pagesToPdf` | Open, latent (`documentPdf.ts:34`). |

## New in this pass

**N1. In a spreadsheet, a label and its value come apart, and then Excel changes the
value. MEDIUM** *(ran for the bytes; Excel's behaviour is known, not tried)*
The Free page prints its number, dates and bank details as `dt`/`dd` grid items
(`InvoiceDocument.tsx:231-236`, `:249-256`, `:299-306`). `innerText` puts each on its own
line, so the CSV gets `Invoice no.` / `0042` / `Sort code` / `12-03-56` / `Account
number` / `01234567` as six separate rows. The file is correct. Excel shows **42**, drops
the account number's leading zero, and reads `12-03-56` as **12/03/1956**. The issued
invoice's `Sort code: 12-03-56` lines do pair up, but they leave the value bare, so Excel
changes it the same way. This is the one shape where, as opened, a figure differs from the
PDF. `csvCell` rightly leaves these values alone, since they are not formulas. If a fix is
wanted, writing them as text (a `="..."` form) is it.

**N2. A long block with no break point inside it can be cut through a line of text in the
PDF. MEDIUM-LOW** *(read)*
`pageSlices` cuts at the page limit when no break point falls in the page's lower 60%
(`invoicePdf.ts:45-46`). Break points are `tr, section, header, footer, table, h1, p,
dl > div` (`:8`). `IssuedInvoice`'s notes are a bare `div` (`:172-174`), and a single
`whitespace-pre-line` `p` has no break inside it either (`QuoteDocument.tsx:95`,
`InvoiceDocument.tsx:171`, `:211`). Long notes or terms that run over a page boundary can
be sliced through a line. A 200-line invoice is fine, because every row is a break point.

**N3. `pdfName` mangles non-Latin names. LOW** *(ran)*
It keeps `\p{L}\p{N}` and turns everything else into spaces (`documentPdf.ts:143`).
Combining marks (`\p{M}`) are "everything else", so `हिन्दी बिल` → `ह न द ब ल.pdf` and a
decomposed `Café` → `Cafe.pdf`. Hindi, Bengali, Thai, and Arabic with its vowel
marks are all hit (Copy, Files, the scan's file). `pdfName` and `tidyFileName` also cut
with `slice(0, 80)`, which can leave half a surrogate pair. Checked: 79 letters plus an
emoji ends in `\ud83d`.

**N4. A comment in `csv.ts` says the opposite of the code. LOW** *(read)*
`csv.ts:6-8` says `"+44 20..."` "is left as it is". The exemption (`:11`) only covers a
plain number, so a phone number with spaces gets the apostrophe. The code is the right
one: Excel would treat `+44 20 7946 0000` as a formula. The comment should change.

**N5. `signedMoney` is now redundant** (`IssuedInvoice.tsx:13`): `money()` already prints
`−£` (`money.ts:6`). Harmless.

## The brief's cases today

- **`<` or `&` in a name: correct in every shape** *(ran)*. React plus html-to-image
  handle the PDF and pictures; `esc` covers every text node and the `<title>` in Word and
  the web page (`sheetFile.ts:223`, `:227-239`); `'` is unescaped but nothing goes in an
  attribute; text needs nothing; CSV is quoted and guarded. Nothing is escaped in one shape
  and not another, now that CSV has its guard.
- **CIS** is kept in every shape for both invoice sheets. On the Free page the grouping is
  lost (above).
- **Reverse-charge wording** is kept everywhere *(ran)*, split across two cells in CSV.
- **Deposit deduction** is kept: the issued invoice's `-1 … −£50.00` row and the quote's
  "Deposit to book the work" line *(ran)*.
- **Zero total**: nothing breaks; `IssuedInvoice.tsx:35` guards the CIS share. A Free
  invoice with no lines still carries "Describe the work on the first line" as a line item
  in every shape, the PDF included.
- **Missing logo**: safe (`IssuedInvoice.tsx:46`, `QuoteDocument.tsx:23`). Text shapes
  never carry a picture.
- **Non-Latin**: PDF and pictures rely on the browser's fallback font (not run here);
  text shapes are UTF-8 with a BOM on the CSV; file names (N3, `pdfFilenameFor`) and `.txt`
  alignment are the damage.

## In order, if anything is to be done

1. The statement's `INV-00112`: read cells with `innerText`, or put a space before the span.
2. Walk single-root sheets one level down, so the order matches print, and keep `th`-only
   rows as headings.
3. N1, if the spreadsheet should protect identifiers from Excel.
4. N2: make the notes a `p`, or break at line boxes.
5. `wrap-anywhere` on the names; `money()` in `InvoiceDocument`; fix the `csv.ts` comment.

Every one of these changes behaviour, so none was made. `test-save-as` and
`test-statement` are the suites to run on the Mac against `next start` for any of them.

# Fixed, 2026-10-20 (cloud brief 19)

Each open item of the second pass read in the code first; all were real. On branch
`claude/brief-19-cloud-queue-oyr8zh` (the brief named `wip/printed-fixes`; the session was
started on the former and pushed there). **Not merged.**

| Item | Fix | Suite |
|---|---|---|
| Statement `INV-00112 days late` | `cellText` (`sheetFile.ts`) reads a cell with a space wherever a block starts inside it, by computed `display`; not `innerText`, which would have upper-cased every heading | `test-statement-cells` (9) |
| Single-root sheets out of order | `printedBlocks` looks inside a lone wrapper that holds a table, so the statement and the Free page read block by block; a table that becomes a block itself is read as one. Class read with `getAttribute`, so an SVG child no longer throws | `test-sheet-order` (13) |
| Free page Labour / Materials headings dropped | a `tbody` row with no `td` is read from its `th` | `test-cis-headings` (8) |
| Long unbroken names | `wrap-anywhere` on the Free page's three header names, the quote's business block (`min-w-0` too) and client, the statement's business block and client. One line each | `test-long-names-wrap` (12) |
| Excel changing 0042 / 01234567 / 12-03-56 | `sheetCell` (`csv.ts`) writes a value of only digits, dashes and slashes that Excel would change (leading zero, 16+ digits, date-like) as `="0042"`; everything else still goes through `csvCell` and its formula guard. `csvCell` itself is unchanged, so the data exports are too | `test-csv-identifiers` (31), `test-csv-safety` (+3), `test-save-as` (+1) |
| Long notes cut through a line in the PDF | `breakPoints` adds the bottom of every line of text outside a table, and drops any point a line beside it runs across | `test-pdf-line-breaks` (10) |
| `pdfName` stripping combining marks | `\p{M}` kept; `pdfName` and `tidyFileName` cut at 80 graphemes (`firstChars`, its own file because the server's PDF code and the browser's saving code both need it and neither may import the other: the build caught `documentPdf` pulling a React hook into `/api/photos/age`) | `test-file-name-marks` (15) |
| `csv.ts` comment | now says what the code does: `+44 20 ...` gets the apostrophe | `test-csv-safety` |

Each new suite proved both ways: against the old `web/src` every one fails or dies, and
the two new `test-save-as` checks fail on an old build (22/24) and pass on the new (24/24).
The seven new suites drive Chromium with no app (`sheet-dom.mjs`, `sheet-fixtures.mjs`:
the sheets' shapes copied by hand, so a sheet that changes shape needs its fixture
changed too); `CHROME` points them at a browser other than the Mac's Chrome.

Still open, outside this brief: the Free page's `£-50.00` (`formatMoney`), `IssuedInvoice`'s
client email and address not wrapping, label and value on separate CSV rows for the Free
page's dt/dd (the value is now kept as text either way), the `": "` split, plain-text
alignment for wide scripts, `pdfFilenameFor` against `tidyFileName`, WebP/HEIC in
`pagesToPdf`, and the 150-line PDF on the iPhone.
