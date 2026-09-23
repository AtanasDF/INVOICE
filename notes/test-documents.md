# A set of fake documents to scan

Atanas, 2026-09-23 03:3x: a file with every kind of invoice and receipt there is, made up
rather than real — "you can create a fake one, obviously, and right there it's a fake. It's
going to be used just for trials and scans. So I can also print and you can try and scan
them all."

**Every sheet is marked FAKE on its face**, in print, not only in the filename. These exist
to be photographed and read by the scanner, and a document that could be mistaken for a
real one has no place in an accounting app's test folder.

## Settled: at least 100, and a failure is the point

"I want to scan at least 100 different documents and see how that goes. If a scan doesn't
go through we are learning from it."

So: **100 sheets minimum**, chosen so that each one is hard in a different way, and the set
grows whenever a real document defeats the reader. The run is not marked out of 100 — a
document the reader cannot manage is the most valuable sheet in the pile, because it names
a weakness nobody knew about. Every failure gets written down with *what* it got wrong, not
just that it failed, and that list is what the next scanner work is built from.

## The kinds that actually break a reader

- **Thermal till receipt** — narrow, faint, curled, no VAT breakdown, the total not labelled
- **Trade counter invoice** — Travis Perkins/Screwfix shape, account number, many lines
- **Handwritten invoice** — a builder's pad, sloped writing, a total that does not add up
- **Proper VAT invoice** — VAT number, mixed 20% and 0% lines, VAT shown per rate
- **CIS invoice** — labour and materials split, 20% or 30% deducted
- **Fuel receipt** — litres and pence per litre, the pump number where the total should be
- **Parking, toll, congestion charge** — tiny, no supplier address
- **Restaurant bill** — service charge, an optional tip line
- **Credit note** — negative, and the app must store it negative
- **Foreign currency** — euros, dollars, a rate that must be fetched
- **Multi-page invoice** — a total only on the last page
- **Several documents on one sheet** — two receipts photographed side by side
- **Damaged** — creased, torn corner, coffee stain, half in shadow
- **Bad photography** — at an angle, too far, motion blur, a flash blowing out the middle
- **A statement, not an invoice** — which the reader should *refuse* to file as a bill
- **Dates that fight** — 03/04/2026 (day-first, UK), a US-style date, a date with no year

## Built 2026-09-23 — 106 documents in 24 designs

**The first attempt was rightly rejected** ("these are more or less the same"): a hundred
documents that were all one document underneath, same header, same table, same totals
block. Real paper differs in *layout* far more than in wording, so the generator was rebuilt
the other way round — a library of visually unrelated designs first, content poured in
second. The 24: coloured band, logo mark left, circle mark right, bare minimal, boxed form,
zebra stripes, continental (Dutch and German, IBAN and BIC), dot matrix on tractor feed with
sprocket holes, carbon copy in blue on yellow, handwriting on a lined pad, handwriting on
squared paper, green-bar ledger, till roll with barcode, wide till roll with a QR block,
card terminal slip, printed email, diagonal PAID/OVERDUE/COPY stamp, landscape gridlines,
formal letterhead, grey photocopy at an angle, fax with the transmission line, three-column,
spreadsheet gridlines, booking confirmation, A6 docket.

`harness/gen-test-documents.mjs` makes them: `documents.pdf` (71 A4 pages, print it),
`expected.json` (what a correct reading looks like, keyed by the id printed at the foot of
every sheet) and `index.md` (the table of what each one is and what makes it hard). The PDF
and its HTML are gitignored — they regenerate in seconds — while the key and the index are
kept, because they are what gets read and annotated.

Sizes are the real ones: a till receipt is 80mm wide and a parking ticket 62mm, because
that narrowness is half of what makes them hard. Small ones are laid several to a page with
dashed lines to cut along; A4 documents get a page each.

**A bug worth remembering:** the first run printed every VAT figure a hundred times too
large, on the sheets as well as in the answer key, from a missing division inside `vatOf`.
It was caught by reading the key rather than by any test. If this generator grows, check
that net + VAT equals the total for every document before printing anything.

## How they get made

The harness already generates synthetic camera clips (`harness/gen-*.py`), so the same
approach makes printable sheets: generated to PDF at A4, one document per page, so Atanas
can print the lot and photograph them with a real phone in real light — which is the only
test that counts. They belong in the repo beside the harness, and the generator is kept so
the set can be regrown.

## Why it is worth the day

Everything the scanner does today has been proven against clips made by the same hand that
wrote the scanner. A printed pile, photographed on a real phone, is the first honest test —
and it is the cheapest possible way to find out what breaks before a real tradesman does.

`harness/shot-preview.mjs` crops any document out of the pile to a PNG
(`node shot-preview.mjs <outdir> D-009 D-011 ...`), which is how the designs were checked
without printing anything.

## Marking the results

`node check-scans.mjs scanned.json` compares what the reader made of each sheet against
`expected.json` and prints **what it got wrong**, not just that it failed — with a tally by
field and by design, because one document failing is an anecdote and six of one design
failing is the next piece of work. `--md` writes it as a table to keep.

It is deliberately forgiving where being strict would bury the real failures: "Travis
Perkins Ltd" matches "Travis Perkins", `£1,234.50` matches `1234.5`, and a date in any
order is compared as a day rather than as text. A sheet whose id is not in the key is
reported rather than ignored, and everything not yet tried is listed.
