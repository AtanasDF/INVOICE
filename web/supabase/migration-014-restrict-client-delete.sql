-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup file -- this only redefines a constraint's ON DELETE
-- behaviour, it doesn't read, write, or validate any existing row data
-- (the underlying referential-integrity check receipts.client_id /
-- invoices.client_id -> clients.id already had to hold for the existing
-- foreign keys to exist at all; only what happens at DELETE time
-- changes). Same "no data touched, no backup needed" precedent as
-- migrations 008, 012, and 013. Rollback is re-running the same drop
-- pattern below with `on delete set null` instead.
--
-- receipts.client_id and invoices.client_id were both `on delete set
-- null` -- deleting a client silently detached every receipt and
-- invoice that named them, with no warning and no trace of who they
-- used to be billed to or bought from. For a financial record that's a
-- real integrity problem, not a convenience: an invoice that forgets who
-- it was issued to is broken in a way "just re-add the client" can't
-- fix after the fact. Flagged during Cowork's review of item 1 (client/
-- receipt editing) -- a typo should be an edit, not a delete-and-lose.
--
-- Switched to `on delete restrict`: deleting a client with any receipts
-- or invoices still attached now fails instead of silently orphaning
-- them. clientsStore.remove() (lib/storage.ts) catches the resulting
-- 23503 and surfaces a plain-language message instead of a raw
-- Postgres error.
--
-- Constraint names aren't hardcoded -- looked up dynamically via
-- pg_constraint so this works regardless of what Postgres actually
-- named them (never explicitly named in the original schema/migration
-- files), and is safe to re-run: a second run just drops and recreates
-- the same restrict constraint again.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.receipts'::regclass
      and confrelid = 'public.clients'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.receipts drop constraint %I', con.conname);
  end loop;

  alter table public.receipts
    add constraint receipts_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete restrict;
end $$;

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and confrelid = 'public.clients'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.invoices drop constraint %I', con.conname);
  end loop;

  alter table public.invoices
    add constraint invoices_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete restrict;
end $$;
