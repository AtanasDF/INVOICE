-- The last five foreign keys that let one account point at another's rows.
--
-- WHY THIS EXISTS. Foreign key checks bypass row level security. migration-017
-- wrote that down and fixed it for receipts' own references with composite
-- keys; 020, 023, 025, 026 and 028 fixed it for every table they created with
-- a `*_same_owner` trigger; 038 fixed vat_checks. The five references that
-- predate the habit were never gone back to:
--
--   receipts.client_id            -> clients   (schema.sql, RESTRICT since 014)
--   invoices.client_id            -> clients   (schema.sql, RESTRICT since 014)
--   recurring_invoices.client_id  -> clients   (011, RESTRICT since 015)
--   recurring_expenses.supplier_id-> clients   (005, RESTRICT since 015)
--   credit_notes.invoice_id       -> invoices  (002, CASCADE)
--
-- RLS stops an account reading or writing another's rows, but not naming one
-- in these columns. So a signed-in account holding another account's client id
-- can attach its own receipt, invoice or schedule to it, and because those
-- keys are RESTRICT, the other account can then never remove that client --
-- the app tells them it has history they cannot see. A credit note can be
-- hung on another account's invoice the same way. The failed insert also
-- answers "does this id exist?" for any uuid. The ids are random, so this
-- needs one to leak first; it is the same class 017 and 038 closed, finished.
--
-- Triggers rather than composite keys, matching 020-028: a composite key here
-- would need `alter table ... add constraint` on four tables holding real
-- records, and a backup of each. A trigger checks new and changed rows only.
-- It runs as the caller, so under the API it reads clients/invoices through
-- RLS (another account's row is simply not found), and under the service role
-- (the inbox import, the recurring cron) it still compares user_id.
--
-- EXISTING ROWS ARE NOT RE-CHECKED. Query 1 below finds any already pointing
-- across accounts; it should return nothing. If it returns rows, they are
-- flagged, not changed (rule 1).
--
-- NO BACKUP FILE. This creates five functions and five triggers. It adds no
-- column, changes no constraint and touches no row (the precedent is 034), so
-- CLAUDE.md rule 2 asks for none.
--
-- Additive and idempotent: safe to run twice.

create or replace function public.receipts_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients where id = new.client_id and user_id = new.user_id) then
    raise exception 'The supplier on a receipt must be one of your own.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger receipts_same_owner
  before insert or update of client_id, user_id on public.receipts
  for each row execute function public.receipts_same_owner();

create or replace function public.invoices_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients where id = new.client_id and user_id = new.user_id) then
    raise exception 'The client on an invoice must be one of your own.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger invoices_same_owner
  before insert or update of client_id, user_id on public.invoices
  for each row execute function public.invoices_same_owner();

create or replace function public.recurring_invoices_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients where id = new.client_id and user_id = new.user_id) then
    raise exception 'The client on a recurring invoice must be one of your own.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger recurring_invoices_same_owner
  before insert or update of client_id, user_id on public.recurring_invoices
  for each row execute function public.recurring_invoices_same_owner();

create or replace function public.recurring_expenses_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.supplier_id is not null and not exists (select 1 from public.clients where id = new.supplier_id and user_id = new.user_id) then
    raise exception 'The supplier on a recurring expense must be one of your own.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger recurring_expenses_same_owner
  before insert or update of supplier_id, user_id on public.recurring_expenses
  for each row execute function public.recurring_expenses_same_owner();

create or replace function public.credit_notes_same_owner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.invoices where id = new.invoice_id and user_id = new.user_id) then
    raise exception 'A credit note can only be made against one of your own invoices.' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace trigger credit_notes_same_owner
  before insert or update of invoice_id, user_id on public.credit_notes
  for each row execute function public.credit_notes_same_owner();

revoke all on function public.receipts_same_owner() from public, anon, authenticated;
revoke all on function public.invoices_same_owner() from public, anon, authenticated;
revoke all on function public.recurring_invoices_same_owner() from public, anon, authenticated;
revoke all on function public.recurring_expenses_same_owner() from public, anon, authenticated;
revoke all on function public.credit_notes_same_owner() from public, anon, authenticated;

-- ── Checks after running ────────────────────────────────────────────
-- 1. Rows already pointing across accounts. Expect 0 rows; run it before too.
--   select 'receipts' as t, r.id from public.receipts r join public.clients c on c.id = r.client_id where c.user_id <> r.user_id
--   union all select 'invoices', i.id from public.invoices i join public.clients c on c.id = i.client_id where c.user_id <> i.user_id
--   union all select 'recurring_invoices', ri.id from public.recurring_invoices ri join public.clients c on c.id = ri.client_id where c.user_id <> ri.user_id
--   union all select 'recurring_expenses', re.id from public.recurring_expenses re join public.clients c on c.id = re.supplier_id where c.user_id <> re.user_id
--   union all select 'credit_notes', cn.id from public.credit_notes cn join public.invoices i on i.id = cn.invoice_id where i.user_id <> cn.user_id;
--
-- 2. The five triggers:
--   select tgrelid::regclass, tgname from pg_trigger where tgname like '%\_same\_owner' order by 1;
--
-- 3. Exercised as the Hidefield owner in a transaction ending in a raise:
--    pointing a new receipt at the test account's first client must fail with
--    "The supplier on a receipt must be one of your own.", and pointing one at
--    Hidefield's own first client must not.
--   begin;
--   select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = 'fragov@hidefield.co.uk'), true);
--   set local role authenticated;
--   insert into public.receipts (user_id, date, client_id)
--     values (auth.uid(), '2026-10-20', (select id from public.clients where user_id = auth.uid() limit 1));
--   reset role;
--   set local role authenticated;
--   insert into public.receipts (user_id, date, client_id)
--     values (auth.uid(), '2026-10-20', '<a client id from atanaschoo@gmail.com, looked up as postgres first>');
--   rollback;
