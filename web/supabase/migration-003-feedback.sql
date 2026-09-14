-- FIRST run 000-backup-before-migration.sql (edit the date suffix in it
-- first, since it already ran once). Then run this file.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Non-destructive, same as previous migrations: CREATE TABLE IF NOT
-- EXISTS, no DROP/DELETE/TRUNCATE. Safe to run more than once.
--
-- Adds a single feedback table for the in-app feedback widget - your
-- own notes, not tied to any client/receipt/invoice.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  category text,
  page text,
  created_at timestamptz not null default now()
);
alter table public.feedback add column if not exists user_id uuid;
alter table public.feedback add column if not exists message text;
alter table public.feedback add column if not exists category text;
alter table public.feedback add column if not exists page text;
alter table public.feedback add column if not exists created_at timestamptz default now();

alter table public.feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback' and policyname = 'feedback_owner_all'
  ) then
    create policy "feedback_owner_all" on public.feedback
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
