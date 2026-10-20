# Every API route, audited — 2026-10-20 (cloud, brief 9)

Branch `wip/api-routes-audit`. All 25 routes under `web/src/app/api` were read in full.
Each finding was confirmed in the code before anything changed. Fixes touch only route
files and one harness stand-in. `harness/test-api-routes.mjs` (126 checks, source-reading,
runs anywhere) holds each one. **Run against the code before the fixes it fails 28 checks,
which are exactly the fixed holes, and on this branch it passes 126/126.**

Checked here: tsc, eslint and `npm run build` clean (the build had placeholder Supabase
values). test-api-routes 126/126, test-route-guards 57/57 against `next start`,
test-help-chat-live 25/25, test-inbox-ingest 27/27, test-audit-guards 90/90, test-crons
10/10, test-scan-budget 81/81, test-error-report 33/33, test-utc-today 18/18,
test-rls-audit 5/5. Not run: the browser suites (test-send-document, test-feedback,
test-price-finder, test-copy-document). These pages call the routes changed here, and they
need Chrome. Run them on the Mac before merging.

## The table

Who: **S** stranger, **U** signed in (bearer checked with `auth.getUser`), **C** cron secret,
**W** webhook secret. "Gate first" means the check runs before any model, Resend, HMRC or
service-role work. "mem" is a count kept in one serverless instance's memory. It is lost on a
cold start and each instance keeps its own. "db" is `allowShared`, the shared counter in the
database (migration-018). Body: Vercel refuses anything over 4.5 MB before the handler runs,
so every route has that ceiling. The column gives any tighter limit.

| Route | Who | Gate first | Rate limit | Body limit | Error text | Service role scoped | Email / paid API cap |
|---|---|---|---|---|---|---|---|
| scan | U | yes | mem burst 150-300/h user, 600-3000 global; **db allowance** (`allowScans`/`spendScans`) | 20 pages, 10 MB each | own words + RELAYED only | no service role | model: db allowance |
| contact-scan | U | yes | mem 60/h user, 300 global; db allowance | 1 file, 10 MB | own + RELAYED | none | model: db allowance |
| invoice-template | U | yes | db 60/h user, 200 global; db allowance | 3 pages, 3.5M chars | own + RELAYED | none | model: db allowance |
| invoice-from-text | U | yes | **was mem 60/h user, no global → db 60/h user + 300/h global** | 2,000 chars | own + RELAYED | none | Claude: **fixed (1)** |
| price-guide | U | yes | **was mem 120/h user, no global → db 120/h + 1,200/h global** | 300 chars | own + RELAYED | none | Gemini: **fixed (1)** |
| help-chat | U (and 404 while off) | yes | **was mem 40/h user, 400 global → db** | 600-char question, 6-message window | own words | none (writes as the user) | Gemini: **fixed (1)** |
| send-invoice | U, confirmed email | yes | **was mem 30/h, 60 global, 100/day → db, same numbers** | 4M-char PDF, checked `%PDF-`/`%%EOF` | own words; Resend's text logged only | none | Resend: **fixed (2)** |
| send-document | U, confirmed | yes | **was mem 10/h, 60 global, 30/day → db** | 4M-char PDF | own words | none | Resend: **fixed (2)** |
| quote-requests/send | U, confirmed | yes | **was mem 30/h, 60 global, 100/day → db** (shares send-invoice's keys) | id + address only; everything else read from the owner's rows as the owner | own words | none (RLS) | Resend: **fixed (2)** |
| feedback | U | yes | **was mem 20/h user, no global → db 20/h + 200/h global** | 5,000 chars | own words | none (RLS) | Resend to FEEDBACK_TO: **fixed (3)** |
| vat-check | U | yes | db 30/h user, 300 global | query string | flags only | none | HMRC: db |
| inbox/ingest | W | yes | **was db 60/h per mailbox per REQUEST → per DOCUMENT read** | 5 attachments, 10 MB each | **wrote provider/Postgres text into the owner's row → fixed (4)**; raw text to the Worker only | yes, every write uses the token's user_id | model: **fixed (4)** |
| reminders/send | C | yes | cron | none | raw Postgres text, to the cron only | per invoice's owner, by design across all | Resend: one claim per (invoice, kind) |
| notifications/check | C | yes | cron | none | raw, cron only | all users by design | push only |
| notifications/weekly | C | yes | cron | none | raw, cron only | all users by design | push only |
| recurring-invoices/generate | C | yes | cron | none | raw, cron only | all due rows by design | none |
| photos/age | C | yes | cron, plus two switches, both unset | none | fixed sentence | `.eq("user_id", owner)` on every write | Resend: once per owner per run |
| error | S, by design | n/a | db 20/h per IP, global; email 1/h per fault | `tidyReport` bounds every field | always `{ok:true}` | none | Resend: db-capped |
| address-search | S, open | n/a | mem 60/5 min per IP; db per bucket; paid lookup only for U, db-capped 4 ways | 100 chars | own words | none | Ideal Postcodes: db, U only |
| company-search | S, open | n/a | mem per IP; db, separate anon / signed-in buckets | 80 chars | flags only | none | Companies House (free): db |
| company-check | S, open | n/a | db per IP + **one global bucket shared by strangers and accounts (5, not fixed)** | 80 chars | flags only | none | Companies House (free): db |
| invoice-links/seen | S, link token | n/a | mem 30/30 min per IP, 1 per token per IP | token regex | always `{ok:true}` | yes, `.eq("user_id", view.user_id)` | push only |
| quote-links/seen | S, link token | n/a | same | token regex | always `{ok:true}` | yes | push only |
| quote-links/respond | S, link token | n/a | mem 10/h per IP; the DB function accepts one answer | token regex, 120-char name | own words | yes | push only |
| quote-requests/respond | S, link token | n/a | mem 10/h per IP; the DB function accepts one answer | 200 prices, 2,000-char note | own words | yes | push only |

The harness guard lists (`test-route-guards.mjs`) agree with the disk: 10 signed-in, 1
webhook, 5 cron and 9 open, 25 in all. Its completeness check already fails on an unlisted
route. `test-api-routes` keeps its own classification and checks it against the disk the same
way. Its signed-in list is one longer, because it counts `help-chat` as signed in, which it is
when switched on. test-route-guards lists help-chat as open because it answers 404 while off.

## Fixed

**1. Paid model routes with no ceiling, and only a per-instance count.**
`invoice-from-text` (claude-opus-5) and `price-guide` (Gemini) counted only per account, in
memory. So any number of new accounts could spend with no overall ceiling, and on Vercel even
the per-account count reset on every cold start. `help-chat` claimed "400 overall", but in
memory that was 400 per instance. It is the one feature with no natural limit. All three now
count per account and overall with `allowShared`. help-chat's numbers are unchanged. The two
new global caps (300/h and 1,200/h) are my choice, set well above the per-account ones. **Atanas
may want different numbers.**

**2. The email caps were not caps.** `send-invoice`, `send-document` and `quote-requests/send`
kept "N an hour overall" and "N a day" in instance memory. The daily limit restarted on every
cold start, so it was not a daily limit. All three now use the database counter, with the same
numbers and the same order (hour, overall, day). One behaviour changes, on purpose: the
database counter cannot give a hit back. A send refused by the overall cap now uses up one of
that account's hourly allowance. A send refused by the daily cap uses up one hourly and one
overall. Waiting out the hourly limit still never touches the day, because the day is checked
last.

**3. Feedback had no overall cap.** Every piece is emailed to FEEDBACK_TO. The count was 20/h
per account, in memory, so a crowd of accounts could fill that inbox. Now 20/h per account and
200/h overall, both in the database.

**4. The email import.** Two holes:
- *The cap counted emails, not documents.* "60 an hour per mailbox" let up to five attachments
  through per request, so 300 model reads an hour from one leaked `u-<token>` address, and
  3,000 overall. The count now runs once per usable attachment (at least once for an email with
  nothing readable, for the row it files), before the first read. A 429 still makes the Worker
  reject the email, so the sender is told.
- *A provider's and Postgres's own words went into the owner's records.* `fileUnread` wrote
  `err.message.slice(0, 120)` into the needs-review row's notes. That could be the SDK's text,
  Gemini's own error message (`interaction.errors[0].message`) or "GEMINI_API_KEY is not set",
  and `error.message` from a refused insert. Now only the app's own RELAYED sentences go in,
  and anything else reads "the reader failed" or "it could not be saved". The raw text goes to
  the log.

The harness stand-in in `test-help-chat-live` now answers `rpc/hit_rate_limit`. Before this
change it counted every request that was not a sign-in check as model spending, so the
database counter would have turned "refused without spending anything" red.

## Found and left, with the reason

5. **company-check: one overall bucket for strangers and accounts.** The route is public by
   design (it is in OPEN_BY_DESIGN). Anybody who finds the address can spend the hour's
   `check:global` 600 searches and 300 reports, and every signed-in user then sees "busy".
   company-search already avoids this with separate anon and signed-in buckets. This fix needs
   the page to send its bearer: `components/check-company/CompanyChecker.tsx` calls
   `fetch('/api/company-check…')` with no Authorization header. The brief allows routes and
   server-side lib only. So the fix is one header in the component (`companyRegister.ts`
   already has the helper), then the same `isSignedIn` bucket split as company-search.
   Companies House is free, so this costs an outage and no money. A decision for Atanas
   follows from it: both company routes' comments still say "Public, like the Free invoice
   page", but the Free page has been behind sign-in since 2026-09-22. Whether these lookups
   should stay open is his rule ("nothing should work before the user register"), not mine.
6. **contact-scan defaults to Claude** (`?? "claude"`). Every other path moved to Gemini on
   2026-10-15. This is not a hole, because the db allowance caps it either way, but it is the
   slower engine and the other key. Left for a scanning session.
7. **inbox/ingest refuses everything without ANTHROPIC_API_KEY**, although it reads with
   Gemini first. This is an availability point, not a security one. The day the Anthropic key
   lapses, the import stops even with Gemini working. Worth changing to "either key", but that
   is a behaviour choice.
8. **The cron and webhook routes return raw Postgres text** (`invErr.message` and the like).
   Only the holder of CRON_SECRET or INBOX_WEBHOOK_SECRET can see it, which means Vercel's cron
   and our own Worker, and it is what a failed run's log is read from. Left on purpose.
   test-api-routes allows it only for those routes.
9. **The secret checks compare with `!==`** rather than a constant-time compare. A timing
   attack on a string compare through Vercel's edge is not practical, and Vercel's own cron
   examples do the same. Not worth the code.
10. **address-search's `where` branch** lets a postcodes.io 5xx throw out of the handler. In
    production Next answers a bare 500 with no stack, so nothing leaks. The mileage page then
    shows its own failure. Cosmetic.
11. **send-invoice and reminders/send hard-code `https://api.resend.com`**, while the other
    email routes honour `RESEND_API_BASE`. Not a hole. It only means no harness stand-in can
    reach those two.
12. **The public link routes (`seen`, `respond`) and the burst guards on scan and contact-scan
    stay in memory.** That is deliberate. The real fences there are the database functions
    (one answer per link, counted views) and the per-account scan allowance, and
    test-api-routes checks that the allowance is asked before the read and spent after it.
