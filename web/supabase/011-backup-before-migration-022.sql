-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-022. That migration adds deposit columns
-- to quotes (a percentage or an amount, the deposit invoice's id, and a claim
-- flag). quotes gets a snapshot before anything touches it.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches quotes itself. Locked down with RLS immediately.

create table public.quotes_backup_20260919_m022 as table public.quotes;
alter table public.quotes_backup_20260919_m022 enable row level security;

-- Check it by content, both ways, right after the snapshot and BEFORE
-- migration-022 adds columns (each must return 0):
--   select count(*) from (select * from public.quotes except select * from public.quotes_backup_20260919_m022) d;
--   select count(*) from (select * from public.quotes_backup_20260919_m022 except select * from public.quotes) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the columns are additive, so undoing migration-022 means
-- clearing them on the rows that existed before (nothing is deleted):
--   update public.quotes q set deposit_percent = null, deposit_amount = null,
--     deposit_invoice_id = null, deposit_claimed = false
--   where exists (select 1 from public.quotes_backup_20260919_m022 b where b.id = q.id);
