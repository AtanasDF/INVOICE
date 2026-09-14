-- Run 002-backup-before-migration-006.sql first.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive: ADD COLUMN IF NOT EXISTS only. Safe to run more than
-- once.
--
-- Adds: a custom_categories column on business_profile, so an account can
-- rename, reorder, add, or remove expense categories in Settings instead
-- of being stuck with the built-in defaults. Nullable, defaulting to
-- null -- null means "use the built-in defaults", same as before this
-- migration, so nothing changes for an account until they actually
-- customize their list.

alter table public.business_profile add column if not exists custom_categories jsonb;
