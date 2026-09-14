-- Run 000-backup-before-migration.sql first (edit the date suffix -- it's
-- run before).
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive, same pattern as every migration so far. Verified live
-- against the database first: this table does not exist yet.
--
-- Adds: recurring_expenses, for reminders about things like monthly
-- insurance or subscriptions so they don't get forgotten.

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  category text,
  amount numeric not null default 0,
  vat_amount numeric not null default 0,
  supplier_id uuid references public.clients(id) on delete set null,
  day_of_month integer not null default 1,
  next_due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.recurring_expenses add column if not exists user_id uuid;
alter table public.recurring_expenses add column if not exists description text;
alter table public.recurring_expenses add column if not exists category text;
alter table public.recurring_expenses add column if not exists amount numeric default 0;
alter table public.recurring_expenses add column if not exists vat_amount numeric default 0;
alter table public.recurring_expenses add column if not exists supplier_id uuid references public.clients(id) on delete set null;
alter table public.recurring_expenses add column if not exists day_of_month integer default 1;
alter table public.recurring_expenses add column if not exists next_due_date date;
alter table public.recurring_expenses add column if not exists active boolean default true;
alter table public.recurring_expenses add column if not exists created_at timestamptz default now();

alter table public.recurring_expenses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recurring_expenses' and policyname = 'recurring_expenses_owner_all'
  ) then
    create policy "recurring_expenses_owner_all" on public.recurring_expenses
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
