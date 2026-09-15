-- Run this FIRST, before migration-009. business_profile was last backed
-- up before migration-006 and receipts before migration-007 -- both are
-- being altered again here, so this takes fresh snapshots of both rather
-- than reusing an old suffix.
--
-- Only reads the existing tables and creates new ones next to them. Never
-- touches business_profile or receipts themselves. Locked down with RLS
-- immediately.

create table public.business_profile_backup_20260915 as table public.business_profile;
alter table public.business_profile_backup_20260915 enable row level security;

create table public.receipts_backup_20260915 as table public.receipts;
alter table public.receipts_backup_20260915 enable row level security;

-- To restore from either snapshot later (only if something actually
-- breaks -- this does not run automatically):
--   truncate public.business_profile;
--   insert into public.business_profile select * from public.business_profile_backup_20260915;
--
--   truncate public.receipts;
--   insert into public.receipts select * from public.receipts_backup_20260915;
--
-- No rush to remove these once migration-009 is confirmed working:
--   drop table public.business_profile_backup_20260915;
--   drop table public.receipts_backup_20260915;
