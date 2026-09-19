-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this only creates a new table (quotes), its
-- constraints, an ownership trigger and its owner policy; no existing table
-- is altered. Safe to re-run.
--
-- A quote is a priced offer to a client. It can be sent, accepted or
-- declined, and turned into a draft invoice; invoice_id then points at that
-- invoice. client_id is ON DELETE RESTRICT like invoices' (migration-014/015).
-- invoice_id is ON DELETE SET NULL: removing a draft invoice made from a
-- quote unlinks it, and the quote page then offers to put the quote back.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete restrict,
  number text not null,
  date date not null default current_date,
  valid_until date,
  items jsonb not null default '[]'::jsonb,
  notes text not null default '',
  status text not null default 'draft',
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_status_check') then
    alter table public.quotes
      add constraint quotes_status_check check (status in ('draft', 'sent', 'accepted', 'declined', 'invoiced'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_user_id_number_key') then
    alter table public.quotes add constraint quotes_user_id_number_key unique (user_id, number);
  end if;
end $$;

-- FK checks bypass RLS, so a plain foreign key would accept another
-- account's client or invoice id (and RESTRICT would then block that
-- account's delete). A quote may only point at rows in its own account.
create or replace function public.quotes_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients where id = new.client_id and user_id = new.user_id) then
    raise exception 'The client on a quote must be one of your own.' using errcode = '23503';
  end if;
  if new.invoice_id is not null and not exists (select 1 from public.invoices where id = new.invoice_id and user_id = new.user_id) then
    raise exception 'The invoice on a quote must be one of your own.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger quotes_same_owner
  before insert or update of client_id, invoice_id, user_id on public.quotes
  for each row execute function public.quotes_same_owner();

alter table public.quotes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_owner_all') then
    create policy quotes_owner_all on public.quotes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update on public.quotes to authenticated;

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'quotes' order by ordinal_position;
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.quotes'::regclass;
--     -> status check, unique (user_id, number), client FK RESTRICT, invoice FK SET NULL
--   select tgname from pg_trigger where tgrelid = 'public.quotes'::regclass and not tgisinternal;  -> quotes_same_owner
--   select relrowsecurity from pg_class where oid = 'public.quotes'::regclass;  -> true
--   Exercise as authenticated in a block that ends in raise exception (rolls back): insert a
--   quote for one user, check another user can't see it, can't point a quote at the
--   first user's client, and that the first user can't point one at a foreign invoice.
