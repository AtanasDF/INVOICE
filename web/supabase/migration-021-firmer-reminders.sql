-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 010-backup-before-migration-021.sql first and check it.
--
-- Payment reminders used to stop 7 days after the due date. Two more go out:
-- a firmer one at 14 days ('late') and a final notice at 30 days ('final'),
-- which can also state the right to statutory interest and compensation
-- under the Late Payment of Commercial Debts (Interest) Act 1998 (business
-- clients only, and only with the owner's switch on). Additive: two nullable
-- wording columns and a switch that defaults to off, and a wider kind check.
-- Safe to re-run.

alter table public.business_profile add column if not exists reminder_text_late text;
alter table public.business_profile add column if not exists reminder_text_final text;
alter table public.business_profile add column if not exists reminder_late_payment_interest boolean not null default false;

-- The kind check was created inline in migration-011, so it has Postgres's
-- default name. Replaced only while it still allows just the old three.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoice_reminders_sent'::regclass
      and conname = 'invoice_reminders_sent_kind_check'
      and pg_get_constraintdef(oid) not like '%final%'
  ) then
    alter table public.invoice_reminders_sent drop constraint invoice_reminders_sent_kind_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoice_reminders_sent'::regclass and conname = 'invoice_reminders_sent_kind_check'
  ) then
    alter table public.invoice_reminders_sent add constraint invoice_reminders_sent_kind_check
      check (kind in ('before', 'due', 'after', 'late', 'final'));
  end if;
end $$;

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'business_profile'
--       and column_name in ('reminder_text_late', 'reminder_text_final', 'reminder_late_payment_interest');
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.invoice_reminders_sent'::regclass and conname = 'invoice_reminders_sent_kind_check';
--     -> CHECK ((kind = ANY (ARRAY['before'::text, 'due'::text, 'after'::text, 'late'::text, 'final'::text])))
--   select count(*) from pg_constraint where conrelid = 'public.invoice_reminders_sent'::regclass and contype = 'c';
--     -> 1 (no leftover check refusing the new kinds)
--   The owner can still update their own profile row (existing policy), and the
--   cron (service role) can insert a 'late' and a 'final' row.
