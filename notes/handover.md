## Waiting on Atanas (2026-09-25)

1. **HMRC production credentials.** The application is complete except one field:
   "Identify your organisation" wants a UTR. His company **FRAGOV LTD** (registered
   15 March 2024) is dormant and he is not VAT registered, so the Corporation Tax UTR is
   the one to use — **requested 25/09, HMRC post it within 15 days** to the registered
   office. HMRC hold the application for **six months**, so nothing is at risk. When it
   arrives: the question is
   `/developer/submissions/74bf912f-a069-48d8-ab7d-f04dc6d48d5f/question/cbdf264f-be39-4638-92ff-6ecd2259c662`,
   then Save and continue, then submit. Review takes up to 10 working days.
   **The Developer Hub session times out fast** — expect to sign in again each time.
   The production application is named **FRAGOV LTD** to match the organisation; that is
   free of cost because the API is application-restricted, so no customer ever sees it.
2. ~~Two migrations on branches~~ — **both run and verified 2026-09-25, both merged.**
   038 (`vat_checks`) and 039 (`clients.reverse_charge_end_user`). Verified against the live
   catalog rather than the success message: the FK's ON DELETE is SET NULL, `authenticated`
   has INSERT and SELECT only, `anon` appears nowhere, and the two existing client rows were
   untouched.
3. **Move the project off the iCloud Desktop — the harness no longer stands in the way.**
   It used to: 87 copies of `/Users/nasko/Desktop/INVOICE` across 39 files, 38 of them in
   `harness/`, so the move broke every suite at once. They now ask `harness/repo.mjs`, which
   works the answer out from its own `import.meta.url`; the two tsconfigs use paths relative
   to themselves, and `run-all.sh` derives `APP` from where the script is. **Verified by
   copying the project to a different path and running from there**, not by reading the
   diff. So the move is now: move the folder, and nothing else. (The `web/.next` build and
   `harness/gen` are rebuilt anyway, and `web/node_modules` may need a fresh `npm install`
   if anything in it holds an absolute path.) Raised from a preference to a real risk on
   2026-09-25: iCloud duplicated two git **ref** files and `git fetch`/`git pull` both died
   on `fatal: bad object refs/heads/main 2`. Nothing was lost and it is fixed (the strays
   were moved to `~/icloud-git-strays-2026-09-25/`, both pointing at a commit already in
   main), but 31 more strays sit in `.git` and the next one may not be harmless. A move to
   `~/Developer/INVOICE` was started on 2026-09-23 and stopped by him before anything moved.
4. ~~**Check Settings → VAT registered is OFF**~~ **DONE 2026-09-26: it already
   was.** Hidefield (`fragov@hidefield.co.uk`) reads `vat_registered = false` with
   0 invoices. The account with VAT on is the gmail TEST account, which is a
   sandbox. This sat here as the urgent item for days and was one query away.


# Handover

**Top of the file, 2026-09-23, end of the long night.** What is live, what is built and
switched off, and what is waiting on Atanas.

**Live and working:** sign-up emails (Resend SMTP into Supabase, six-digit codes, 10-minute
links) · colour themes and dark mode, following the phone by default · the dashboard rebuilt
round the scanner · the front door · Turnstile, invisible, verified in a real Chrome ·
Companies House lookups, verified against real data · flyer tracking · privacy and terms ·
offline page, 404, global-error.

**Built, tested, and deliberately doing nothing** until an environment variable says so:
- `SCAN_LIMITS` — the scan limits and the once-a-month top-up (migration-036 is applied).
- `NEXT_PUBLIC_INVITES` — invite a friend (migration-037 is applied).
- `PHOTO_AGEING` / `PHOTO_AGEING_DELETE` — letting old photographs go. Two switches on
  purpose; read a dry-run report before arming the second. `notes/ageing-photos-design.md`.
- `NEXT_PUBLIC_HELP_CHAT` — the help chat (2026-09-25), the last rung of the ladder Atanas
  described. Off, and off on the **server** too: a route that answers while the feature is
  meant to be off is an open model endpoint nothing in the UI admits to. It is the first
  thing in the app that costs money every time somebody uses it with no natural limit, so
  read the fences in `src/lib/helpChat.ts` before turning it on — 40 an hour an account, 400
  overall, a six-message window trimmed server-side. `notes/help-chat-design.md`.

**Waiting on Atanas:** a trading name and address for the legal pages · business details in
Settings on Hidefield · one real scan on the live site to prove the counting · print and
scan the 106 documents on his Desktop (`Test documents - PRINT THIS.pdf`, 74 pages; the
answer key is `harness/expected.json`, so the readings can be scored rather than eyeballed)
· whether the project moves off the iCloud Desktop · **the 47 stale duplicate suites in
`harness/`** (see below) · optionally an Ideal Postcodes key, whose free trial is 50
credits, if Royal Mail's full address file is wanted over the free lookup.

**Two things not to relearn the hard way.** Resend does not log SMTP relays in its Emails
list, so an empty list there is not a failure. And the built-in browser pane cannot solve a
Turnstile challenge — it renders and hangs with no error; test that one in a real Chrome or
not at all. Each cost about an hour.

---

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
- **Launch is about 14 October 2026** — `notes/launch-plan.md` is the three-week plan and
  tomorrow's list. The limits system is the one thing that cannot slip.
- **Read next, in this order:** `CLAUDE.md` (the rules — read it fully, it is not
  optional), the top entry of `SESSIONS.md`, then `notes/tonight-list.md` (87 items,
  67 done) and `notes/claude-notes.md`.

## Sign-up emails: working, proven 2026-09-23 03:04

**Proven.** A real sign-up as `atanas@lurra.co.uk` produced the confirmation email from
`Invoiceover <accounts@invoiceover.com>`, in our own wording, at 03:04. Resend's Emails
list never showed it: **Resend does not log SMTP relays there**, only REST API sends. Do
not read an empty Resend list as a failure again.

- Custom SMTP is on in Supabase: `accounts@invoiceover.com`, "Invoiceover",
  `smtp.resend.com`, port **587**, username `resend`. Atanas created the Resend key
  "Supabase auth" and pasted it himself; nobody has read it, and the box reads empty by
  design, so **do not re-save that form** — saving it again can clear a key that cannot be
  read back.
- All four templates (`web/supabase/email-templates/`) are pasted into Supabase and were
  verified by reloading each page.
- "Confirm email" was already on. URL configuration was already right.
- **The 8-digit bug, fixed the same hour.** The first real email carried an 8-digit code
  while `SignInCard` refuses anything that is not exactly 6 (`token.length !== 6`), so no
  one could ever have typed it in. Supabase now issues **6** digits with an **86400**-second
  expiry, matching both the app and the wording of the emails; saved and verified by
  reloading the panel. At his ask the expiry then came down to **600 seconds (10 minutes)**
  and the three emails that mentioned a time were reworded to match, in the repo and in
  Supabase. He first asked for one minute; the email itself can take 20-40 seconds to
  arrive, so that would have cost real sign-ups — 10 minutes was the agreed floor. That panel is separate from the SMTP form, so saving it is safe.
- Port is **587**, not the 465 of item 7a. It works, so it stays: changing it means
  re-saving the SMTP form, which could clear the key.

## Waiting on Atanas, nobody else can do these

**47 stale duplicate suites in `harness/`, his call to remove** (found 2026-09-24). Files
prefixed `cp-`, `int-`, `qux-`, `main-`, `main3000-`, `run-` and `dbg-` are older copies of
real suites, made when they ran against hand-built servers on their own ports. They are
tracked in git, they are not in `run-all.sh`, and nothing runs them. They are worse than
dead weight: they still carry `new Date().toISOString().slice(0, 10)`, the exact bug the
whole of `todayISO()` exists to fix, so anyone grepping the harness finds the wrong pattern
first. Nothing in this project is deleted without him saying so, so they stay until he does.


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
