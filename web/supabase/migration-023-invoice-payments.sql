-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this only creates a new table (invoice_payments), its
-- constraints, an ownership trigger and its owner policy; no existing table
-- is altered. Safe to re-run.
--
-- Money received against a sales invoice. Until now "partially paid" was a
-- status with no amount behind it, so reminders skipped part-paid invoices
-- and the dashboard counted their full value as owed. The app sets the
-- invoice's status from these rows (paid once the balance reaches zero).
-- invoice_id is ON DELETE RESTRICT: an invoice with money recorded against
-- it can't be removed out from under its payments.

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  date date not null default current_date,
  amount numeric(12, 2) not null,
  method text,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass and conname = 'invoice_payments_amount_check') then
    alter table public.invoice_payments add constraint invoice_payments_amount_check check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass and conname = 'invoice_payments_method_check') then
    alter table public.invoice_payments add constraint invoice_payments_method_check
      check (method is null or method in ('bank', 'card', 'cash', 'cheque', 'other'));
  end if;
end $$;

-- FK checks bypass RLS: a payment may only be recorded against the owner's
-- own invoice.
create or replace function public.invoice_payments_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.invoices where id = new.invoice_id and user_id = new.user_id) then
    raise exception 'A payment can only be recorded against one of your own invoices.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger invoice_payments_same_owner
  before insert or update of invoice_id, user_id on public.invoice_payments
  for each row execute function public.invoice_payments_same_owner();

alter table public.invoice_payments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments' and policyname = 'invoice_payments_owner_all') then
    create policy invoice_payments_owner_all on public.invoice_payments
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Supabase's default privileges give anon and authenticated everything on a
-- new table. The owner can correct a payment entered by mistake, so delete
-- stays; anon gets nothing.
revoke all on public.invoice_payments from anon;
revoke truncate, references, trigger on public.invoice_payments from authenticated;
grant select, insert, update, delete on public.invoice_payments to authenticated;

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'invoice_payments' order by ordinal_position;
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.invoice_payments'::regclass;
--     -> amount > 0, method list, invoice FK ON DELETE RESTRICT, user FK CASCADE
--   select grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--     where table_name = 'invoice_payments' and grantee in ('anon', 'authenticated') group by grantee;
--     -> authenticated DELETE,INSERT,SELECT,UPDATE; anon none
--   Rolled back: owner records a payment on own invoice, another user sees 0 and can't
--   record against it, amount 0 refused, anon refused, the invoice can't be deleted
--   while it has a payment.
