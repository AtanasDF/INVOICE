-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup file precedes this one -- it only creates a brand-new table
-- (create table if not exists), it doesn't alter or touch any existing
-- table or row, so there's nothing existing that's at risk. Safe to run
-- more than once.
--
-- Adds push_subscriptions: one row per browser/device that's opted into
-- push notifications, storing what the Push API gives back when a device
-- subscribes (endpoint + the two keys needed to encrypt a message to it).
-- The daily cron job (src/app/api/notifications/check) reads this with
-- the service_role key, bypassing RLS -- it has to check every account's
-- due reminders, not just one signed-in caller's own rows. The owner-only
-- policy below governs the app's own client-side reads/writes (adding or
-- removing your own subscription from Settings), not the cron job.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_owner_all'
  ) then
    create policy "push_subscriptions_owner_all" on public.push_subscriptions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
