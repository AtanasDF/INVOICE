# A set of fake documents to scan

Atanas, 2026-09-23 03:3x: a file with every kind of invoice and receipt there is, made up
rather than real — "you can create a fake one, obviously, and right there it's a fake. It's
going to be used just for trials and scans. So I can also print and you can try and scan
them all."

**Every sheet is marked FAKE on its face**, in print, not only in the filename. These exist
to be photographed and read by the scanner, and a document that could be mistaken for a
real one has no place in an accounting app's test folder.

## The ambiguity, named rather than guessed

"Every single invoice and every single receipt you find in the world" cannot be built and
would not help if it were. What makes the scanner fail is not the *number* of documents but
the *kinds* of difficulty. A useful set is perhaps **50 sheets chosen so that each one
breaks something different**, and it can grow whenever a real document defeats the reader.
To agree with him before building.

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
