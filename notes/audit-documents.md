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
