# Claude's working notes (published 2026-09-18)

The notes a Claude session kept privately on Atanas's Mac, rewritten here so any account
or device has them. CLAUDE.md holds the rules; SESSIONS.md holds the per-session log;
this file holds the standing facts and preferences behind them. Update a fact here when it
changes.

## Who Atanas is and how he works

- UK freelancer (GitHub AtanasDF, Mac user `nasko`); the app tracks his real finances.
- Prefers terse, comment-free code and commit messages that explain the reasoning.
- Wants design ambiguities named before anything is built on them, not guessed.
- One hard limit: never delete data, records, files or tables; flag and wait.
- Improvements to anything that looks poor need no permission.
- Wants everything pushed to GitHub at the end of every session, and a session log kept
  as work progresses, because he works from his phone and from cloud sessions.
- Reads short answers best; give steps one at a time when guiding him through a UI.

## Standing process

- Migrations: numbered backup file + numbered migration in `web/supabase/`; backup
  verified by content in both directions, not row counts; migrations verified by
  structure and by exercising new functions as `authenticated` in a rolled-back
  transaction. Function-only or FK-only migrations need no backup and say so.
- No DB write access from code sessions: Atanas signs into the Supabase SQL editor in a
  browser the session can drive (desktop app pane or Claude in Chrome). The editor's
  results grid is canvas-based; read it with a JS `querySelectorAll('[role="gridcell"]')`.
- Never Read `web/.env.local`; confirm keys by name with `grep -c`. Local file has EMPTY
  `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; `GEMINI_API_KEY` is present.
- Check `git log` before assuming you are alone: "Cowork" is a second Claude session that
  reviews, runs migrations and tests in rolled-back transactions; its briefs land in
  `Claude outputs/` (untracked). iCloud sync sometimes creates `name 2.ext` duplicates;
  diff before deleting.
- Keep parallel agent fan-outs small: the account usage cap has killed background runs.
  Never let agents use the shared browser tools; they navigate Atanas's sign-in tabs away.

## Verified facts

- Live Supabase (project `wecfwjxzyzzrcwbwnwpo`) is at migration-017 as of 2026-09-17:
  receipts has 26 columns; all client FKs are ON DELETE RESTRICT; `receipt_pages`,
  `create_receipt_with_pages` (security invoker, authenticated only) exist. `receipts`
  had zero rows when the migration ran. Two overlapping owner policies exist on
  `receipts` ("Users manage own receipts" and "receipts_owner_all"); harmless.
- About 15 RLS-locked `*_backup_*` tables exist. Never drop them; Atanas's call.
- `business_profile.invoice_next_number` is 357358 and unanchored (test data cleared).
- OpenCV: never `import()` `@techstark/opencv-js` (its `module.exports` is a Promise and
  Turbopack's interop rejects it). It is served from `public/vendor/opencv-5.0.0.js` via
  a prebuild copy and loaded as a script. Auto-capture gates: MIN_CONTOUR_AREA 0.06,
  MIN_COVERAGE 0.09, STABLE_MS 600, STABLE_TIMEOUT_MS 2500, SHARPNESS_FLOOR 12,
  SHARPNESS_RATIO 0.7, tick 150ms. Atanas confirmed the iPhone scanner works (2026-09-18).
- Gemini: `gemini-3.5-flash-lite` via `@google/genai` Interactions API; `thinking_level`
  must be lowercase; the SDK retries 429/5xx five times by default, so the client is
  built with a 40s timeout and two attempts. Free tier allows about 20 requests a day per
  model; billing is a £20 prepaid balance on Google billing account
  `015649-CDA16A-FCF373`, activated 2026-09-18. Roughly a third of a penny per document;
  Claude Opus 5 is a few pence.
- Main scanner defaults to Claude with a signed-in "Read with" switch (localStorage
  `scan-engine`); the Free invoice page defaults to Gemini for visitors.

## Decisions

- Scanned supplier invoices and credit notes are expense documents in `receipts`, never
  in the sales `invoices` table; credit notes stored negative.
- App-wide wake lock kept at Atanas's request.
- Anonymous scanning is Gemini-only; the in-memory rate limiter is a known gap.
- The Free invoice page is public and browser-only; "Save to your account" carries a
  localStorage draft through sign-up into `/invoices/new`.

## References

- Live app: https://invoice-omega-rust.vercel.app (Vercel project `atanas-df/invoice`,
  auto-deploys `main`).
- Supabase SQL editor: https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
- Google AI Studio keys and billing: https://aistudio.google.com/app/api-keys
- PRs so far: #1–#5 earlier features, #6 scanner rework, #7 free invoice page.

## Queued work (Atanas's list, 2026-09-17)

1. Accuracy pass on both engines with real documents; decide whether Gemini can carry all.
2. Shared rate limiter for `/api/invoice-template`.
3. Research follow-ups: duplicate detection on save, line-total check, supplier memory,
   camera coaching text.
4. Receipt images to Supabase Storage before volume grows.
5. Paywall: whole app paid except the Free invoice page; design conversation first.
6. A second research pass on ten more apps (FreshBooks, Invoice Ninja, Bonsai, ANNA,
   Tide, Countingup, Square Invoices, Stripe Invoicing, SumUp/Zervant, Crunch) for
   features worth adding; keep it lean.
7. Atanas's side: Safari camera permission, business details in Settings, invoice
   counter, Resend key, Cloudflare Worker deploy, revoke the old Mapbox token.
