-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this only creates two new tables (quote_requests,
-- quote_request_suppliers), their constraints, triggers and owner policies,
-- and the functions below; no existing table is altered. Safe to re-run.
--
-- Asking suppliers to price a list of items. A request holds the list
-- (items: [{id, description, quantity, unit, note}]), when it's needed and
-- where to deliver. Each supplier asked gets a row with a private link
-- (/r/<token>) where they type a unit price per line (or mark it "can't
-- supply"), delivery, VAT included or not and how long the prices hold.
-- prices is keyed by the item's id: {"<item id>": {price, unavailable, note}}.
-- choice is the owner's pick per line, {"<item id>": "<supplier row id>"}.
-- Requests and their supplier rows are never deleted: a request is closed.
--
-- Who writes a supplier's answer:
--   * the supplier, through their link: the server (service role) calls
--     submit_quote_request_response, which answers once, only while the row
--     is waiting, the request is open and its needed-by date hasn't passed;
--   * the owner, only through record_quote_request_response: prices typed in
--     by hand or read from the supplier's own PDF/photo. The owner has no
--     update right on any answer column, so an answer can't be changed in
--     place. The function stamps who entered it (source manual/scan; only
--     the supplier's own answer is ever 'online'), refuses if the answer
--     changed since the owner's page loaded, and moves the answer it
--     replaces into `previous`, so a supplier's own prices are never lost
--     or passed off as edited.
--
-- request_id is a composite FK with user_id (as receipt_pages, migration-017):
-- a row can only hang off a request of the same account. clients has no
-- unique (id, user_id) and adding one would alter it, so supplier_id is a
-- plain FK kept to the owner's own clients by a trigger, as quotes.client_id
-- is (migration-020). Both are ON DELETE RESTRICT.

-- ── quote_requests ──────────────────────────────────────────────────

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  items jsonb not null,
  notes text not null default '',
  needed_by date,
  site_address text not null default '',
  status text not null default 'open',
  choice jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_id_user_id_key') then
    alter table public.quote_requests add constraint quote_requests_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_status_check') then
    alter table public.quote_requests add constraint quote_requests_status_check check (status in ('open', 'closed'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_title_check') then
    alter table public.quote_requests add constraint quote_requests_title_check check (length(btrim(title)) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_items_check') then
    alter table public.quote_requests add constraint quote_requests_items_check
      check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_text_check') then
    alter table public.quote_requests add constraint quote_requests_text_check check (length(notes) <= 4000 and length(site_address) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_choice_check') then
    alter table public.quote_requests add constraint quote_requests_choice_check check (choice is null or jsonb_typeof(choice) = 'object');
  end if;
end $$;

-- ── quote_request_suppliers ─────────────────────────────────────────

create table if not exists public.quote_request_suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id uuid not null,
  supplier_id uuid not null references public.clients(id) on delete restrict,
  token text not null,
  sent_at timestamptz,
  status text not null default 'waiting',
  responded_at timestamptz,
  source text,
  responder_name text,
  prices jsonb not null default '{}'::jsonb,
  delivery numeric(12, 2),
  vat_included boolean not null default false,
  valid_until date,
  note text not null default '',
  document_path text,
  previous jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_request_fkey') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_request_fkey
      foreign key (request_id, user_id) references public.quote_requests (id, user_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_request_supplier_key') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_request_supplier_key unique (request_id, supplier_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_token_key') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_token_key unique (token);
  end if;
  -- 32 random bytes, base64url: exactly 43 characters nobody can guess.
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_token_check') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_token_check check (token ~ '^[A-Za-z0-9_-]{43}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_status_check') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_status_check
      check (status in ('waiting', 'replied', 'declined'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_answer_check') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_answer_check
      check ((status = 'waiting' and responded_at is null and source is null)
          or (status <> 'waiting' and responded_at is not null and source in ('online', 'manual', 'scan')));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_request_suppliers'::regclass and conname = 'quote_request_suppliers_values_check') then
    alter table public.quote_request_suppliers add constraint quote_request_suppliers_values_check
      check (jsonb_typeof(prices) = 'object' and jsonb_typeof(previous) = 'array'
         and (delivery is null or delivery >= 0)
         and length(note) <= 2000 and (responder_name is null or length(responder_name) <= 120));
  end if;
end $$;

-- FK checks bypass RLS: a request can only go to the owner's own supplier.
create or replace function public.quote_request_suppliers_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.clients where id = new.supplier_id and user_id = new.user_id) then
    raise exception 'A quote request can only go to one of your own suppliers.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger quote_request_suppliers_same_owner
  before insert or update of supplier_id, user_id on public.quote_request_suppliers
  for each row execute function public.quote_request_suppliers_same_owner();

-- Prices are keyed by item id: once the list has gone to a supplier (or
-- one has answered), changing it would pin their prices to other items.
create or replace function public.quote_requests_lock_items() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.items is distinct from old.items and exists (
    select 1 from public.quote_request_suppliers s
     where s.request_id = old.id and s.user_id = old.user_id and (s.sent_at is not null or s.status <> 'waiting')
  ) then
    raise exception 'This list has gone out to suppliers, so it can''t be changed. Start a new request instead.' using errcode = '55000';
  end if;
  return new;
end $$;

create or replace trigger quote_requests_lock_items
  before update of items on public.quote_requests
  for each row execute function public.quote_requests_lock_items();

-- ── Access ──────────────────────────────────────────────────────────

alter table public.quote_requests enable row level security;
alter table public.quote_request_suppliers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_requests' and policyname = 'quote_requests_owner_select') then
    create policy quote_requests_owner_select on public.quote_requests for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_requests' and policyname = 'quote_requests_owner_insert') then
    create policy quote_requests_owner_insert on public.quote_requests for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_requests' and policyname = 'quote_requests_owner_update') then
    create policy quote_requests_owner_update on public.quote_requests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_request_suppliers' and policyname = 'quote_request_suppliers_owner_select') then
    create policy quote_request_suppliers_owner_select on public.quote_request_suppliers for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_request_suppliers' and policyname = 'quote_request_suppliers_owner_insert') then
    create policy quote_request_suppliers_owner_insert on public.quote_request_suppliers for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_request_suppliers' and policyname = 'quote_request_suppliers_owner_update') then
    create policy quote_request_suppliers_owner_update on public.quote_request_suppliers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Supabase's default privileges give anon and authenticated everything on a
-- new table. Signed-out visitors get nothing (the supplier's page reads with
-- the service role on the server). The owner makes requests and edits their
-- wording, list (until sent), status and pick; adds suppliers with only
-- request/supplier/owner/token; and may change only a row's token (stop the
-- link) and sent_at. No deletes: requests are closed, never removed.
revoke all on public.quote_requests from anon;
revoke all on public.quote_requests from authenticated;
grant select on public.quote_requests to authenticated;
grant insert (user_id, title, items, notes, needed_by, site_address) on public.quote_requests to authenticated;
grant update (title, items, notes, needed_by, site_address, status, choice) on public.quote_requests to authenticated;

revoke all on public.quote_request_suppliers from anon;
revoke all on public.quote_request_suppliers from authenticated;
grant select on public.quote_request_suppliers to authenticated;
grant insert (request_id, supplier_id, user_id, token) on public.quote_request_suppliers to authenticated;
grant update (token, sent_at) on public.quote_request_suppliers to authenticated;

grant select, insert, update on public.quote_requests, public.quote_request_suppliers to service_role;

-- ── Prices as stored, whoever writes them ───────────────────────────
-- Only the request's own item ids, each {price: number >= 0 or null,
-- unavailable: bool, note: text <= 300}; a line marked unavailable has no
-- price. CASE, not AND, guards the cast: SQL doesn't promise AND's order.
create or replace function public.quote_request_clean_prices(p_prices jsonb, p_items jsonb) returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
           'price', case when coalesce(e.value -> 'unavailable' = 'true'::jsonb, false) then 'null'::jsonb
                         when jsonb_typeof(e.value -> 'price') <> 'number' then 'null'::jsonb
                         when (e.value ->> 'price')::numeric >= 0 and (e.value ->> 'price')::numeric < 10000000 then e.value -> 'price'
                         else 'null'::jsonb end,
           'unavailable', coalesce(e.value -> 'unavailable' = 'true'::jsonb, false),
           'note', left(coalesce(e.value ->> 'note', ''), 300))), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p_prices) = 'object' then p_prices else '{}'::jsonb end) e
   where jsonb_typeof(e.value) = 'object'
     and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) i where i ->> 'id' = e.key)
$$;

revoke all on function public.quote_request_clean_prices(jsonb, jsonb) from public;
revoke execute on function public.quote_request_clean_prices(jsonb, jsonb) from anon;
grant execute on function public.quote_request_clean_prices(jsonb, jsonb) to authenticated, service_role;

-- ── The owner's entry: typed in, or read from the supplier's document ──
-- p_seen_responded_at is the answer time the owner's page showed (null for
-- none): if the supplier answered online meanwhile, nothing is changed.
-- p_status 'waiting' puts the row back so the supplier can answer again.
-- Security definer because the owner has no update grant on these columns;
-- every row is looked up by auth.uid().
create or replace function public.record_quote_request_response(
  p_id uuid,
  p_seen_responded_at timestamptz,
  p_status text,
  p_source text,
  p_prices jsonb,
  p_delivery numeric,
  p_vat_included boolean,
  p_valid_until date,
  p_note text,
  p_document_path text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.quote_request_suppliers%rowtype;
  v_request public.quote_requests%rowtype;
begin
  select * into v_row from public.quote_request_suppliers s where s.id = p_id and s.user_id = auth.uid() for update;
  if not found then
    raise exception 'That supplier isn''t on one of your requests.' using errcode = '42501';
  end if;
  select * into v_request from public.quote_requests r where r.id = v_row.request_id and r.user_id = v_row.user_id;
  if v_request.status <> 'open' then
    raise exception 'This request is closed. Reopen it to change a supplier''s prices.' using errcode = '55000';
  end if;
  if v_row.responded_at is distinct from p_seen_responded_at then
    raise exception 'This supplier''s answer has changed since the page loaded (they may have replied online). Reload to see it.' using errcode = '40001';
  end if;
  if p_status is null or p_status not in ('waiting', 'replied', 'declined')
     or (p_status <> 'waiting' and (p_source is null or p_source not in ('manual', 'scan'))) then
    raise exception 'That isn''t an answer the app knows.' using errcode = '22023';
  end if;
  if p_document_path is not null and (p_document_path not like auth.uid()::text || '/%' or p_document_path like '%..%') then
    raise exception 'The document must be one of your own uploads.' using errcode = '42501';
  end if;
  if p_delivery is not null and p_delivery < 0 then
    raise exception 'Delivery can''t be less than £0.' using errcode = '22023';
  end if;

  update public.quote_request_suppliers s
     set previous = case when v_row.status = 'waiting' then s.previous else s.previous || jsonb_build_array(jsonb_build_object(
           'status', v_row.status, 'source', v_row.source, 'responded_at', v_row.responded_at,
           'responder_name', v_row.responder_name, 'prices', v_row.prices, 'delivery', v_row.delivery,
           'vat_included', v_row.vat_included, 'valid_until', v_row.valid_until, 'note', v_row.note,
           'document_path', v_row.document_path, 'replaced_at', now())) end,
         status = p_status,
         source = case when p_status = 'waiting' then null else p_source end,
         responded_at = case when p_status = 'waiting' then null else now() end,
         responder_name = null,
         prices = case when p_status = 'replied' then public.quote_request_clean_prices(p_prices, v_request.items) else '{}'::jsonb end,
         delivery = case when p_status = 'replied' then p_delivery end,
         vat_included = (p_status = 'replied' and coalesce(p_vat_included, false)),
         valid_until = case when p_status = 'replied' then p_valid_until end,
         note = case when p_status = 'waiting' then '' else left(coalesce(p_note, ''), 2000) end,
         document_path = case when p_status = 'waiting' then null else p_document_path end
   where s.id = v_row.id;
end $$;

-- ── The supplier's own answer, through their link ───────────────────
-- Called by the server with the service role. Returns the row it applied
-- to, or nothing when the link is unknown, already answered (by anyone),
-- the request is closed, or its needed-by date has passed.
create or replace function public.submit_quote_request_response(
  p_token text,
  p_status text,
  p_prices jsonb,
  p_delivery numeric,
  p_vat_included boolean,
  p_valid_until date,
  p_note text,
  p_name text
) returns table (row_id uuid, req_id uuid, owner_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_row public.quote_request_suppliers%rowtype;
  v_request public.quote_requests%rowtype;
begin
  if p_status is null or p_status not in ('replied', 'declined') or (p_delivery is not null and p_delivery < 0) then
    return;
  end if;
  select * into v_row from public.quote_request_suppliers s where s.token = p_token for update;
  if not found or v_row.status <> 'waiting' then
    return;
  end if;
  select * into v_request from public.quote_requests r where r.id = v_row.request_id and r.user_id = v_row.user_id;
  if not found or v_request.status <> 'open' or (v_request.needed_by is not null and v_request.needed_by < current_date) then
    return;
  end if;
  update public.quote_request_suppliers s
     set status = p_status,
         source = 'online',
         responded_at = now(),
         responder_name = nullif(left(btrim(coalesce(p_name, '')), 120), ''),
         prices = case when p_status = 'replied' then public.quote_request_clean_prices(p_prices, v_request.items) else '{}'::jsonb end,
         delivery = case when p_status = 'replied' then p_delivery end,
         vat_included = (p_status = 'replied' and coalesce(p_vat_included, false)),
         valid_until = case when p_status = 'replied' then p_valid_until end,
         note = left(coalesce(p_note, ''), 2000)
   where s.id = v_row.id;
  return query select v_row.id, v_row.request_id, v_row.user_id;
end $$;

revoke all on function public.record_quote_request_response(uuid, timestamptz, text, text, jsonb, numeric, boolean, date, text, text) from public;
revoke execute on function public.record_quote_request_response(uuid, timestamptz, text, text, jsonb, numeric, boolean, date, text, text) from anon;
grant execute on function public.record_quote_request_response(uuid, timestamptz, text, text, jsonb, numeric, boolean, date, text, text) to authenticated;
revoke all on function public.submit_quote_request_response(text, text, jsonb, numeric, boolean, date, text, text) from public;
revoke execute on function public.submit_quote_request_response(text, text, jsonb, numeric, boolean, date, text, text) from anon, authenticated;
grant execute on function public.submit_quote_request_response(text, text, jsonb, numeric, boolean, date, text, text) to service_role;

-- ── Checks after running ────────────────────────────────────────────
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid in ('public.quote_requests'::regclass, 'public.quote_request_suppliers'::regclass) order by 1;
--     -> request FK (request_id, user_id) ON DELETE RESTRICT, supplier FK ON DELETE RESTRICT,
--        unique (id, user_id), (request_id, supplier_id), token; status/answer/value checks
--   select tgname from pg_trigger where tgrelid in ('public.quote_requests'::regclass, 'public.quote_request_suppliers'::regclass) and not tgisinternal;
--     -> quote_requests_lock_items, quote_request_suppliers_same_owner
--   select relname, relrowsecurity from pg_class where relname in ('quote_requests', 'quote_request_suppliers');  -> true, true
--   select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--     where table_name in ('quote_requests', 'quote_request_suppliers') and grantee in ('anon', 'authenticated') group by 1, 2;
--     -> authenticated SELECT only at table level; anon none
--   select table_name, column_name, privilege_type from information_schema.column_privileges
--     where table_name in ('quote_requests', 'quote_request_suppliers') and grantee = 'authenticated' and privilege_type <> 'SELECT' order by 1, 3, 2;
--     -> the insert/update columns above, nothing else
--   select routine_name, grantee from information_schema.routine_privileges
--     where routine_name in ('record_quote_request_response', 'submit_quote_request_response', 'quote_request_clean_prices') order by 1, 2;
--     -> record_: authenticated (+ postgres, service_role); submit_: service_role (+ postgres);
--        clean_prices: authenticated, service_role (+ postgres)
--   select public.quote_request_clean_prices('{"a":{"price":5,"note":"x"},"b":{"price":-1},"c":{"price":"7"},"d":{"price":3,"unavailable":true},"zz":{"price":1}}',
--     '[{"id":"a"},{"id":"b"},{"id":"c"},{"id":"d"}]');
--     -> a price 5, b/c/d price null, d unavailable, no zz
--   Rolled back, as authenticated: owner makes a request and adds own supplier, can't add another
--   account's client (23503) or a row on another account's request (FK), can't delete (42501),
--   can't update status/prices directly (42501); record_ with the right seen time writes manual
--   prices keyed only by the request's item ids, with a stale seen time refuses (40001), for another
--   user refuses; items can't change once sent_at is set (55000). As service_role: submit_ answers
--   once (second call returns nothing), refuses a closed request and a past needed-by date; record_
--   over an online answer moves it into previous and marks the row manual.
