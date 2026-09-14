-- Run this FIRST, before migration-007. receipts hasn't been backed up
-- since 001 (before migrations 003/004/005), and real data has changed
-- since then (the test-record cleanup), so this takes a fresh snapshot
-- rather than reusing an old suffix.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches receipts itself. Locked down with RLS immediately.

create table public.receipts_backup_20260914_3 as table public.receipts;
alter table public.receipts_backup_20260914_3 enable row level security;

-- To restore from this snapshot later (only if something actually breaks
-- -- this does not run automatically):
--   truncate public.receipts;
--   insert into public.receipts select * from public.receipts_backup_20260914_3;
--
-- No rush to remove this once migration-007 is confirmed working -- it
-- doesn't affect the app -- but whenever you want to:
--   drop table public.receipts_backup_20260914_3;
