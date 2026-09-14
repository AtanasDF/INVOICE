-- Run 000-backup-before-migration.sql first if you haven't already run it
-- today (it's cheap to run again -- just edit the date suffix in the
-- table names to avoid a name clash with an earlier run).
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive, same pattern as before: ADD COLUMN IF NOT EXISTS only.
-- Safe to run more than once.
--
-- Adds: a line_items column on receipts, so a single receipt (e.g. one
-- supermarket trip) can be broken into individual items, each with its
-- own category -- Groceries and Household from the same receipt, rather
-- than the whole thing being lumped into one category.

alter table public.receipts add column if not exists line_items jsonb not null default '[]'::jsonb;
