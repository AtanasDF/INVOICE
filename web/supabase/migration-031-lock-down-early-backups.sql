-- Take the default anon/authenticated grants off every backup table.
--
-- WHAT WAS THOUGHT, AND WHAT WAS FOUND. The snapshots in
-- 000-backup-before-migration.sql and 001-backup-before-next-migrations.sql
-- were taken with
--   create table public.clients_backup_20260914 as table public.clients;
-- and nothing else, so this file was first written (2026-09-20) on the
-- basis that those six tables had row level security off and were
-- readable by any signed-in account. Checked against the live database on
-- 2026-09-21 before running: all 24 backup tables, the six included,
-- already have RLS ON with no policy, and a signed-in user and anon each
-- read 0 rows from every one of them (verified as those roles in a
-- rolled-back transaction). Nobody recorded switching it on; it was on.
-- Nothing was ever exposed.
--
-- WHAT THIS DOES INSTEAD. Every one of the 24 still carries Supabase's
-- default grants (select, insert, update, delete, truncate, references,
-- trigger for anon and for authenticated). With RLS on and no policy those
-- grants let through nothing, so they are unused -- but they are also the
-- only thing standing between "RLS switched off on one of these by
-- mistake" and "every signed-in account can read a snapshot of the
-- records". This revokes them, so a backup table is reachable by the
-- service role only, whatever happens to its RLS flag later. It also
-- enables RLS on any backup table found without it, which today is none.
--
-- Every table whose name matches %_backup_% in public is covered, so
-- running this again after a later backup file covers that snapshot too.
-- Restores run as the table owner (postgres, from the SQL editor) and are
-- not affected; the app never reads a backup table.
--
-- NO BACKUP FILE IS NEEDED. This creates nothing, changes no row and
-- deletes nothing: it only takes access away. Deliberately no policy is
-- added either. Safe to run more than once.

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname like '%\_backup\_%'
     order by c.relname
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    raise notice 'locked down %', t;
  end loop;
end $$;

-- Check afterwards: every row below should read rls = true, grants = 0,
-- policies = 0 and service_role_reads = true (24 rows on 2026-09-21).
--
--   select c.relname as table_name,
--          c.relrowsecurity as rls,
--          (select count(*) from information_schema.role_table_grants g
--             where g.table_schema = 'public' and g.table_name = c.relname
--               and g.grantee in ('anon', 'authenticated')) as grants,
--          (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
--          has_table_privilege('service_role', c.oid, 'SELECT') as service_role_reads
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and c.relname like '%\_backup\_%'
--    order by c.relname;
--
-- And to be sure nothing else was ever left open, every table in public
-- should have RLS on (no rows):
--
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
