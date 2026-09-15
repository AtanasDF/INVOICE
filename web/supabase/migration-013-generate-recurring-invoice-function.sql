-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Revised. The first run of this file (still live in the DB as of this
-- edit -- repo and DB are in sync, both still have the broken version)
-- had two defects caught in review before anything real touched it:
--   1. The insert passed tags as `'{}'::text[]`; the column is jsonb, so
--      the INSERT raised "column tags is of type jsonb but expression
--      is of type text[]" on every call -- PL/pgSQL doesn't plan an
--      INSERT until first execution, so CREATE FUNCTION itself
--      succeeded and this would only have surfaced on the first real
--      cron run. Fixed to `'[]'::jsonb`.
--   2. No idempotency guard against a duplicate call on the same row --
--      FOR UPDATE prevents a lost update between concurrent callers, not
--      a duplicate insert, since a second caller unblocks after the
--      first commits and re-evaluates the same WHERE against the
--      already-advanced row. Fixed by moving the next_due_date <=
--      current_date check from the route's SELECT into this function's
--      own WHERE, so a retried or overlapping call raises instead of
--      writing a second draft.
-- Safe to re-run in full -- CREATE OR REPLACE FUNCTION and the
-- REVOKE/GRANT lines below are all idempotent.
--
-- No backup file -- only creates a function, touches no table's data.
-- Same precedent as migration-008 and migration-012. Rollback is
-- `drop function public.generate_recurring_invoice(uuid);`.
--
-- Same class of bug migration-012 fixed, caught before it could ever
-- fire: /api/recurring-invoices/generate did the invoice insert and the
-- next_due_date advance as two separate calls with no transaction. If
-- the insert succeeded and the update failed, next_due_date would stay
-- in the past -- and since this runs unattended on a daily cron with
-- nobody watching, it would regenerate the same invoice every day after
-- that until someone noticed a pile of duplicate drafts.
--
-- generate_recurring_invoice() does both in one transaction: inserts
-- the draft invoice (placeholder number, same as every other draft --
-- see draftPlaceholderNumber in lib/invoiceNumber.ts; a real number is
-- only ever assigned by assign_invoice_number when it's marked sent) and
-- advances next_due_date, so either both happen or neither does.
--
-- Unlike assign_invoice_number, this is NOT scoped to auth.uid() -- the
-- cron route runs with the service-role key on behalf of every account
-- at once, with no signed-in user. It trusts the target row's own
-- user_id/client_id instead. That makes it unsafe to expose to
-- authenticated or anon: either could otherwise generate a draft
-- invoice into an arbitrary OTHER account by passing any
-- recurring_invoices id. EXECUTE is granted to service_role only.
create or replace function public.generate_recurring_invoice(p_recurring_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.recurring_invoices%rowtype;
  v_invoice_id uuid;
begin
  -- next_due_date <= current_date is checked here too, not just in the
  -- route's SELECT -- otherwise a second call on the same id (a retried
  -- or overlapping cron invocation) blocks on FOR UPDATE, then re-checks
  -- this WHERE against the row this function's own first call already
  -- advanced, still matches on id/active alone, and inserts a duplicate.
  -- The lock alone only prevents a lost update, not a duplicate insert.
  select * into v_row
  from public.recurring_invoices
  where id = p_recurring_invoice_id and active = true and next_due_date <= current_date
  for update;

  if not found then
    raise exception 'Recurring invoice % not found, not active, or not yet due.', p_recurring_invoice_id;
  end if;

  insert into public.invoices (user_id, client_id, date, number, items, notes, due_date, payment_terms, status, tags)
  values (
    v_row.user_id,
    v_row.client_id,
    current_date,
    'DRAFT-' || gen_random_uuid()::text,
    v_row.items,
    v_row.notes,
    (current_date + interval '30 days')::date,
    v_row.payment_terms,
    'draft',
    '[]'::jsonb
  )
  returning id into v_invoice_id;

  update public.recurring_invoices
     set next_due_date = (v_row.next_due_date + interval '1 month')::date
   where id = p_recurring_invoice_id;

  return v_invoice_id;
end;
$$;

-- As found on assign_invoice_number: `revoke all ... from public` alone
-- leaves the default per-role grants Supabase adds at creation time
-- (anon, authenticated, service_role each get their own explicit
-- EXECUTE). Revoke both anon and authenticated explicitly this time --
-- neither should ever be able to call this one, only service_role.
revoke all on function public.generate_recurring_invoice(uuid) from public;
revoke execute on function public.generate_recurring_invoice(uuid) from anon;
revoke execute on function public.generate_recurring_invoice(uuid) from authenticated;
grant execute on function public.generate_recurring_invoice(uuid) to service_role;
