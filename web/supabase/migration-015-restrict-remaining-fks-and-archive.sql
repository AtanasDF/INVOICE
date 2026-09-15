-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup file -- the FK section only redefines ON DELETE behaviour
-- (no row data touched, same precedent as migration-014) and the column
-- section is purely additive with a default. Same "no data touched, no
-- backup needed" precedent as migrations 008/012/013/014.
--
-- ── 1. The other two FKs referencing clients ────────────────────────
-- migration-014 only covered invoices.client_id and receipts.client_id.
-- Cowork found the other two still ON DELETE SET NULL:
--   recurring_invoices.client_id  -- worse than before 014, not better:
--     generate_recurring_invoice() (migration-013) doesn't check the
--     client still exists, so a client deleted out from under an active
--     recurring invoice would keep silently generating a client-less
--     draft every month, unattended, for a client that's gone -- the
--     exact "silent, unattended damage" shape closed everywhere else
--     this session.
--   recurring_expenses.supplier_id -- a expense losing its supplier is
--     more survivable, but leaving it as the one SET NULL among four
--     otherwise-RESTRICT client-referencing FKs invites the same
--     surprise later for no real benefit. Restricted too.
-- Same dynamic constraint lookup as migration-014 (names were never set
-- explicitly) -- safe to re-run.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.recurring_invoices'::regclass
      and confrelid = 'public.clients'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.recurring_invoices drop constraint %I', con.conname);
  end loop;

  alter table public.recurring_invoices
    add constraint recurring_invoices_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete restrict;
end $$;

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.recurring_expenses'::regclass
      and confrelid = 'public.clients'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.recurring_expenses drop constraint %I', con.conname);
  end loop;

  alter table public.recurring_expenses
    add constraint recurring_expenses_supplier_id_fkey
    foreign key (supplier_id) references public.clients(id) on delete restrict;
end $$;

-- ── 2. Archive, so Remove isn't a button that only ever errors ──────
-- With all four FKs now RESTRICT and no archive path, Remove permanently
-- fails for any client with real history -- which is most of them, once
-- an account has been used for a while. An archived client keeps every
-- record intact and drops out of client/supplier pickers on new
-- records, while Remove stays available (and working) for the clients
-- that genuinely have no history at all.
alter table public.clients add column if not exists archived boolean not null default false;
