-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 011-backup-before-migration-022.sql first and check it.
--
-- A quote can ask for a deposit, as a percentage of its total or a fixed
-- amount (at most one of the two). Once accepted, the deposit is invoiced on
-- its own (deposit_invoice_id); the final invoice then takes the deposit off.
-- deposit_claimed guards making the deposit invoice the same way status
-- 'invoiced' guards the final one: claimed first, so a double tap or a second
-- tab can't make two. Additive, safe to re-run.

alter table public.quotes add column if not exists deposit_percent numeric(5, 2);
alter table public.quotes add column if not exists deposit_amount numeric(12, 2);
alter table public.quotes add column if not exists deposit_invoice_id uuid references public.invoices(id) on delete set null;
alter table public.quotes add column if not exists deposit_claimed boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_deposit_check') then
    alter table public.quotes add constraint quotes_deposit_check check (
      (deposit_percent is null or (deposit_percent > 0 and deposit_percent < 100))
      and (deposit_amount is null or deposit_amount > 0)
      and not (deposit_percent is not null and deposit_amount is not null)
    );
  end if;
end $$;

-- The deposit invoice must be the owner's own too (FK checks bypass RLS).
create or replace function public.quotes_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients where id = new.client_id and user_id = new.user_id) then
    raise exception 'The client on a quote must be one of your own.' using errcode = '23503';
  end if;
  if new.invoice_id is not null and not exists (select 1 from public.invoices where id = new.invoice_id and user_id = new.user_id) then
    raise exception 'The invoice on a quote must be one of your own.' using errcode = '23503';
  end if;
  if new.deposit_invoice_id is not null and not exists (select 1 from public.invoices where id = new.deposit_invoice_id and user_id = new.user_id) then
    raise exception 'The deposit invoice on a quote must be one of your own.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger quotes_same_owner
  before insert or update of client_id, invoice_id, deposit_invoice_id, user_id on public.quotes
  for each row execute function public.quotes_same_owner();

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'quotes' and column_name like 'deposit%';
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.quotes'::regclass;
--     -> quotes_deposit_check; quotes_deposit_invoice_id_fkey ... ON DELETE SET NULL
--   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'quotes_same_owner';
--     -> UPDATE OF client_id, invoice_id, deposit_invoice_id, user_id
--   Grants are table-level (migration-020), so the new columns are covered.
--   Rolled back: a deposit of 30% saves, 30% plus an amount is refused, 100% is
--   refused, another account's invoice as deposit_invoice_id is refused.
