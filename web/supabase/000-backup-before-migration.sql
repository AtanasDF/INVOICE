-- Run this FIRST, before migration-002 (or any future migration) — every
-- time, even if you've run it before (just edit the date in the table
-- names below first). Takes a snapshot of every table's current data,
-- inside your own database, so there's something to restore from if a
-- migration ever goes wrong.
--
-- This only reads your existing tables and creates new ones next to
-- them. It never touches clients, receipts, or invoices themselves --
-- if any of the three lines below fails because a backup table with
-- that name already exists, just change the date suffix and rerun.

create table public.clients_backup_20260914 as table public.clients;
create table public.receipts_backup_20260914 as table public.receipts;
create table public.invoices_backup_20260914 as table public.invoices;

-- To restore from a snapshot later (only if something actually breaks --
-- this does not run automatically, and would need adjusting to match
-- whatever actually happened):
--   truncate public.receipts;
--   insert into public.receipts select * from public.receipts_backup_20260914;
--
-- Once you've confirmed the migration went well, these backup tables are
-- just sitting there unused. No rush to remove them -- they don't affect
-- the app -- but whenever you want to, e.g.:
--   drop table public.clients_backup_20260914;
