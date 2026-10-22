-- Snapshot of business_profile before migration-046 adds `payment_link`.
--
-- 046 adds one nullable column with no default and rewrites no row, so there
-- is nothing in the live data for it to damage. This file is here because it
-- alters an existing table, and CLAUDE.md rule 2 asks for one whenever a
-- migration does.
--
-- Run this, verify it by content in BOTH directions (both must return 0), and
-- only then run migration-046.

create table if not exists business_profile_backup_20261022 as
table business_profile;

alter table business_profile_backup_20261022 enable row level security;

-- Supabase grants anon/authenticated everything on a new table by default,
-- including one made by `create table as` (migration-020, 031).
revoke all on business_profile_backup_20261022 from anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY, both directions. Both must return 0. custom_categories is jsonb or
-- text[], both of which `except` compares.
-- ---------------------------------------------------------------------------
-- select count(*) from (select * from business_profile except select * from business_profile_backup_20261022) t;
-- select count(*) from (select * from business_profile_backup_20261022 except select * from business_profile) t;
-- select relrowsecurity from pg_class where relname = 'business_profile_backup_20261022';   -- true
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'business_profile_backup_20261022' and grantee in ('anon', 'authenticated');   -- no rows

-- ---------------------------------------------------------------------------
-- RESTORE, if 046 has to be undone. Commented on purpose.
-- ---------------------------------------------------------------------------
-- 046 changes no existing value, so undoing it is removing the column:
-- begin;
--   alter table business_profile drop column if exists payment_link;
-- commit;
-- The snapshot itself is never dropped (CLAUDE.md rule 1).
