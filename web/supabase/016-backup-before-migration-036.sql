-- Snapshot of business_profile before migration-036 adds `plan`.
--
-- 036 also creates two new tables (scan_usage, scan_topups), which need no
-- backup -- nothing exists in them to lose. This file is here only because 036
-- touches an existing table, and `CLAUDE.md` rule 2 asks for one whenever it
-- does.
--
-- Run this, verify it by content in BOTH directions (rows missing or different
-- each way must be 0), and only then run migration-036.

create table if not exists business_profile_backup_20260923 as
table business_profile;

alter table business_profile_backup_20260923 enable row level security;

-- Supabase grants anon/authenticated everything on a new table by default,
-- including one made by `create table as` (see migration-020, and 031 which
-- had to go back and revoke these across every earlier backup).
revoke all on business_profile_backup_20260923 from anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY, both directions. Both must return 0.
-- ---------------------------------------------------------------------------
-- select count(*) as missing_from_backup from (
--   select * from business_profile except select * from business_profile_backup_20260923
-- ) t;
--
-- select count(*) as extra_in_backup from (
--   select * from business_profile_backup_20260923 except select * from business_profile
-- ) t;
--
-- And the shape, which `except` alone would not catch if a column were added
-- between the two reads:
-- select count(*) from information_schema.columns where table_name = 'business_profile';
-- select count(*) from information_schema.columns where table_name = 'business_profile_backup_20260923';

-- ---------------------------------------------------------------------------
-- RESTORE, if 036 has to be undone. Commented on purpose: this overwrites
-- live rows, so it is read, understood and run by hand, never pasted whole.
-- ---------------------------------------------------------------------------
-- begin;
--   update business_profile p
--      set plan = b.plan
--     from business_profile_backup_20260923 b
--    where p.user_id = b.user_id;
--   -- or, to remove the column entirely:
--   -- alter table business_profile drop column if exists plan;
-- commit;
--
-- The snapshot itself is never dropped. Nothing in this project deletes a
-- backup table (`CLAUDE.md` rule 1).
