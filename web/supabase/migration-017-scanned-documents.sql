-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 008-backup-before-migration-017.sql FIRST -- this one alters
-- receipts, which carries real financial history.
--
-- Scanned supplier invoices and credit notes are EXPENSE documents, so
-- they live in receipts next to ordinary receipts and every existing sum
-- (dashboard month spend, expenses breakdown, exports) keeps working
-- untouched. The app's own invoices / credit_notes tables are the owner's
-- SALES side and are not touched here.
--
-- Everything is additive and safe to re-run. This file adds:
--   receipts.document_type        text not null default 'receipt'
--                                 check in (receipt, invoice, credit_note, other)
--   receipts.invoice_number       text
--   receipts.due_date             date
--   receipts.paid                 boolean not null default true
--   receipts.details              jsonb not null default '{}'
--   receipts.credit_of_receipt_id uuid
--   unique receipts_id_user_id_key (id, user_id)
--   fk     (credit_of_receipt_id, user_id) -> receipts(id, user_id)
--                                 on delete restrict
--   table  receipt_pages          (page 2+ of a multi-page scan; page 1 stays
--                                 in receipts.image_data_url so the list
--                                 view never loads the extra pages), with
--                                 fk (receipt_id, user_id) -> receipts(id, user_id)
--                                 on delete cascade
--   policy receipt_pages_owner_all
--   function create_receipt_with_pages(jsonb, text[]) returns uuid
--
-- ── 1. receipts columns ─────────────────────────────────────────────
-- A "bill" is a row with document_type 'invoice' and paid = false; the
-- default true keeps every existing receipt (already paid, by definition)
-- out of the bills list. A credit note is stored with NEGATIVE amount and
-- vat_amount so it nets against the month's spend without any SQL change,
-- and credit_of_receipt_id points at the invoice it refunds. RESTRICT
-- there for the same reason as migration-014/015: an invoice with a credit
-- note hanging off it shouldn't silently disappear from under it.
alter table public.receipts add column if not exists document_type text not null default 'receipt';
alter table public.receipts add column if not exists invoice_number text;
alter table public.receipts add column if not exists due_date date;
alter table public.receipts add column if not exists paid boolean not null default true;
alter table public.receipts add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.receipts add column if not exists credit_of_receipt_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.receipts'::regclass and conname = 'receipts_document_type_check'
  ) then
    alter table public.receipts
      add constraint receipts_document_type_check
      check (document_type in ('receipt', 'invoice', 'credit_note', 'other'));
  end if;
end $$;

-- Both self/child references below carry user_id alongside the id. FK
-- checks bypass RLS, so a plain references receipts(id) would happily
-- accept another account's receipt id; making (id, user_id) the target
-- means a row can only ever point at a receipt in its own account.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.receipts'::regclass and conname = 'receipts_id_user_id_key'
  ) then
    alter table public.receipts
      add constraint receipts_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.receipts'::regclass and conname = 'receipts_credit_of_receipt_id_fkey'
  ) then
    alter table public.receipts
      add constraint receipts_credit_of_receipt_id_fkey
      foreign key (credit_of_receipt_id, user_id) references public.receipts (id, user_id) on delete restrict;
  end if;
end $$;

-- ── 2. receipt_pages ────────────────────────────────────────────────
-- One row per extra page of a scanned document, page_index >= 2. Kept
-- out of receipts on purpose: the receipts list selects * and a 20-page
-- invoice would otherwise ship every page's image on every list load.
-- Cascade from the receipt -- a page has no meaning without its document.
create table if not exists public.receipt_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  page_index integer not null,
  image_data_url text not null,
  created_at timestamptz not null default now(),
  unique (receipt_id, page_index),
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete cascade
);

alter table public.receipt_pages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'receipt_pages' and policyname = 'receipt_pages_owner_all'
  ) then
    create policy "receipt_pages_owner_all" on public.receipt_pages
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── 3. create_receipt_with_pages ────────────────────────────────────
-- Saving a multi-page scan is two writes (the receipt, then its pages);
-- a dropped connection between them would leave a document missing its
-- later pages with nothing to flag it. One function, one transaction.
--
-- security INVOKER, unlike assign_invoice_number: it only writes rows the
-- caller could write directly, so RLS on both tables still applies and
-- user_id is pinned to auth.uid() regardless of what p_receipt carries.
-- p_receipt uses the receipts column names (snake_case), same shape the
-- app already sends to a plain insert; p_pages is page 2 onwards, in
-- order.
create or replace function public.create_receipt_with_pages(p_receipt jsonb, p_pages text[])
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rec public.receipts;
  v_id uuid;
begin
  v_rec := jsonb_populate_record(null::public.receipts, p_receipt);

  insert into public.receipts (
    user_id, client_id, date, vendor, category, amount, vat_amount,
    original_amount, original_vat_amount, original_currency, fx_rate,
    image_data_url, notes, starred, warranty_months, tags, line_items, needs_review,
    document_type, invoice_number, due_date, paid, details, credit_of_receipt_id
  )
  values (
    auth.uid(), v_rec.client_id, v_rec.date, v_rec.vendor, v_rec.category,
    coalesce(v_rec.amount, 0), coalesce(v_rec.vat_amount, 0),
    v_rec.original_amount, v_rec.original_vat_amount, v_rec.original_currency, v_rec.fx_rate,
    v_rec.image_data_url, v_rec.notes, coalesce(v_rec.starred, false), v_rec.warranty_months,
    coalesce(v_rec.tags, '[]'::jsonb), coalesce(v_rec.line_items, '[]'::jsonb), coalesce(v_rec.needs_review, false),
    coalesce(v_rec.document_type, 'receipt'), v_rec.invoice_number, v_rec.due_date, coalesce(v_rec.paid, true),
    coalesce(v_rec.details, '{}'::jsonb), v_rec.credit_of_receipt_id
  )
  returning id into v_id;

  insert into public.receipt_pages (user_id, receipt_id, page_index, image_data_url)
  select auth.uid(), v_id, i + 1, p_pages[i]
  from generate_subscripts(p_pages, 1) as i;

  return v_id;
end;
$$;

-- Same narrowing as migration-012: a plain CREATE FUNCTION is executable
-- by PUBLIC (every role, including anon), and Supabase also grants anon
-- its own explicit EXECUTE, so both need revoking. service_role is left
-- alone on purpose.
revoke all on function public.create_receipt_with_pages(jsonb, text[]) from public;
grant execute on function public.create_receipt_with_pages(jsonb, text[]) to authenticated;
revoke execute on function public.create_receipt_with_pages(jsonb, text[]) from anon;
