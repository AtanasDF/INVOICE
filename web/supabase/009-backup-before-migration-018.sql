-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-018. That migration adds one nullable
-- column to clients (phone) so a scanned business card or letterhead keeps
-- its phone number. clients is referenced by invoices, receipts and the
-- recurring tables, so it gets a fresh snapshot before anything touches it.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches clients itself. Locked down with RLS immediately.

create table public.clients_backup_20260919 as table public.clients;
alter table public.clients_backup_20260919 enable row level security;

-- Check it by content, both ways, right after the snapshot and BEFORE
-- migration-018 adds a column (each must return 0):
--   select count(*) from (select * from public.clients except select * from public.clients_backup_20260919) d;
--   select count(*) from (select * from public.clients_backup_20260919 except select * from public.clients) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the column is additive, so undoing migration-018 for
-- clients means clearing it rather than replacing rows that other tables
-- point at:
--   update public.clients c set phone = null
--   where exists (select 1 from public.clients_backup_20260919 b where b.id = c.id);
