-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 015-backup-before-migration-030.sql first and check it.
--
-- The Companies House number of the company behind a client or supplier,
-- kept when one is picked from the register. It was being remembered on
-- the device (localStorage) because clients had nowhere for it, which
-- meant a phone that had never seen the contact fell back to matching by
-- name -- and two companies can share a name. On the row it belongs to,
-- every device checks the right company, and it is what an invoice needs
-- when the customer is a limited company.
--
-- Additive: one nullable column, no backfill, no existing value changes.
-- Format is eight characters (digits, or two letters and six digits, as
-- Scottish and Northern Irish numbers are written); null means not known.
-- Safe to re-run.

alter table public.clients add column if not exists company_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clients'::regclass and conname = 'clients_company_number_check'
  ) then
    alter table public.clients add constraint clients_company_number_check
      check (company_number is null or company_number ~ '^[A-Z0-9]{6,10}$');
  end if;
end $$;

-- clients_owner_all is FOR ALL on the table, so the new column is covered
-- by the existing policy and grants; nothing else to add.

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name='clients' and column_name='company_number';
--     -> text, YES, no default
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid='public.clients'::regclass and conname='clients_company_number_check';
--   select count(*) from public.clients where company_number is not null;  -> 0
--   Every column the rows already had, untouched, both ways (as json, minus the new key):
--     select count(*) from (select to_jsonb(b) from public.clients_backup_20260920_m030 b
--       except select to_jsonb(c) - 'company_number' from public.clients c) d;   -> 0
--     select count(*) from (select to_jsonb(c) - 'company_number' from public.clients c
--       except select to_jsonb(b) from public.clients_backup_20260920_m030 b) d; -> 0
--   Rolled back, as authenticated: the owner can set '01234567' on their own client,
--   'oops!' fails the check (23514), and another account's row is untouched.
