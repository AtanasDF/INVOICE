-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-027. That migration adds invoices.
-- cis_rate, so invoices gets a snapshot before anything touches it.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches invoices itself. Locked down with RLS immediately.

create table public.invoices_backup_20260919_m027 as table public.invoices;
alter table public.invoices_backup_20260919_m027 enable row level security;

-- Check it by content, both ways, right after the snapshot and BEFORE
-- migration-027 adds the column (each must return 0):
--   select count(*) from (select * from public.invoices except select * from public.invoices_backup_20260919_m027) d;
--   select count(*) from (select * from public.invoices_backup_20260919_m027 except select * from public.invoices) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the column is additive and new, nothing existing is
-- changed by migration-027, so undoing it means clearing the column on the
-- rows that existed before (nothing is deleted):
--   update public.invoices i set cis_rate = null
--   where exists (select 1 from public.invoices_backup_20260919_m027 b where b.id = i.id);
