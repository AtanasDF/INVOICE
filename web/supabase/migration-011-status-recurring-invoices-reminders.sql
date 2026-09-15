-- Run 007-backup-before-migration-011.sql first.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Adds: invoice status lifecycle, recurring invoices, and the schema
-- payment reminders need (reminder text + a sent-log). All additive,
-- safe to run more than once. The existing "paid" column on invoices is
-- left in place untouched -- nothing drops it, so this stays reversible.

-- ── 1. Invoice status ───────────────────────────────────────────────
-- Draft -> Sent -> Partial -> Paid. Overdue is derived in the app from
-- due_date, never stored. Backfilled from the existing paid column: an
-- invoice that already existed was, under the old model, already shown
-- to the client the moment it was created (there was no draft concept
-- before now) -- so paid=true becomes 'paid' and paid=false becomes
-- 'sent', never 'draft'. Only invoices created after this migration can
-- ever start as a real draft.
alter table public.invoices add column if not exists status text;
update public.invoices set status = case when paid then 'paid' else 'sent' end where status is null;
alter table public.invoices alter column status set default 'draft';
alter table public.invoices alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_status_check' and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices add constraint invoices_status_check
      check (status in ('draft', 'sent', 'partial', 'paid'));
  end if;
end $$;

-- ── 2. Per-client reminder opt-out ──────────────────────────────────
-- Defaults on -- the point of the feature is to save the account holder
-- from chasing manually, so a client has to be deliberately excluded.
alter table public.clients add column if not exists reminders_enabled boolean not null default true;

-- ── 3. Recurring invoices ───────────────────────────────────────────
-- Mirrors recurring_expenses' shape (day_of_month/next_due_date/active),
-- for the income side instead of the expense side. items is jsonb, same
-- representation as invoices.items, so no separate line-item table.
create table if not exists public.recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  items jsonb not null default '[]',
  payment_terms text,
  notes text,
  day_of_month integer not null default 1,
  next_due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.recurring_invoices add column if not exists user_id uuid;
alter table public.recurring_invoices add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.recurring_invoices add column if not exists items jsonb default '[]';
alter table public.recurring_invoices add column if not exists payment_terms text;
alter table public.recurring_invoices add column if not exists notes text;
alter table public.recurring_invoices add column if not exists day_of_month integer default 1;
alter table public.recurring_invoices add column if not exists next_due_date date;
alter table public.recurring_invoices add column if not exists active boolean default true;
alter table public.recurring_invoices add column if not exists created_at timestamptz default now();

alter table public.recurring_invoices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recurring_invoices' and policyname = 'recurring_invoices_owner_all'
  ) then
    create policy "recurring_invoices_owner_all" on public.recurring_invoices
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── 4. Reminder text templates ──────────────────────────────────────
-- Three fixed slots (3 days before due / on due date / 7 days after),
-- editable per account. Null means "use the app's built-in default
-- wording" -- these columns only hold an override.
alter table public.business_profile add column if not exists reminder_text_before text;
alter table public.business_profile add column if not exists reminder_text_due text;
alter table public.business_profile add column if not exists reminder_text_after text;

-- ── 5. Reminder send log ────────────────────────────────────────────
-- Idempotency for the reminder cron: one row per (invoice, kind) ever
-- sent, so a rerun (or a day the cron fires twice) can't double-send.
-- user_id is denormalized from the invoice for a simple owner-read RLS
-- policy -- the cron writes this with the service-role key, which
-- bypasses RLS entirely, so this only governs the app's own reads.
create table if not exists public.invoice_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null check (kind in ('before', 'due', 'after')),
  sent_at timestamptz not null default now()
);
alter table public.invoice_reminders_sent add column if not exists user_id uuid;
alter table public.invoice_reminders_sent add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;
alter table public.invoice_reminders_sent add column if not exists kind text;
alter table public.invoice_reminders_sent add column if not exists sent_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoice_reminders_sent_invoice_id_kind_key' and conrelid = 'public.invoice_reminders_sent'::regclass
  ) then
    alter table public.invoice_reminders_sent add constraint invoice_reminders_sent_invoice_id_kind_key unique (invoice_id, kind);
  end if;
end $$;

alter table public.invoice_reminders_sent enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_reminders_sent' and policyname = 'invoice_reminders_sent_owner_select'
  ) then
    create policy "invoice_reminders_sent_owner_select" on public.invoice_reminders_sent
      for select using (auth.uid() = user_id);
  end if;
end $$;
