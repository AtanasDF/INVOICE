-- Run 005-backup-before-migration-009.sql first.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive: ADD COLUMN IF NOT EXISTS only. Safe to run more than
-- once.
--
-- Adds the email inbox-import feature:
--
-- business_profile.inbox_token -- the opaque, unguessable <token> in
-- u-<token>@invoiceover.com. This IS the entire security boundary for
-- the feature (anyone who knows it can address mail, and therefore
-- create receipts, at this account), so it's a 128-bit random value
-- generated client-side, never anything derived or guessable. Unique so
-- two accounts can never collide onto the same address. Null until
-- generated from Settings.
--
-- receipts.needs_review -- true for a receipt created from an emailed-in
-- document, until the account holder confirms the AI's extraction was
-- correct. Defaults false so every existing receipt (and every new one
-- from the scanner or manual entry, where someone IS watching) is
-- unaffected.

alter table public.business_profile add column if not exists inbox_token text unique;
alter table public.receipts add column if not exists needs_review boolean not null default false;
