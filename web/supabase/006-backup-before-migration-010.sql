-- Run this FIRST, before migration-010. business_profile was last backed
-- up before migration-009 and invoices has never been backed up on its
-- own before (it's only ever had a jsonb items column added, never a
-- constraint) -- this takes fresh snapshots of both.
--
-- Only reads the existing tables and creates new ones next to them. Never
-- touches business_profile or invoices themselves. Locked down with RLS
-- immediately.

create table public.business_profile_backup_20260915_2 as table public.business_profile;
alter table public.business_profile_backup_20260915_2 enable row level security;

create table public.invoices_backup_20260915 as table public.invoices;
alter table public.invoices_backup_20260915 enable row level security;

-- To restore from either snapshot later (only if something actually
-- breaks -- this does not run automatically):
--   truncate public.business_profile;
--   insert into public.business_profile select * from public.business_profile_backup_20260915_2;
--
--   truncate public.invoices;
--   insert into public.invoices select * from public.invoices_backup_20260915;
--
-- No rush to remove these once migration-010 is confirmed working:
--   drop table public.business_profile_backup_20260915_2;
--   drop table public.invoices_backup_20260915;
