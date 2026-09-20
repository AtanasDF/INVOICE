-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-029. That migration adds three
-- nullable columns to business_profile (the registered company name and
-- number as filed at Companies House, and what the account is for), so
-- the table gets a snapshot before anything touches it.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches business_profile itself. Locked down with RLS immediately.

create table public.business_profile_backup_20260920_m029 as table public.business_profile;
alter table public.business_profile_backup_20260920_m029 enable row level security;

-- Check it by content, both ways, right after the snapshot and BEFORE
-- migration-029 adds the columns (each must return 0):
--   select count(*) from (select * from public.business_profile except select * from public.business_profile_backup_20260920_m029) d;
--   select count(*) from (select * from public.business_profile_backup_20260920_m029 except select * from public.business_profile) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the columns are additive, so undoing migration-029
-- means clearing them on the rows that existed before (nothing is
-- deleted, and the check constraint goes with them):
--   alter table public.business_profile drop constraint if exists business_profile_account_kind_check;
--   update public.business_profile p set registered_name = null, company_number = null, account_kind = null
--   where exists (select 1 from public.business_profile_backup_20260920_m029 b where b.user_id = p.user_id);
