-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run this FIRST, before migration-017. That migration alters receipts:
-- it adds document_type, invoice_number, due_date, paid, details and
-- credit_of_receipt_id (all additive, all defaulted or nullable) so the
-- scanner can file supplier invoices and credit notes alongside receipts.
-- receipts carries real financial history, so it gets a fresh snapshot
-- before anything touches it -- same discipline as every migration so far.
--
-- Only reads the existing table and creates a new one next to it. Never
-- touches receipts itself. Locked down with RLS immediately.

create table public.receipts_backup_20260917 as table public.receipts;
alter table public.receipts_backup_20260917 enable row level security;

-- To restore from the snapshot later (only if something actually breaks
-- -- this does not run automatically). The backup has none of the new
-- columns, so name the original ones explicitly. receipt_pages (extra
-- pages of multi-page scans, which only exist after migration-017)
-- references receipts, so it has to be truncated in the same statement
-- and those page rows are lost with the restore:
--   truncate public.receipt_pages, public.receipts;
--   insert into public.receipts (id, user_id, client_id, date, vendor, category,
--     amount, vat_amount, image_data_url, created_at, notes, starred,
--     warranty_months, tags, line_items, original_amount, original_vat_amount,
--     original_currency, fx_rate, needs_review)
--   select id, user_id, client_id, date, vendor, category,
--     amount, vat_amount, image_data_url, created_at, notes, starred,
--     warranty_months, tags, line_items, original_amount, original_vat_amount,
--     original_currency, fx_rate, needs_review
--   from public.receipts_backup_20260917;
--
-- No rush to remove this once migration-017 is confirmed working:
--   drop table public.receipts_backup_20260917;
