-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this only creates a new table (quotes), its
-- constraints and its owner policy; no existing table is altered.
-- Safe to re-run.
--
-- A quote is a priced offer to a client. It can be sent, accepted or
-- declined, and turned into a draft invoice; invoice_id then points at that
-- invoice. Both foreign keys are ON DELETE RESTRICT, the same as invoices'
-- client_id (migration-014/015): a client or invoice with a quote hanging
-- off it can't disappear from under it.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  client_id uuid references public.clients(id) on delete restrict,
  number text not null,
  date date not null default current_date,
  valid_until date,
  items jsonb not null default '[]'::jsonb,
  notes text not null default '',
  status text not null default 'draft',
  invoice_id uuid references public.invoices(id) on delete restrict,
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
--     -> status check, unique (user_id, number), both FKs ON DELETE RESTRICT
--   select relrowsecurity from pg_class where oid = 'public.quotes'::regclass;  -> true
--   Exercise as authenticated in a block that ends in raise exception (rolls back): insert a
--   quote for one user, check another user can't see it.
