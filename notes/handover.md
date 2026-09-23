# Start here — handover for a new chat, account or machine

Written 2026-09-23 01:5x. Update the top block whenever it stops being true; this file is
the first thing a new session reads, before `CLAUDE.md` and `SESSIONS.md`.

## Where things are right now

- **Folder:** `/Users/nasko/Desktop/INVOICE`. A move off the iCloud-synced Desktop to
  `~/Developer/INVOICE` was started on 2026-09-23 and **stopped by Atanas before anything
  moved** — nothing was lost, the source was never touched. If the folder is somewhere
  else when you read this, the move happened; correct the path here and in `CLAUDE.md`.
  iCloud sync is what spawns the `name 2.ext` duplicates; 1,513 of them plus the 1.5 GB
  `web/.next` were cleared on 2026-09-23, and they will come back until the folder leaves
  the Desktop.
- **Branch and commit:** `main`, clean and pushed. Last commit `508d86f`.
- **Live:** https://invoice-omega-rust.vercel.app — Vercel deploys every push to `main`.
- **Read next, in this order:** `CLAUDE.md` (the rules — read it fully, it is not
  optional), the top entry of `SESSIONS.md`, then `notes/tonight-list.md` (87 items,
  67 done) and `notes/claude-notes.md`.

## The one thing that is open and half-finished

**Sign-up confirmation emails.** Everything at the dashboard is set; the proof is missing.

- Custom SMTP is on in Supabase: `accounts@invoiceover.com`, "Invoiceover",
  `smtp.resend.com`, port **587**, username `resend`. Atanas created the Resend key
  "Supabase auth" and pasted it himself; nobody has read it, and the box reads empty by
  design, so **do not re-save that form** — saving it again can clear a key that cannot be
  read back.
- All four templates (`web/supabase/email-templates/`) are pasted into Supabase and were
  verified by reloading each page.
- "Confirm email" was already on. URL configuration was already right.
- **Unproven:** two password resets for `atanaschoo@gmail.com` answer 200 from `/recover`
  (auth log `user_recovery_requested`, no error), but nothing appears in Resend's Emails
  list. The sender address on an email that actually arrives tells the two cases apart:
  `accounts@invoiceover.com` means it works, anything ending `supabase.io` means the key
  did not take and a fresh one is needed. **Ask Atanas to make one new account from an
  address he can read** — that is item 14 and the whole answer.
- Two settings still differ from the plan: port should be **465** (item 7a) and the code
  **6** digits lasting **86400** seconds (item 9a; it is 8 and 3600, while the emails say
  24 hours). Both belong in one go with a fresh key, not saved blind.

## Waiting on Atanas, nobody else can do these

Companies House API key (24) · his business details in Settings on Hidefield (42) ·
GO OUTDOORS receipt date 2012 → 2026 (46) · yes or no to the front-page picture
(`notes/front-page-picture/`) (28) · iPhone testing (48) · Safari camera permission (55) ·
the paywall conversation (56) · the deletions only he may make (61) ·
`/auto-mode-setup --request-id a66ac241-4d20-47af-a41d-331da454f35f --apply`.

## How he works — read this before the first reply

- "Always do as recommended": take the recommended option and proceed, but still show each
  step. **This does not cover his machine or anything outside the repo** — a folder move,
  a deletion, a dashboard change gets a check first. That line was learned the hard way on
  2026-09-23.
- Plain words. He is not a programmer; explain in short sentences and open the exact page
  in his Chrome rather than describing where to click.
- Never type or read a secret. He pastes keys himself. `grep -c '^NAME=' web/.env.local`
  is the only way to confirm one exists (note: this shell's grep has no BRE `\+`).
- Hidefield (`fragov@hidefield.co.uk`) is his real accounting record: never delete or
  change a row that was already there, never issue an invoice on it.
  `atanaschoo@gmail.com` is the test account.
- Nothing is ever deleted without telling him — data, rows, tables, files or users.
- Every session ends committed and pushed, with the log kept as you go, not at the end.

## Signed in on this Mac

Vercel CLI (`atanasdf`, project `invoice`) · wrangler (Cloudflare account
`5926bcf52e541589a3003ab4dee95e16`) · Supabase and Resend in his Chrome, which a session
can drive with claude-in-chrome. Supabase project `wecfwjxzyzzrcwbwnwpo`.
