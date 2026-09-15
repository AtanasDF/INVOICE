-- Run this FIRST, before migration-011. invoices gets a new status
-- column (backfilled from the existing paid column) and clients gets a
-- new reminders_enabled column -- both additive, but invoices carries
-- real financial history so it gets a fresh snapshot before anything
-- touches it. clients is small and low-risk but backed up too, same
-- discipline as every migration so far.
--
-- Only reads the existing tables and creates new ones next to them. Never
-- touches invoices or clients themselves. Locked down with RLS immediately.

create table public.invoices_backup_20260915_2 as table public.invoices;
alter table public.invoices_backup_20260915_2 enable row level security;

create table public.clients_backup_20260915 as table public.clients;
alter table public.clients_backup_20260915 enable row level security;

-- To restore from either snapshot later (only if something actually
-- breaks -- this does not run automatically):
--   truncate public.invoices;
--   insert into public.invoices select * from public.invoices_backup_20260915_2;
--
--   truncate public.clients;
--   insert into public.clients select * from public.clients_backup_20260915;
--
-- No rush to remove these once migration-011 is confirmed working:
--   drop table public.invoices_backup_20260915_2;
--   drop table public.clients_backup_20260915;
