-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this only creates a new table (quote_links), its
-- constraints, an ownership trigger, its owner policies and two functions
-- the server calls with the service role; no existing table is altered.
-- Safe to re-run.
--
-- A private link to a sent quote (/q/<token>) where the customer can view it
-- and accept or decline it. Same shape and rules as invoice_links
-- (migration-025): owners see their links, create them with only
-- quote/owner/token and may change only the token; counts and answers are
-- written by the server. respond_to_quote_link records the answer and moves
-- the quote from sent to accepted/declined in one statement each, only while
-- it is sent and not past its valid-until date, and only once.

create table if not exists public.quote_links (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  response text,
  responded_at timestamptz,
  responder_name text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_links'::regclass and conname = 'quote_links_token_key') then
    alter table public.quote_links add constraint quote_links_token_key unique (token);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_links'::regclass and conname = 'quote_links_token_check') then
    alter table public.quote_links add constraint quote_links_token_check check (token ~ '^[A-Za-z0-9_-]{43}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_links'::regclass and conname = 'quote_links_response_check') then
    alter table public.quote_links add constraint quote_links_response_check
      check ((response is null and responded_at is null) or (response in ('accepted', 'declined') and responded_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_links'::regclass and conname = 'quote_links_responder_name_check') then
    alter table public.quote_links add constraint quote_links_responder_name_check check (responder_name is null or length(responder_name) <= 120);
  end if;
end $$;

create or replace function public.quote_links_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.quotes where id = new.quote_id and user_id = new.user_id) then
    raise exception 'A link can only be made for one of your own quotes.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger quote_links_same_owner
  before insert or update of quote_id, user_id on public.quote_links
  for each row execute function public.quote_links_same_owner();

alter table public.quote_links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_links' and policyname = 'quote_links_owner_select') then
    create policy quote_links_owner_select on public.quote_links for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_links' and policyname = 'quote_links_owner_insert') then
    create policy quote_links_owner_insert on public.quote_links for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_links' and policyname = 'quote_links_owner_update') then
    create policy quote_links_owner_update on public.quote_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

revoke all on public.quote_links from anon;
revoke all on public.quote_links from authenticated;
grant select on public.quote_links to authenticated;
grant insert (quote_id, user_id, token) on public.quote_links to authenticated;
grant update (token) on public.quote_links to authenticated;

create or replace function public.record_quote_link_view(p_token text)
returns table (quote_id uuid, user_id uuid, first_view boolean)
language sql
set search_path = public
as $$
  update public.quote_links
     set view_count = view_count + 1,
         last_viewed_at = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where token = p_token
  returning quote_id, user_id, view_count = 1;
$$;

-- The customer's answer. Returns the quote it applied to, or nothing when
-- the link is unknown, already answered, the quote isn't sent any more, or
-- its valid-until date has passed.
create or replace function public.respond_to_quote_link(p_token text, p_response text, p_name text)
returns table (quote_id uuid, user_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_link public.quote_links%rowtype;
begin
  if p_response not in ('accepted', 'declined') then
    return;
  end if;
  select * into v_link from public.quote_links where token = p_token and response is null for update;
  if not found then
    return;
  end if;
  update public.quotes q
     set status = p_response
   where q.id = v_link.quote_id and q.user_id = v_link.user_id and q.status = 'sent'
     and (q.valid_until is null or q.valid_until >= current_date);
  if not found then
    return;
  end if;
  update public.quote_links
     set response = p_response, responded_at = now(), responder_name = nullif(left(trim(coalesce(p_name, '')), 120), '')
   where quote_links.quote_id = v_link.quote_id;
  return query select v_link.quote_id, v_link.user_id;
end $$;

revoke all on function public.record_quote_link_view(text) from public;
revoke execute on function public.record_quote_link_view(text) from anon, authenticated;
grant execute on function public.record_quote_link_view(text) to service_role;
revoke all on function public.respond_to_quote_link(text, text, text) from public;
revoke execute on function public.respond_to_quote_link(text, text, text) from anon, authenticated;
grant execute on function public.respond_to_quote_link(text, text, text) to service_role;

-- ── Checks after running ────────────────────────────────────────────
--   Grants as migration-025 (authenticated: select; insert quote_id/user_id/token;
--   update token; anon nothing); both functions execute for service_role only.
--   Rolled back: owner makes/sees/replaces a link; other user can't; the server records
--   views (first once); accepting a sent quote sets it accepted and records the name;
--   a second answer, an expired quote, a draft or an invoiced quote are refused.
