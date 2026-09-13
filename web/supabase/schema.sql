-- Run this once in the Supabase SQL Editor for your project:
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
-- Paste this whole file, click "Run". It is safe to run more than once.
--
-- Non-destructive: every statement either creates something only if it
-- doesn't already exist, or adds a column only if it's missing. There is
-- no DROP, DELETE, or TRUNCATE anywhere in this file, so it cannot remove
-- a table, a column, or a row of data.

create extension if not exists "pgcrypto";

-- CLIENTS ---------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_company boolean not null default true,
  email text,
  address text,
  created_at timestamptz not null default now()
);
alter table public.clients add column if not exists user_id uuid;
alter table public.clients add column if not exists name text;
alter table public.clients add column if not exists is_company boolean default true;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists created_at timestamptz default now();

-- RECEIPTS ----------------------------------------------------------------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  date date not null,
  vendor text,
  category text,
  amount numeric not null default 0,
  vat_amount numeric not null default 0,
  image_data_url text,
  created_at timestamptz not null default now()
);
alter table public.receipts add column if not exists user_id uuid;
alter table public.receipts add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.receipts add column if not exists date date;
alter table public.receipts add column if not exists vendor text;
alter table public.receipts add column if not exists category text;
alter table public.receipts add column if not exists amount numeric default 0;
alter table public.receipts add column if not exists vat_amount numeric default 0;
alter table public.receipts add column if not exists image_data_url text;
alter table public.receipts add column if not exists created_at timestamptz default now();

-- INVOICES ----------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  date date not null,
  number text not null,
  items jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.invoices add column if not exists user_id uuid;
alter table public.invoices add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.invoices add column if not exists date date;
alter table public.invoices add column if not exists number text;
alter table public.invoices add column if not exists items jsonb default '[]'::jsonb;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists created_at timestamptz default now();

-- ROW LEVEL SECURITY --------------------------------------------------------
-- Turns on "you can only see/change your own rows". Running this again
-- when it's already on has no effect and touches no data.
alter table public.clients enable row level security;
alter table public.receipts enable row level security;
alter table public.invoices enable row level security;

-- Each policy is only created if one with that exact name doesn't already
-- exist on the table. Nothing is ever dropped, so re-running this is safe.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_owner_all'
  ) then
    create policy "clients_owner_all" on public.clients
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'receipts' and policyname = 'receipts_owner_all'
  ) then
    create policy "receipts_owner_all" on public.receipts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices_owner_all'
  ) then
    create policy "invoices_owner_all" on public.invoices
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
