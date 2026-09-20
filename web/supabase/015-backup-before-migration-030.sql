-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-030. That migration adds one nullable
-- column to clients (the Companies House number of the company behind a
-- client or supplier), so the table gets a snapshot before anything
-- touches it.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches clients itself. Locked down with RLS immediately.

create table public.clients_backup_20260920_m030 as table public.clients;
alter table public.clients_backup_20260920_m030 enable row level security;

-- Check it by content, both ways, right after the snapshot and BEFORE
-- migration-030 adds the column (each must return 0):
--   select count(*) from (select * from public.clients except select * from public.clients_backup_20260920_m030) d;
--   select count(*) from (select * from public.clients_backup_20260920_m030 except select * from public.clients) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the column is additive, so undoing migration-030 means
-- clearing it on the rows that existed before (nothing is deleted):
--   update public.clients c set company_number = null
--   where exists (select 1 from public.clients_backup_20260920_m030 b where b.id = c.id);
