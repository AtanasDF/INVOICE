-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this only creates a new table (invoice_links), its
-- constraints, an ownership trigger and its owner policy; no existing table
-- is altered. Safe to re-run.
--
-- A private link to view an issued invoice online (/i/<token>), created
-- when the owner sends or copies it, and when it was opened. The public page
-- and the "opened" beacon read and update it through the service role on
-- the server; the owner can only see and create their own links, never
-- change the counts, and signed-out visitors have no access at all.
-- invoice_id is ON DELETE CASCADE: a link means nothing without its invoice
-- (an issued invoice with payments can't be deleted anyway, migration-023).

create table if not exists public.invoice_links (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoice_links'::regclass and conname = 'invoice_links_token_key') then
    alter table public.invoice_links add constraint invoice_links_token_key unique (token);
  end if;
  -- 32 random bytes, base64url: long enough that links can't be guessed.
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoice_links'::regclass and conname = 'invoice_links_token_check') then
    alter table public.invoice_links add constraint invoice_links_token_check check (token ~ '^[A-Za-z0-9_-]{43,}$');
  end if;
end $$;

-- FK checks bypass RLS: a link may only be made for the owner's own invoice.
create or replace function public.invoice_links_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.invoices where id = new.invoice_id and user_id = new.user_id) then
    raise exception 'A link can only be made for one of your own invoices.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger invoice_links_same_owner
  before insert or update of invoice_id, user_id on public.invoice_links
  for each row execute function public.invoice_links_same_owner();

alter table public.invoice_links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_links' and policyname = 'invoice_links_owner_select') then
    create policy invoice_links_owner_select on public.invoice_links for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_links' and policyname = 'invoice_links_owner_insert') then
    create policy invoice_links_owner_insert on public.invoice_links for insert with check (auth.uid() = user_id);
  end if;
end $$;

revoke all on public.invoice_links from anon;
revoke all on public.invoice_links from authenticated;
grant select, insert on public.invoice_links to authenticated;

-- ── Checks after running ────────────────────────────────────────────
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.invoice_links'::regclass;
--   select grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--     where table_name = 'invoice_links' and grantee in ('anon', 'authenticated') group by grantee;
--     -> authenticated INSERT,SELECT; anon none
--   Rolled back: owner creates a link for own invoice and sees it; another user sees 0 and
--   can't make one for it; owner can't update view_count; a short token is refused; anon
--   refused.
