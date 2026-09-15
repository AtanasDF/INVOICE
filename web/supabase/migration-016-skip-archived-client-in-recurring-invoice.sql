-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup file -- redefines a function only, touches no row data.
-- Same precedent as migrations 008/012/013/014/015.
--
-- Cowork's rolled-back test of migration-015 found a real gap:
-- archiving a client (the documented way to retire one, since RESTRICT
-- makes Remove impossible for a client with any history) does nothing
-- to stop generate_recurring_invoice() from continuing to generate that
-- client's recurring invoice every month, unattended -- the function
-- checks recurring_invoices.active and next_due_date, never
-- clients.archived. Unlike the delete path, this looks like it worked:
-- no error, no blocked button, just invoices that keep arriving for a
-- client the account holder specifically asked to stop billing.
--
-- Two fixes, matching Cowork's split: the app-side one (clientsStore's
-- new archive() deactivating that client's recurring invoices and that
-- supplier's recurring expenses at the same time) makes the Recurring
-- page's active/paused state honest again. This is the other half, and
-- the one that actually matters for correctness -- a backstop inside the
-- function itself, so no OTHER path that flips clients.archived (now,
-- or added later) can silently reopen the same gap. Re-adds the same
-- CREATE OR REPLACE body as migration-013, with one change: the initial
-- lookup now joins clients and skips a row whose client is archived,
-- same as it already skips one that's inactive or not yet due. A null
-- client_id (shouldn't happen in practice -- the create form requires
-- picking one -- but the column itself is nullable) is treated as "not
-- archived", since there's no client to have been archived.
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
  select ri.* into v_row
  from public.recurring_invoices ri
  left join public.clients c on c.id = ri.client_id
  where ri.id = p_recurring_invoice_id
    and ri.active = true
    and ri.next_due_date <= current_date
    and coalesce(c.archived, false) = false
  for update of ri;

  if not found then
    raise exception 'Recurring invoice % not found, not active, not yet due, or its client is archived.', p_recurring_invoice_id;
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

-- CREATE OR REPLACE keeps the function's existing grants, but restating
-- them costs nothing and keeps this file runnable standalone.
revoke all on function public.generate_recurring_invoice(uuid) from public;
revoke execute on function public.generate_recurring_invoice(uuid) from anon;
revoke execute on function public.generate_recurring_invoice(uuid) from authenticated;
grant execute on function public.generate_recurring_invoice(uuid) to service_role;
