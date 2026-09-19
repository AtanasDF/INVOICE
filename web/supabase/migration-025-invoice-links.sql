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
  -- 32 random bytes, base64url: exactly 43 characters nobody can guess.
  if not exists (select 1 from pg_constraint where conrelid = 'public.invoice_links'::regclass and conname = 'invoice_links_token_check') then
    alter table public.invoice_links add constraint invoice_links_token_check check (token ~ '^[A-Za-z0-9_-]{43}$');
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
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_links' and policyname = 'invoice_links_owner_update') then
    create policy invoice_links_owner_update on public.invoice_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- The owner can see and make their links, and replace a link's token (which
-- kills the old link, e.g. one sent to the wrong address); only the token,
-- never the view counts.
revoke all on public.invoice_links from anon;
revoke all on public.invoice_links from authenticated;
grant select on public.invoice_links to authenticated;
grant insert (invoice_id, user_id, token) on public.invoice_links to authenticated;
grant update (token) on public.invoice_links to authenticated;

-- One open of a link, counted in the database so opens at the same moment
-- all count, and only the one that makes the count 1 is the first (it sends
-- the owner a notification). Called by the server with the service role.
create or replace function public.record_invoice_link_view(p_token text)
returns table (invoice_id uuid, user_id uuid, first_view boolean)
language sql
set search_path = public
as $$
  update public.invoice_links
     set view_count = view_count + 1,
         last_viewed_at = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where token = p_token
  returning invoice_id, user_id, view_count = 1;
$$;

revoke all on function public.record_invoice_link_view(text) from public;
revoke execute on function public.record_invoice_link_view(text) from anon, authenticated;
grant execute on function public.record_invoice_link_view(text) to service_role;

-- ── Checks after running ────────────────────────────────────────────
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.invoice_links'::regclass;
--   select grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--     where table_name = 'invoice_links' and grantee in ('anon', 'authenticated') group by grantee;
--     -> authenticated INSERT,SELECT (+ UPDATE on token only, column_privileges); anon none
--   select grantee from information_schema.routine_privileges where routine_name = 'record_invoice_link_view';
--     -> service_role (and postgres) only
--   Rolled back: owner creates a link for own invoice and sees it; another user sees 0 and
--   can't make one for it; owner can replace the token but not update view_count; a
--   42- or 44-character token is refused; anon refused; record_invoice_link_view counts
--   and reports the first view once.
