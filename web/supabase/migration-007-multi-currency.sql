-- Run 003-backup-before-migration-007.sql first.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive: ADD COLUMN IF NOT EXISTS only. Safe to run more than
-- once.
--
-- Adds multi-currency support to receipts. amount/vat_amount stay exactly
-- what they've always been -- GBP, the base currency every report/total
-- in the app already reads. These four new columns are provenance only,
-- populated when a receipt was entered in a foreign currency (converted
-- to GBP at entry time using a live rate from Frankfurter.app, editable
-- by whoever's entering it):
--   original_amount        the total actually paid, in original_currency
--   original_vat_amount    the VAT portion, in original_currency
--   original_currency      e.g. "USD" -- null for an ordinary GBP receipt
--   fx_rate                the rate used: 1 original_currency = fx_rate GBP
--
-- All nullable, all null for every existing receipt (they were all GBP).

alter table public.receipts add column if not exists original_amount numeric;
alter table public.receipts add column if not exists original_vat_amount numeric;
alter table public.receipts add column if not exists original_currency text;
alter table public.receipts add column if not exists fx_rate numeric;
