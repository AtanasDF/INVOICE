# Tonight, in order

Five things, about ten minutes. Each says what to do, what should happen, and what to
tell me if it doesn't. Nothing here deletes anything.

---

## 1. Let the routine run on its own (1 minute)

This is the one that unblocks everything else, because it lets work carry on while you're
away.

1. In the Claude app, open the session called **"Invoicer — pick the work back up
   (every 30 min)"** from the list on the left.
2. There is a permission request in it, asking to run a command. Choose the option that
   says **don't ask again**.

**Why it's stuck:** the routine was created programmatically, so it has no tool approvals,
and a 4am run has nobody to tap Allow. It starts, stops on its first command, and waits.
A run left waiting also blocks the next one, so the whole schedule stalls behind it.

**Afterwards:** if a run is still sitting there with no activity, stop it, or the schedule
stays blocked.

---

## 2. migration-031 — six backup tables anyone signed in can read (2 minutes)

**DONE 2026-09-21, and the premise was wrong.** Checked against the live database
before running: all 24 backup tables already had row level security on, and a signed-in
user or anon read 0 rows from every one (tested as those roles, rolled back). The
"no RLS" finding came from `test-rls-audit`, which reads the SQL files rather than the
database. Nothing was ever exposed. The migration was rewritten to revoke the unused
default grants on every backup table instead (a second lock, in case RLS is ever switched
off on one), run, and verified: 24/24 locked, signed-in and anon now denied outright,
service role still reads. The text below is what it said beforehand.

**This is the one with a real consequence.** `clients_backup_20260914`,
`receipts_backup_20260914`, `invoices_backup_20260914` and their `_2` twins are snapshots
of your clients, receipts and invoices from 14 September, and they have row level security
switched off. Supabase gives every new table full access by default, and RLS is what takes
it away again — those two backup files were written before that became habit. Any account
signed in to the app can read all six.

1. Supabase → your project → **SQL Editor**.
2. Paste all of `web/supabase/migration-031-lock-down-early-backups.sql` and press **Run**.
3. Paste the check query from the bottom of the same file. Every row should read
   `rls = true` and `grants = 0`.

It only takes access away: it creates nothing, changes no row, deletes nothing, and is
safe to run twice.

---

## 3. migration-032 — merging two contacts can never move a quote request (1 minute)

**DONE 2026-09-21.** Check query reads `sent_at, supplier_id, token`; as the owner, the
merge's update now plans (0 rows today, the table is empty) and an update of `prices` is
still refused with 42501, both rolled back.

Merging "Travis Perkins" and "Travis Perkins Ltd" moves the invoices, receipts, quotes and
repeating items fine, then reports *"Some rows stayed with the old record"* — every time,
even between two contacts that have never been sent a quote request. The owner is granted
update on only two columns of that table, and Postgres refuses the statement whether or
not any row matches.

1. Same SQL Editor: paste `web/supabase/migration-032-merge-quote-request-suppliers.sql`,
   press **Run**.
2. The check query at the foot should list three columns: `sent_at`, `supplier_id`, `token`.

(The app already stops the false alarm meanwhile — it looks before it writes.)

---

## 4. migration-033 and the branch — a quote re-prices itself if you register for VAT

**DONE 2026-09-21.** Column `vat_registered boolean`, nullable, no default; 0 quotes
either way; owner can read and write it. `feature/quote-vat-snapshot` merged.

Not urgent, but it decides something: **a quote you have already sent re-prices itself if
you switch VAT on.** An invoice remembers the setting it was issued under; a quote doesn't.
So a quote sent at £4,800 while you're not registered shows the customer £5,760 the day
you cross the threshold — on their own link, and on the button they tap to accept.

The fix is written and tested on the branch **`feature/quote-vat-snapshot`**, and it does
not merge until you have run its migration.

1. Run `web/supabase/migration-033-quote-vat-registered.sql` (one nullable column, nothing
   rewritten, safe to run twice).
2. Tell me, and I'll merge the branch and re-run everything.

If you'd rather leave it, nothing breaks today — you're not VAT registered yet, so there
is no wrong price to show anyone.

---

## 4b. migration-034 — deleting a deposit invoice loses the deposit

**DONE 2026-09-21.** Trigger present (before-row delete, enabled, security definer,
search_path public). Exercised as the owner, rolled back: deleting the deposit invoice of
a balanced quote is refused with 23503 and the message from the file; deleting the balance
invoice first, then the deposit, succeeds. Nothing from the exercise remained.
`feature/deposit-delete-guard` merged.

Found in the fourth review. Invoice a £1,200 job as a £360 deposit plus an £840
balance, then remove the deposit invoice (easy to do while it's unpaid — nothing stops
you): the "Less deposit" line stays on the balance invoice, so your records now ask for
£840 of a £1,200 job. The £360 is in no invoice, no turnover and no VAT return — while
the customer may still be holding the emailed copy, so the money can arrive with no
invoice behind it.

1. Run `web/supabase/migration-034-deposit-delete-guard.sql` (creates one function and
   one trigger, changes no row, safe to run twice).
2. Tell me, and I'll merge **`feature/deposit-delete-guard`**.

It blocks exactly one thing: deleting a deposit invoice that a balance invoice is still
deducting. Deleting a draft deposit invoice, or one on a quote you haven't balanced yet,
works as it does today.

---

## 4c. Redeploy the email Worker (1 minute, when convenient)

`worker/src/index.ts` gained a fallback on 2026-09-21: an HTML-only email with no
attachment used to be filed with nothing but its subject (the Worker only passed the
plain-text part on). From `worker/`: `npx wrangler deploy`. Nothing else changes; if the
Worker was never deployed in the first place, the steps in `worker/README.md` still apply.

## 5. Two things worth deciding, not doing

- **`.claude/worktrees/` is 5.4GB** of old copies of the project from finished branches,
  with 36GB free on the disk. Everything in them is in git history. I have not touched
  them. Say the word and they go.
- **Your Settings still hold placeholder business details**, and the VAT-registered switch
  is off. Reminders and invoice emails use the business name and bank details from there,
  so until they're filled in, a customer gets an invoice with nowhere to pay it. Five
  minutes on the Settings page, whenever suits.
- **(Moot, 2026-09-21: the Currys receipt is no longer in the live table — it's only in
  the 14/15 September snapshots, and the 17 September one is empty. Nothing to correct.
  The paragraph below is what stood before.)**
- **One receipt may be £91.67 too high — and only you can say.** The Currys PC World
  receipt from 14 September was saved about 75 minutes before the bug was fixed that had
  the app treat the till total as the net figure. It reads amount £549.99, VAT £91.67, so
  the dashboard counts the purchase as £641.66. If £549.99 is what you actually paid at
  the till, the amount should be £458.32 with the VAT left alone. I have not touched it:
  it's your accounting record, and "he typed the till total" is an inference, not a fact.
  The read-only check, and the correction to run only if you confirm, are at the foot of
  `Claude outputs/invoicer-backlog-brief.md`.

---

## Where your invoice numbers stand

You said you want to start at 1 for the new company. Settings holds a **Prefix** and a
**Next number**. For a bare series with no letters, clear the Prefix box and set Next
number to 1.

Clearing that box used to be a trap — it wiped the whole business profile and restarted
the series at INV-1. That was fixed today (`134a3e3`), and there is a test that fails
against the old code, so it is safe now.
