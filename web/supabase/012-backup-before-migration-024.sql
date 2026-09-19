-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-024. That migration adds invoices.
-- vat_registered and fills it in on invoices already issued, so invoices
-- gets a snapshot before anything touches it.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches invoices itself. Locked down with RLS immediately.

create table public.invoices_backup_20260919_m024 as table public.invoices;
alter table public.invoices_backup_20260919_m024 enable row level security;

-- Check it by content, both ways, right after the snapshot and BEFORE
-- migration-024 adds the column (each must return 0):
--   select count(*) from (select * from public.invoices except select * from public.invoices_backup_20260919_m024) d;
--   select count(*) from (select * from public.invoices_backup_20260919_m024 except select * from public.invoices) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the column is additive, so undoing migration-024 means
-- clearing it on the rows that existed before (nothing is deleted), and
-- putting assign_invoice_number back as it is in migration-012:
--   update public.invoices i set vat_registered = null
--   where exists (select 1 from public.invoices_backup_20260919_m024 b where b.id = i.id);
