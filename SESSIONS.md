# Session log

One entry per Claude Code session, newest first. Read the top entries before starting;
append yours before the final push. Keep each entry to what changed, what was decided,
and what is left open. Dates are session dates (Europe/London).

## 2026-09-19 — Mac desktop app (Opus 5), overnight run

**Brief from Atanas (19/09, evening)**

- Scanner must read messy and handwritten documents (e.g. his brother's rough Excel invoice).
- Free page template-from-scan: keep what stays the same, next invoice number, today's date
  (editable), not a copy of the scanned invoice.
- Batch scanning: camera stays open, each capture drops into a stack, review, accept, read all.
  Template scan stays single-shot. Green fill over the document when locked on.
- Invoices / Receipts / Clients-Suppliers: camera button first, "+ Add manually" under it;
  empty-state text only when empty; remove "Show archived" from Clients/Suppliers; scan any
  document to fill a client or supplier.
- Free page: signature (draw or upload), send the invoice by email from the preview.

**Progress**

- Health check: `tsc`, `eslint`, `npm run build` clean on `main` at b70d091; live site loads;
  Atanas signed in to the app in the browser pane. `test-docs/` (gitignored) created for real
  test documents.
- Shipped to main (24b3373, 5646bfd, 8138fca): scanned template becomes the next invoice
  (number +1, today's date, Next invoice button); both extractors told to read rough and
  handwritten documents; batch scanner (stack, review, join pages, read 3 at a time, Save and
  next / Skip) with green lock-on fill; camera-first buttons on Invoices, Receipts, Clients;
  scan-to-fill for clients/suppliers via new `/api/contact-scan`; Show archived removed.
  Batch capture and review tested locally against a fake camera stream; live tests next.
- Found and fixed a pre-existing bug: every Claude read (the app's default engine) was failing,
  first on an enum the API rejects, then on strict mode's 16-nullable-field limit (scan schema has
  29). Claude now runs non-strict with the result conformed to the schema (a909165, 88adc98,
  4d81744); an interim "" workaround made Opus 5 leak tool syntax into empty fields, so it was
  dropped. Scan routes allow 300s. Live check on a synthetic handwritten invoice: Claude and
  Gemini both read vendor, number, date, total, lines and bank details correctly.
- Signature on the free invoice: draw or photo, remembered on the device (5b63563).
- Email sending: on branch `wip/email-send` (not main). PDF builds locally; needs a visual
  check, a live send, and Atanas's Resend account + sending domain + `RESEND_API_KEY`.

## 2026-09-17 → 2026-09-18 — Mac desktop app (Fable 5.1), with Atanas mostly on his phone

**Shipped to main and live**

- Scanner rework (PR #6): scanned supplier invoices and credit notes as expense documents
  in `receipts` (migration-017 + backup 008, applied and verified live), multi-page up to
  20 with `receipt_pages` and an atomic RPC, day-first date parsing with confirmation for
  ambiguous dates, supplier matching with add-in-place, rebuilt result page in the
  brief's order, line items editable but not deletable, paid / to-be-paid with a
  three-day bill reminder on the dashboard and push cron, credit notes linked to their
  invoice with a CN badge, discard, location-based guessing removed, `/api/scan` now
  requires the user's bearer token, extraction moved to `claude-opus-5` with a strict
  schema. Sales invoices list nets its credit notes and shows a CN badge.
- Free invoice page (PR #7): public, no account, three monochrome A4 layouts (classic,
  modern, compact) with VAT and CIS support, print/PDF, "Save to your account" carrying
  the draft through sign-up. Template-from-scan via the public, rate-limited
  `/api/invoice-template`. Second extraction engine: Gemini via `@google/genai`; the
  Claude/Gemini switch appears only when signed in (anonymous callers get Gemini only).
- Gemini engine switched to `gemini-3.5-flash-lite` after 3.8 Flash was overloaded and
  slow; fail-fast on quota (429/503) instead of hanging; `thinking_level` is lowercase.
- Camera: one-tap capture from every scan button on iPhone (`CaptureButton`), in-app
  scanner default on iOS, auto-capture when the page is steady and sharp, no "Use this
  photo" step, corner-bracket alignment guide, OpenCV loader fixed (it had never loaded
  anywhere: the package exports a Promise and Turbopack's interop rejected it), then
  OpenCV moved out of the bundle to `public/vendor/` with an immutable cache header and a
  dashboard warm-up, Mats reused per tick, relaxed distance/hold gates, and a tap-to-show
  diagnostic readout on the capture screen.
- `scanner-research.md` (ten capture apps, patterns adopted, follow-up plan) and
  `CLAUDE.md` (rules, data model, architecture, open items).
- Working-across-devices setup: `CLAUDE.md` rules 8–9 (push after every step, keep this
  log as you go, pull at start, `wip/` branches for unfinished work), this log, and
  `notes/claude-notes.md` (the session's standing notes, published so any account or
  device has them). The Mac session also runs an automatic 33-minute checkpoint that
  updates the log and pushes.

**Decisions**

- Received invoices never go into the sales `invoices` table.
- Credit notes stored negative so existing sums net without change.
- App-wide wake lock kept on Atanas's request despite the battery cost.
- Anonymous scanning is Gemini-only; the rate limiter is per serverless instance (known
  gap, shared counter is the follow-up).
- Google AI Studio billing: Atanas linked a Cloud trial account, then activated Gemini
  billing with a £20 prepaid top-up (account `015649-CDA16A-FCF373`).

**Verified**

- Live DB before migration-017 was at migration-016 with all client FKs RESTRICT and an
  empty `receipts` table. Backup verified by content both ways; migration verified
  (columns, constraints, RLS, grants) and the RPC exercised as `authenticated` in a
  rolled-back transaction.
- Free scanner on the live site read the synthetic test invoice correctly (Gemini
  Flash-Lite, about 5 seconds). Atanas on his iPhone: "It reads all perfect."
- The latest scanner build detects, auto-captures and reads here against a fake camera
  stream at phone width.

**Open**

- (Resolved 2026-09-18: Atanas confirmed the in-app scanner "working perfect" on his
  iPhone with the latest build; the earlier "nothing to scan" was most likely the
  previous deploy still being served.)
- Accuracy pass on both engines with real documents; shared rate limiter; research
  follow-ups; receipt images to Supabase Storage; paywall design.
- Atanas's side: Safari camera permission, business details in Settings, invoice counter
  at 357358, Resend key, Cloudflare Worker deploy, revoke the old Mapbox token.

**Gotchas met**

- The account usage cap killed background agent runs several times; keep parallel agent
  fan-outs small.
- Research agents used the shared browser pane and navigated Atanas's sign-in tabs away;
  tell agents never to use the browser tools.
- `web/.env.local` had empty `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, so
  local scanning tests need the live site or the Gemini key.
- The desktop app's safety layer refused to merge PR #7 unreviewed; Atanas merged it.

## 2026-09-15 (before this log; reconstructed from git)

Scanner iOS fixes (native camera, downscaling, safe-area, one-tap dashboard tile);
restrict client FKs and add Archive; atomic recurring-invoice generation; invoice
status lifecycle, recurring invoices and payment reminders; invoice numbering and VAT.
Migrations 010–016. Cowork's reviews caught the missed FKs and archived-client billing.

## 2026-09-13 → 2026-09-14 (reconstructed from git)

MVP, Supabase auth and schema, AI document scanner, client/supplier split, credit
notes on sales invoices, business profile, tagging, CSV/PDF exports, feedback widget,
recurring expenses, per-item receipt categories, file library, password reset.
Migrations 002–009.
