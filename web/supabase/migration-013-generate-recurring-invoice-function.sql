-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
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
  select * into v_row
  from public.recurring_invoices
  where id = p_recurring_invoice_id and active = true
  for update;

  if not found then
    raise exception 'Recurring invoice % not found or not active.', p_recurring_invoice_id;
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
    '{}'::text[]
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
