-- Snapshot of quotes before migration-042 adds `sent_at`.
--
-- 042 adds one nullable column with no default and rewrites no row, so there
-- is nothing in the live data for it to damage. This file is here because it
-- alters an existing table, and `CLAUDE.md` rule 2 asks for one whenever a
-- migration does.
--
-- Run this, verify it by content in BOTH directions (rows missing or different
-- each way must be 0), and only then run migration-042.

create table if not exists quotes_backup_20261020 as
table quotes;

alter table quotes_backup_20261020 enable row level security;

-- Supabase grants anon/authenticated everything on a new table by default,
-- including one made by `create table as` (see migration-020, and 031 which
-- had to go back and revoke these across every earlier backup).
revoke all on quotes_backup_20261020 from anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY, both directions. Both must return 0.
-- ---------------------------------------------------------------------------
-- `items` is jsonb, which `except` compares fine; there is no json column on
-- quotes that would refuse it.
--
-- select count(*) as missing_from_backup from (
--   select * from quotes except select * from quotes_backup_20261020
-- ) t;
--
-- select count(*) as extra_in_backup from (
--   select * from quotes_backup_20261020 except select * from quotes
-- ) t;
--
-- And the shape, which `except` alone would not catch if a column were added
-- between the two reads:
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'quotes';
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'quotes_backup_20261020';
--
-- And that nobody signed in can read it:
-- select relrowsecurity from pg_class where relname = 'quotes_backup_20261020';   -- true
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'quotes_backup_20261020' and grantee in ('anon', 'authenticated');   -- no rows

-- ---------------------------------------------------------------------------
-- RESTORE, if 042 has to be undone. Commented on purpose: this changes live
-- rows, so it is read, understood and run by hand, never pasted whole.
-- ---------------------------------------------------------------------------
-- 042 changes no existing value, so undoing it is removing the column; the
-- snapshot is only needed if something ELSE went wrong in the same window.
-- begin;
--   alter table quotes drop column if exists sent_at;
-- commit;
--
-- The snapshot itself is never dropped. Nothing in this project deletes a
-- backup table (`CLAUDE.md` rule 1).
