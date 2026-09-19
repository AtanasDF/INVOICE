-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 009-backup-before-migration-018.sql FIRST -- this one alters clients.
--
-- Everything is additive and safe to re-run. This file adds:
--   clients.phone                 text (nullable)
--   table    rate_limit_hits      (key, window_start, hits), RLS on and no
--                                 policies, so only the service role reads
--                                 or writes it
--   function hit_rate_limit(text, integer, integer) returns boolean,
--                                 security definer, execute for
--                                 service_role only
--
-- ── 1. clients.phone ────────────────────────────────────────────────
-- Scanned business cards and letterheads carry a phone number that had
-- nowhere to go.
alter table public.clients add column if not exists phone text;

-- ── 2. shared rate limit ────────────────────────────────────────────
-- The public free-invoice scanner limited callers in memory, per
-- serverless instance, so a cold start or a second instance reset the
-- count. One row per key per fixed window, counted atomically here, is
-- shared by every instance. The app stores a keyed hash of the key (which
-- can contain a visitor's IP address), never the address itself. Rows are
-- never deleted by the app; at the free page's traffic this is a few
-- hundred rows a day.
create table if not exists public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limit_hits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public;
revoke all on function public.hit_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ── Checks after running (each should return what's noted) ──────────
--   select column_name, data_type, is_nullable from information_schema.columns
--     where table_schema = 'public' and table_name = 'clients' and column_name = 'phone';
--     -> phone | text | YES
--   select relrowsecurity from pg_class where oid = 'public.rate_limit_hits'::regclass;  -> true
--   select grantee, privilege_type from information_schema.routine_privileges
--     where routine_name = 'hit_rate_limit';  -> service_role | EXECUTE only (plus the owner)
--   Exercise it without keeping the rows:
--     begin;
--       select public.hit_rate_limit('test', 2, 3600), public.hit_rate_limit('test', 2, 3600), public.hit_rate_limit('test', 2, 3600);
--       -- -> true, true, false
--     rollback;
