# Both readers, over the ten benchmark documents (2026-09-26)

`harness/bench-engines.mjs`, the app's own `extractDocuments` with the real keys, one
document at a time so the timings are of the engine and not of ten requests fighting each
other. Truth in `harness/bench-docs/manifest.json`. Seven fields scored per document: type,
vendor, date, total, VAT, invoice number, number of lines.

| engine | docs | median | mean | slowest | type | vendor | date | total | VAT | number | lines | all seven |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini | 10 | 4.3 s | 4.3 s | 4.8 s | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **10** |
| claude | 10 | 7.0 s | 7.1 s | 9.6 s | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **10** |

**Neither missed a single field.** Not one wrong total, date, VAT figure or invoice number
across twenty reads.

## What this settles, and what it does not

It settles the open item from 2026-09-19 — *"decide whether Gemini can carry everything"*.
On this evidence it can: same score, and **1.6× faster** on the median. Gemini is already the
default on `/scan` and the Free page, and nothing here argues for changing that. Claude
remains worth keeping as the second opinion behind `?engine=claude`.

It does **not** say the reader is good at Atanas's post. These ten are synthetic: generated
flat, square, evenly lit, at full resolution. A creased till receipt photographed at an angle
on a kitchen worktop is a different problem, and the one number that matters — how often the
reader is right on *his* paper — still needs his documents. `BENCH_DIR` points the same tool
at a folder of real ones with its own manifest; the real documents copied out on 2026-09-22
live in a session scratchpad and never in the repo.

## Why it is worth knowing anyway

Because it rules something out. When he says the scanner is slow and unreliable
(2026-09-26), this is evidence that **the reading is not the weak part**: four seconds and
no mistakes. What failed for him was the camera — a dead video element, tiles taken for
paper, the second document never re-arming — and, before any of that, thirteen megabytes
being fetched on the dashboard. Those are fixed. If scanning still disappoints after that,
the next place to look is the photograph the camera hands the reader, not the reader.
