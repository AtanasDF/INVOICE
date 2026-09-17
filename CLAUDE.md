# Invoicer — working notes for Claude Code

Invoice and expense tracker for a UK freelancer (Atanas, GitHub AtanasDF). The data in
it is his real accounting record. Read this file before doing anything.

## Layout and stack

- `web/` — Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4
  (CSS-first, no tailwind.config), Supabase (Postgres + Auth + RLS). Run every npm
  command from `web/`.
- `worker/` — separate Cloudflare Worker for email inbox import (deploy steps were handed
  to Atanas; unconfirmed whether done).
- Live at https://invoice-omega-rust.vercel.app, auto-deployed from `main` by Vercel.
  Supabase project `wecfwjxzyzzrcwbwnwpo`.
- `scanner-research.md` — competitor research and the scanner follow-up plan.
- `SESSIONS.md` — one entry per session, newest first; read it first, append yours last.
- `web/supabase/` — `schema.sql`, numbered migrations, numbered backup files. All hand-run
  in the Supabase SQL editor; there is no migration runner.

## Hard rules

1. **Never delete anything**: not data, rows, tables (including the many `*_backup_*`
   tables), files, or user records. If something looks like it should go, flag it and
   wait. Removing code you were asked to remove is fine.
2. **Schema changes** need two files in `web/supabase/`: `00N-backup-before-migration-0NN.sql`
   (snapshot the affected table with `create table ... as table ...`, enable RLS on the
   snapshot, commented restore steps) and `migration-0NN-<slug>.sql` (additive, idempotent:
   `add column if not exists`, guarded `do $$ ... $$` blocks for constraints/policies,
   `create or replace function`, explicit grants). A migration that only creates a
   function or table, or only redefines an FK's ON DELETE, needs no backup and must say so
   in its header. Check the latest numbers in the folder first. Latest as of 2026-09-18:
   migration-017, backup 008.
3. **Verify backups by content in both directions** (rows missing or different each way
   must be 0), not by row counts. Verify migrations afterwards (columns, constraints and
   their ON DELETE, policies, function grants) and exercise new functions as the
   `authenticated` role inside a transaction that ends in `raise exception` so it rolls
   back. Never claim a migration succeeded secondhand.
4. **Schema-dependent work goes on a feature branch and does not merge before the
   migration is applied.** Schema-free work can go straight to `main`.
5. Before calling anything done: `npx tsc --noEmit`, `npx eslint .`, `npm run build`
   from `web/`, all clean.
6. Never print secret values. `web/.env.local` is not in git; confirm a key's presence
   with `grep -c '^NAME=' web/.env.local` only.
7. Ambiguity in a brief: name it and state the assumption before building on it; do not
   guess silently.
8. **Every session ends with everything committed and pushed** to GitHub (`main` or the
   feature branch), so the repo is always current for the next session, wherever it runs.
9. **Keep the session log.** Read the top of `SESSIONS.md` when a session starts; append
   an entry for your session (what shipped, decisions, what is open, gotchas) before the
   final push. It is how sessions on different devices know what the others did.

## House style

Terse, comment-free code; a comment only explains *why*. No abstractions or error
handling for cases that cannot happen. Commit messages explain the reasoning or the bug,
not the diff. Match the existing conventions: page header `h1.text-2xl.font-bold` +
`p.mt-1.text-neutral-600`; cards `rounded-xl border bg-white p-5 text-neutral-900 shadow-sm`;
primary button `rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white`;
labels `text-xs text-neutral-500` above the control; badges `rounded-full px-2 py-0.5
text-xs font-medium` with a bg-X-100/text-X-800 pair. New UI is neutral greys only.

## How the data is modelled

- `invoices` and `credit_notes` are Atanas's own **sales** invoices (sequential numbering
  via `assign_invoice_number`, status draft/sent/partial/paid). Do not mix received
  documents into them.
- Scanned supplier receipts, invoices and credit notes are **expense documents in
  `receipts`**: `document_type` (receipt | invoice | credit_note | other),
  `invoice_number`, `due_date`, `paid`, `details` jsonb, `credit_of_receipt_id`
  (composite FK with `user_id`, RESTRICT). Credit notes are stored with **negative**
  `amount` and `vat_amount`. Extra pages live in `receipt_pages` (page 1 stays in
  `receipts.image_data_url`); `create_receipt_with_pages` inserts both atomically.
  `receipts.amount` is net (ex VAT) in GBP.
- A "bill" is `document_type = 'invoice' and paid = false`; it surfaces on the dashboard
  and in the push cron from 3 days before `due_date`.
- Suppliers are `clients` rows with `kind = 'supplier'`.

## Scanning and extraction

- `src/lib/extractors.ts` — one `extractStructured()` with two engines: `claude`
  (`claude-opus-5`, strict tool schema, forced tool) and `gemini` (`gemini-3.5-flash-lite`
  via `@google/genai` Interactions API; schema converted from the Claude-strict form).
  Dates are parsed day-first server-side from the printed string
  (`src/lib/documentDate.ts`); ambiguous ones must be confirmed in the UI.
- `POST /api/scan` requires the signed-in user's Supabase bearer token; `engine` is
  optional. `POST /api/invoice-template` (used by the public Free invoice page) is
  unauthenticated: anonymous callers always get Gemini, `claude` needs a bearer token,
  limits are per instance (10/hour/IP, 200/hour global) — a shared counter is a known
  follow-up.
- Camera: `src/components/DocumentCapture.tsx`. OpenCV is **not bundled**: a prebuild
  script copies it to `public/vendor/opencv-5.0.0.js` (gitignored, immutable cache
  header) and `src/lib/opencv.ts` loads it as a script and awaits `window.cv`. Never
  `import()` the package: its `module.exports` is a Promise and Turbopack's interop makes
  the import reject. The capture screen shows "Edge detection unavailable: <reason>" on
  failure, and tapping the hint pill shows a readout (engine state, video size, ticks,
  quads, coverage, sharpness).
- iOS defaults to the in-app scanner (`scanner-mode` in localStorage; `native` opts back
  into the OS camera). `CaptureButton` is the label-wrapped capture input on the native
  path so one tap opens the camera.

## Environment variables

Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`,
`INBOX_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
Not yet set anywhere: `RESEND_API_KEY` (payment reminder emails stay inert without it).
Gemini billing is a Google AI Studio prepaid balance on billing account
`015649-CDA16A-FCF373`.

## Who else works here

"Cowork" is another Claude Code session (possibly another machine) that reviews, runs
migrations and tests DB state in rolled-back transactions; its briefs land in
`Claude outputs/` (untracked). Check `git log` before assuming you are alone. The folder
sits under iCloud Desktop sync and sometimes spawns stray `name 2.ext` duplicates; diff
them against the original before deleting.

## Open items (2026-09-18)

- iPhone in-app scanner reports "nothing to scan" on the latest build while the same
  build detects and auto-captures here against a fake camera. Next step: the readout
  screenshot from the phone (tap the hint pill), then fix from evidence.
- Accuracy pass on both engines with Atanas's real documents; decide whether Gemini can
  carry everything.
- Shared rate limiter for `/api/invoice-template`; then the research follow-ups
  (duplicate detection on save, line-total check, supplier memory).
- Move receipt images to Supabase Storage before the base64 columns grow.
- Paywall (whole app paid except the Free invoice page) — design conversation first.
- Atanas's side: Safari camera permission (aA → Website Settings → Camera → Allow),
  business details in Settings (still placeholder), `invoice_next_number` at 357358,
  Resend key, Cloudflare Worker deploy, revoke the old Mapbox token.
