-- Turn on row level security for the six earliest backup tables.
--
-- WHY THIS MATTERS. The snapshots in 000-backup-before-migration.sql and
-- 001-backup-before-next-migrations.sql were taken with
--   create table public.clients_backup_20260914 as table public.clients;
-- and nothing else. Every later backup file (003 onwards) follows that
-- line with "enable row level security"; these two came before that habit
-- started, so those six tables have RLS switched off. Supabase grants
-- anon and authenticated everything on a new table in the public schema by
-- default, and with RLS off there is nothing to stop a read: any account
-- signed in to this app -- and anyone at all if anon kept its grant --
-- could select every row of those snapshots, which hold a copy of the
-- clients, receipts and invoices as they stood on 14 September 2026.
--
-- The live tables themselves are fine: clients, receipts, invoices,
-- quotes, invoice_payments and the rest all have RLS and an owner policy,
-- and every backup from 003 onwards has RLS on with no policy, which
-- allows nothing except the service role. Only these six were left open.
--
-- NO BACKUP FILE IS NEEDED. This creates nothing, changes no row and
-- deletes nothing: it only takes access away. Deliberately no policy is
-- added either -- a snapshot should be reachable by the service role only,
-- the same as every other backup table here. Safe to run more than once.

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients_backup_20260914',
    'receipts_backup_20260914',
    'invoices_backup_20260914',
    'clients_backup_20260914_2',
    'receipts_backup_20260914_2',
    'invoices_backup_20260914_2'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
      raise notice 'locked down %', t;
    else
      raise notice 'no table %, nothing to do', t;
    end if;
  end loop;
end $$;

-- Check afterwards: every row below should read rls = true and grants = 0.
--
--   select c.relname as table_name,
--          c.relrowsecurity as rls,
--          (select count(*) from information_schema.role_table_grants g
--             where g.table_schema = 'public' and g.table_name = c.relname
--               and g.grantee in ('anon', 'authenticated')) as grants
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname like '%_backup_%'
--    order by c.relname;
--
-- And to be sure nothing else was ever left open, every table in public
-- should have RLS on:
--
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
