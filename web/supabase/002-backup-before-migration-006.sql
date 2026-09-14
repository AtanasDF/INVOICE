-- Run this FIRST, before migration-006. business_profile hasn't been
-- backed up before (earlier snapshots only covered clients/receipts/
-- invoices), so this takes its own first snapshot rather than reusing an
-- old suffix.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches business_profile itself. Locked down with RLS immediately (no
-- policies = nobody can read/write it except via the SQL editor's
-- elevated connection) since a snapshot table has no need for app access.

create table public.business_profile_backup_20260914 as table public.business_profile;
alter table public.business_profile_backup_20260914 enable row level security;

-- To restore from this snapshot later (only if something actually breaks
-- -- this does not run automatically):
--   truncate public.business_profile;
--   insert into public.business_profile select * from public.business_profile_backup_20260914;
--
-- No rush to remove this once migration-006 is confirmed working -- it
-- doesn't affect the app -- but whenever you want to:
--   drop table public.business_profile_backup_20260914;
