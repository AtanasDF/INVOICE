# SQL functions and RLS: audit (cloud brief 10, 2026-10-20)

Branch `wip/sql-audit`. Every file in `web/supabase/` read, schema.sql through
migration-042 and backup 017. **This session cannot see the live database.** Every
finding below is from the files. Each one says where the live state could be different.
**None of the three new migrations has been run.** They are written and proved against
pglite only.

## What was checked, and how

| Check | Result |
|---|---|
| SECURITY DEFINER without a fixed `search_path` | **None.** All 40 function definitions in the folder were read. Every definer sets `search_path = public`. This is now enforced from the files by `test-migration-043`. |
| Execute grants with `authenticated`/`anon` left out of the revoke | **One hole: `generate_recurring_invoice` (041).** See H1. The rest are fine: 018, 025, 026, 028, 036, 037 and 041's other three name both roles or grant `authenticated` on purpose to a function scoped to `auth.uid()`. |
| Tables without RLS, or with weak policies | Every table has RLS on (`test-rls-audit` 5/5). The policies themselves are all `auth.uid() = user_id`. **But one column carries privilege and RLS cannot protect it: `business_profile.plan`.** See H2. |
| FKs that let one account reference another's row | **Five, all from before migration-017.** See H3. 017, 020, 022, 023, 025, 026, 028 and 038 are covered by composite keys or `*_same_owner` triggers. |
| `current_date` where `uk_today()` belongs | **None live.** 013, 016, 026 and 028 use it, but 041 replaced every one of those bodies. The `default current_date` on `quotes.date` and `invoice_payments.date` is left on purpose (041's header explains why). `test-utc-today` 18/18. |
| Functions that trust an argument they should take from `auth.uid()` | Only `generate_recurring_invoice`, and it is meant to: it is a cron function, and 013 says so. That is only a problem because of H1. `assign_invoice_number`, `create_receipt_with_pages`, `record_quote_request_response`, `take_scans`, `claim_scan_topup`, `my_invite_code` and `claim_invite` all take the user from `auth.uid()`. The service-role functions are only callable by the service role. |

## Holes found and fixed

### H1. Any signed-in account can raise a draft invoice in another account (migration-043)

**Severity:** high in kind, and it needs a leaked id to use.

migration-013 made `generate_recurring_invoice` SECURITY DEFINER and deliberately did
not scope it to `auth.uid()`. Its header says that makes it *"unsafe to expose to
authenticated or anon"*. 013 and 016 both revoked it from `authenticated`.

migration-041 re-created the function and wrote `grant execute ... to authenticated`.
That reopened what 013 had closed. With another account's `recurring_invoices.id`, a
signed-in account could:
- write a draft invoice into that account;
- advance that account's schedule by a month, so its real invoice for the month never
  appears.

Two things let it through:
- `test-migration-041` pinned `generate_recurring_invoice:authenticated` as the intended
  grant.
- The live check after 041 looked only at `anon`.

The app never calls this function as a user. Its only caller is
`/api/recurring-invoices/generate`, which uses the admin client.

- **Live-DB dependency:** 041 was run on 2026-09-26, so the grant is almost certainly
  live. Query 1 in 043's footer answers it.
- **Fix:** 043 revokes it from `public, anon, authenticated` and re-grants `service_role`.
  No backup file is needed: it changes a grant and touches no table.
- **Proved in pglite:** before 043, account A raises a draft in B's account. After 043,
  A and a stranger are refused for permission, and the service role still raises it.
  Running it twice is safe.

### H2. Any signed-in account can make itself paid (migration-044)

**Severity:** medium. It costs money: unlimited Gemini scans on the prepaid balance.

`business_profile.plan` (036) is the whole of the scan limits. A `paid` account has no
day limit and no month limit, and photo ageing keeps all of its photographs.

The app never writes `plan`: `SavableBusinessProfile` omits it. `storage.ts` also says
*"the database refuses it too"*, **and it does not.** The table has Supabase's default
grants, and the owner policy is `for all ... with check (auth.uid() = user_id)`. So
`PATCH /rest/v1/business_profile {"plan":"paid"}` with your own token works. Nothing in
the folder revokes the column.

- **Live-DB dependency:** someone could have revoked the column by hand outside the
  folder. Query 1 in 044's footer shows the table grants.
- **Fix:** a trigger, `business_profile_plan_guard`. It refuses any change to `plan` made
  as `anon` or `authenticated`, on insert as well as update. The SQL editor (`postgres`)
  and the service role still pass.
- **Why a column revoke would not work:** Postgres ignores a column-level revoke while the
  table-level UPDATE grant stands. Replacing that grant with a per-column list would
  silently break every column added later.
- No backup file is needed: it adds a function and a trigger, the precedent set by 034.
- **Proved in pglite:**
  - Before 044, an account makes itself paid.
  - After 044, a direct update and an upsert carrying `plan` are both refused with a
    readable sentence.
  - Settings' own upsert, which sends no plan, still saves, both first time and on later
    saves. Writing back the plan the account already has is not refused.
  - `setting-an-account-to-paid.sql` (as postgres) and the service role still work.
- **Once 044 is confirmed live:** update the storage.ts comment (`businessProfileStore.save`)
  to point at 044. It is left alone here so that app code does not claim a migration
  nobody has run.

### H3. Five foreign keys still let one account point at another's rows (migration-045)

**Severity:** low. It needs a leaked id, and it damages integrity rather than exposing
anything.

The rule from 017 was never applied backwards: *"FK checks bypass RLS"*. These five
references still don't check it:

| Column | References | On delete |
|---|---|---|
| `receipts.client_id` | `clients` | RESTRICT since 014 |
| `invoices.client_id` | `clients` | RESTRICT since 014 |
| `recurring_invoices.client_id` | `clients` | RESTRICT since 015 |
| `recurring_expenses.supplier_id` | `clients` | RESTRICT since 015 |
| `credit_notes.invoice_id` | `invoices` | CASCADE |

What a signed-in account could do with these:
- Attach its own rows to another account's client. Because the keys are RESTRICT, that
  client can then never be removed, and the app tells the owner the client has history
  they cannot see.
- Hang a credit note on another account's invoice.
- Learn whether any uuid exists, from whether the insert fails.

RLS still hides the other account's *contents* throughout. The pglite run showed the
RESTRICT problem directly: one cross-account receipt made B's client impossible to remove.

- **Fix:** five `*_same_owner` triggers, the same shape as 020 to 028.
  - The triggers run as the caller. Under the API, another account's row is simply not
    found. The service role (inbox import, recurring cron) is held to the same
    `user_id` match.
  - Triggers rather than composite keys, because composite keys would alter four tables
    of real records and need a backup of each.
  - No backup file is needed (the 034 precedent).
- **Existing rows are not re-checked.** An edit that leaves the column alone is not
  blocked either, so an old cross-account row cannot lock its owner out of editing it.
  Query 1 in 045's footer lists any row that already crosses accounts. It should return
  nothing, and any it does return are to be flagged, not changed (rule 1).
- **Live-DB dependency:** that query is the only way to know whether any row already
  crosses.
- **Proved in pglite:** for each of the five tables, before 045 a cross-account insert
  works. After 045:
  - inserts are refused, and so are updates where the table is edited that way;
  - the service role is refused too;
  - the account's own rows, a receipt with no supplier and the cron's own invoices all
    still save.

## Found, not fixed: decisions or notes

1. **Invite bonuses can be farmed, and the switch doesn't close it.**
   `NEXT_PUBLIC_INVITES` only hides the UI. `claim_invite` and `my_invite_code` are
   granted to `authenticated` in the live database (037). `take_scans`, also granted to
   `authenticated` and callable directly, pays the reward.
   - **How it works:** every throwaway account that claims a code and calls `take_scans(1)`
     earns the owner of that code 300 scans this month.
   - **What limits it:** each account needs a confirmed email and a Turnstile pass, and
     the scans only cost money when they are used.
   - **Fixing it means choosing a policy, so it is left for Atanas.** The options:
     - revoke `claim_invite` until invites launch (turning the feature on would then also
       need a migration, not just the env var);
     - or cap bonuses per inviter per month inside `reward_invite_if_due`.
2. **`set search_path = public` rather than `public, pg_temp`.** Postgres searches
   `pg_temp` first for tables when it isn't named. A caller who could create a temp
   table could therefore shadow `invoices` inside a definer function. Through PostgREST
   nobody can run `CREATE TEMP TABLE`, so this cannot be reached today. If a raw-SQL path
   is ever added, pin `pg_temp` last.
3. **The pre-020 owner policies have no `to authenticated`.** Those are clients,
   receipts, invoices, credit_notes, business_profile, feedback, recurring_*,
   push_subscriptions and receipt_pages. Those tables also keep Supabase's default
   `anon` grants. `auth.uid()` is null for anon, so nothing passes. It is a second wall
   that was never built, not a gap.
4. **`invoice_reminders_sent`.** `authenticated` keeps default write grants, but only a
   select policy exists. So RLS refuses every write, as intended.
5. **`claim_scan_topup`** can be called directly, once a month, for +600. That is what
   the app's button does anyway, so it is by design.
6. **`invoices.number` and `business_profile.invoice_next_number`** can be edited by
   their owner. That is a question about their own books, not a cross-account hole, and
   it is outside this brief.

## To run (Atanas, or a session with the Supabase connection)

The three migrations are independent. In each one, run query 1 of its footer first (the
before state), then the file, then the rest of the footer.

1. **043.** Check 2 must say *permission denied*. Then confirm that the next cron run
   logs no error.
2. **044.** Check 3 must refuse `plan` and let the `business_name` update through.
3. **045.** Check 1 must return 0 rows before and after. Check 3: own client OK, the test
   account's client refused.

Under rule 3, none of them counts as done until those checks have been read back.
`harness/test-migration-043.mjs` (51 checks, pglite) proves the files and is in
`run-all.sh`. If 043 is missing, it fails with three named checks.
