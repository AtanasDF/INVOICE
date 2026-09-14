-- Run this FIRST, before migration-003, 004, and 005. A fresh snapshot --
-- the one from before migration-002 is now stale (real data has been
-- added/changed since), so this uses a new suffix rather than reusing it.
--
-- Same as before: only reads your existing tables and creates new ones
-- next to them. Never touches clients, receipts, or invoices themselves.

create table public.clients_backup_20260914_2 as table public.clients;
create table public.receipts_backup_20260914_2 as table public.receipts;
create table public.invoices_backup_20260914_2 as table public.invoices;

-- To restore from this snapshot later (only if something actually breaks
-- -- this does not run automatically, and would need adjusting to match
-- whatever actually happened):
--   truncate public.receipts;
--   insert into public.receipts select * from public.receipts_backup_20260914_2;
--
-- No rush to remove these once you've confirmed all three migrations went
-- well -- they don't affect the app -- but whenever you want to:
--   drop table public.clients_backup_20260914_2;
--   drop table public.receipts_backup_20260914_2;
--   drop table public.invoices_backup_20260914_2;
--
-- The tables from the first backup (*_20260914, no "_2") are still there
-- too, from before migration-002 -- safe to leave alone or drop the same
-- way, your call.
