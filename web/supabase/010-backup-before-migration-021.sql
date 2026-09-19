-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-021. That migration adds three nullable /
-- defaulted columns to business_profile (wording for the two new reminders
-- and the late-payment-interest switch) and widens the kind check on
-- invoice_reminders_sent to allow the two new reminder kinds. Both tables
-- get a snapshot before anything touches them.
--
-- Only reads the existing tables and creates new ones next to them. Never
-- touches the originals. Locked down with RLS immediately.

create table public.business_profile_backup_20260919_m021 as table public.business_profile;
alter table public.business_profile_backup_20260919_m021 enable row level security;

create table public.invoice_reminders_sent_backup_20260919_m021 as table public.invoice_reminders_sent;
alter table public.invoice_reminders_sent_backup_20260919_m021 enable row level security;

-- Check them by content, both ways, right after the snapshot and BEFORE
-- migration-021 adds columns (each must return 0):
--   select count(*) from (select * from public.business_profile except select * from public.business_profile_backup_20260919_m021) d;
--   select count(*) from (select * from public.business_profile_backup_20260919_m021 except select * from public.business_profile) d;
--   select count(*) from (select * from public.invoice_reminders_sent except select * from public.invoice_reminders_sent_backup_20260919_m021) d;
--   select count(*) from (select * from public.invoice_reminders_sent_backup_20260919_m021 except select * from public.invoice_reminders_sent) d;
--
-- To restore (only if something actually breaks -- this does not run
-- automatically): the columns are additive, so undoing migration-021 means
-- clearing them, and putting the old kind check back once no row uses a
-- new kind:
--   update public.business_profile set reminder_text_late = null, reminder_text_final = null,
--     reminder_late_payment_interest = false;
--   alter table public.invoice_reminders_sent drop constraint invoice_reminders_sent_kind_check;
--   alter table public.invoice_reminders_sent add constraint invoice_reminders_sent_kind_check
--     check (kind in ('before', 'due', 'after'));
