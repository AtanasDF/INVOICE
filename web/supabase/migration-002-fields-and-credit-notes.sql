-- FIRST run 000-backup-before-migration.sql in this same folder — it
-- snapshots your current data so there's something to restore from if
-- anything here ever needs undoing. Then run this file.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive, same as schema.sql: only ADD COLUMN IF NOT EXISTS,
-- CREATE TABLE IF NOT EXISTS, and policies created only if a policy of
-- that exact name doesn't already exist. No DROP, DELETE, or TRUNCATE.
-- Safe to run more than once.
--
-- Adds: the Clients/Suppliers split, the rest of each client's profile
-- fields, receipt notes/starred/warranty/tags, invoice due
-- date/terms/paid status/tags, and a credit_notes table linked back to
-- invoices.

-- CLIENTS: split into clients vs. suppliers, plus their own profile fields
alter table public.clients add column if not exists kind text not null default 'client';
alter table public.clients add column if not exists vat_number text;
alter table public.clients add column if not exists payment_terms text;
alter table public.clients add column if not exists default_currency text;
alter table public.clients add column if not exists contact_person text;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'clients' and constraint_name = 'clients_kind_check'
  ) then
    alter table public.clients add constraint clients_kind_check check (kind in ('client', 'supplier'));
  end if;
end $$;

-- RECEIPTS: notes, starred, warranty tracking, tags
alter table public.receipts add column if not exists notes text;
alter table public.receipts add column if not exists starred boolean not null default false;
alter table public.receipts add column if not exists warranty_months integer;
alter table public.receipts add column if not exists tags jsonb not null default '[]'::jsonb;

-- INVOICES: due date, payment terms, paid status, tags
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists payment_terms text;
alter table public.invoices add column if not exists paid boolean not null default false;
alter table public.invoices add column if not exists tags jsonb not null default '[]'::jsonb;

-- CREDIT NOTES: full or partial adjustments against a previously issued invoice
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  date date not null,
  amount numeric not null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.credit_notes add column if not exists user_id uuid;
alter table public.credit_notes add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;
alter table public.credit_notes add column if not exists date date;
alter table public.credit_notes add column if not exists amount numeric;
alter table public.credit_notes add column if not exists reason text;
alter table public.credit_notes add column if not exists created_at timestamptz default now();

alter table public.credit_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_notes' and policyname = 'credit_notes_owner_all'
  ) then
    create policy "credit_notes_owner_all" on public.credit_notes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- BUSINESS PROFILE: one row per user, auto-fills onto invoices
create table if not exists public.business_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  vat_number text,
  address text,
  logo_url text,
  updated_at timestamptz not null default now()
);
alter table public.business_profile add column if not exists business_name text;
alter table public.business_profile add column if not exists vat_number text;
alter table public.business_profile add column if not exists address text;
alter table public.business_profile add column if not exists logo_url text;
alter table public.business_profile add column if not exists updated_at timestamptz default now();

alter table public.business_profile enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'business_profile' and policyname = 'business_profile_owner_all'
  ) then
    create policy "business_profile_owner_all" on public.business_profile
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
