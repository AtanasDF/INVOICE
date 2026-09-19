-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 013-backup-before-migration-027.sql first and check it.
--
-- CIS on the account's own invoices, as the Free invoice page already has:
-- a subcontractor's invoice shows the deduction the contractor will take
-- off the labour (20% registered, 30% not) and the amount they'll actually
-- pay. cis_rate is the rate the invoice was made out with; null means not
-- a CIS invoice. Which lines are labour and which materials lives in each
-- line of items (jsonb, "kind"), so no change there. The tax estimate
-- counts the deductions as tax already paid.
--
-- Additive: one nullable column and a check on it. No existing row changes
-- (every invoice stays null, not CIS). Safe to re-run.

alter table public.invoices add column if not exists cis_rate smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoices'::regclass and conname = 'invoices_cis_rate_check') then
    alter table public.invoices add constraint invoices_cis_rate_check check (cis_rate is null or cis_rate in (20, 30));
  end if;
end $$;

-- Verify afterwards:
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'invoices' and column_name = 'cis_rate';
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'invoices_cis_rate_check';
--   select count(*) from public.invoices where cis_rate is not null;   -- 0
-- Exercise as authenticated in a block that ends in raise exception (rolls
-- back): insert a draft with cis_rate 20 (works), update it to 25 (refused
-- by the check), read it back through RLS as its owner.
