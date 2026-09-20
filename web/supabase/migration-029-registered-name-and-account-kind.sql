-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 014-backup-before-migration-029.sql first and check it.
--
-- business_name was doing two jobs at once. A limited company has a
-- registered name and number filed at Companies House, which the
-- Companies Act 2006 (s.82, and the Company, LLP and Business Names
-- Regulations 2015) requires on its invoices, and usually a shorter
-- trading name customers actually know it by. business_name stays the
-- trading name and the headline on every document; registered_name and
-- company_number are new and print small in the invoice footer when both
-- are set. A sole trader leaves them empty and nothing changes for him.
--
-- account_kind says what the account is for -- 'limited', 'sole_trader'
-- or 'personal' -- and is null until it's chosen, which reads as "not
-- said" everywhere. Today it only decides whether the address is labelled
-- "Business address" or "Your address"; the wider "the app follows the
-- account" idea is parked in notes/future-ideas.md.
--
-- Additive: three nullable columns and one check constraint that allows
-- null. Nothing is backfilled and no existing value changes. Safe to
-- re-run.

alter table public.business_profile add column if not exists registered_name text;
alter table public.business_profile add column if not exists company_number text;
alter table public.business_profile add column if not exists account_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_profile'::regclass and conname = 'business_profile_account_kind_check'
  ) then
    alter table public.business_profile add constraint business_profile_account_kind_check
      check (account_kind is null or account_kind in ('limited', 'sole_trader', 'personal'));
  end if;
end $$;

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'business_profile'
--       and column_name in ('registered_name', 'company_number', 'account_kind');
--     -> three text columns, YES, no default
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.business_profile'::regclass and conname = 'business_profile_account_kind_check';
--     -> CHECK (account_kind IS NULL OR (account_kind = ANY (ARRAY['limited'::text, 'sole_trader'::text, 'personal'::text])))
--   select count(*) from public.business_profile where registered_name is not null or company_number is not null or account_kind is not null;
--     -> 0 (nothing was backfilled)
--   select count(*) from (select * from public.business_profile_backup_20260920_m029 b
--     except select user_id, business_name, vat_number, address, logo_url, show_overdue_reminders, custom_categories,
--       inbox_token, invoice_prefix, invoice_next_number, vat_registered, bank_details, reminder_text_before,
--       reminder_text_due, reminder_text_after, reminder_text_late, reminder_text_final,
--       reminder_late_payment_interest, updated_at from public.business_profile) d;
--     -> 0 (every column the row already had is untouched; list the backup's own columns if this project's
--        business_profile has since gained others)
--   The owner's existing policy still covers the new columns (business_profile_owner_all is FOR ALL on the
--   table, not per column), so no grant or policy change is needed. Rolled back as authenticated:
--     begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<atanas uuid>","role":"authenticated"}';
--     update public.business_profile set account_kind = 'sole_trader' where user_id = '<atanas uuid>';   -- 1 row
--     update public.business_profile set account_kind = 'ltd' where user_id = '<atanas uuid>';           -- must fail the check
--     do $$ begin raise exception 'rollback'; end $$;
--     rollback;
