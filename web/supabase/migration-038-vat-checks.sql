-- The record that a VAT number was checked, and when.
--
-- WHY THIS EXISTS. HMRC's "Check a UK VAT number" API returns a consultation
-- number when you give it your own VAT number alongside the one you are
-- checking. That reference is the evidence HMRC ask for if they ever query the
-- VAT reclaimed against a supplier who turns out not to have been registered:
-- it says this number was checked, on this date, and HMRC said it belonged to
-- this business. Nothing in notes/competitor-research.md offers it.
--
-- Today the number is shown under the box and then lost the moment the page
-- changes, which makes it a curiosity rather than a record. A reference nobody
-- keeps is the same as no reference.
--
-- NO BACKUP FILE. This creates one table and alters nothing that exists, so
-- CLAUDE.md rule 2 asks for none.
--
-- Additive and idempotent: safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. One row per check
-- ---------------------------------------------------------------------------
-- A history, not a status. The same supplier checked twice a year apart is two
-- rows, because what matters is what was true on the day -- a business can
-- deregister, and last March's reference does not cover this March's invoice.
create table if not exists public.vat_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The supplier this was about, where we know. Null is allowed: a number can
  -- be checked from Settings or a form before the contact exists, and losing
  -- the check because the contact was later merged away would be worse than
  -- keeping it loose.
  client_id uuid references public.clients (id) on delete set null,
  -- As HMRC hold it: nine or twelve digits, no GB.
  vat_number text not null,
  -- What HMRC said. Null name means they had nobody with that number, which is
  -- itself worth keeping -- it is the answer that stops a payment.
  registered boolean not null,
  name text,
  address text,
  -- HMRC's own reference, present only on a verified check (the two-number
  -- form). An unverified check is still worth recording; it just proves less.
  consultation_number text,
  -- HMRC's processingDate, kept as they sent it.
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vat_checks_user_idx on public.vat_checks (user_id, checked_at desc);
create index if not exists vat_checks_client_idx on public.vat_checks (user_id, client_id);
create index if not exists vat_checks_number_idx on public.vat_checks (user_id, vat_number);

-- ---------------------------------------------------------------------------
-- 2. Nobody else's
-- ---------------------------------------------------------------------------
alter table public.vat_checks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vat_checks' and policyname = 'vat_checks_own') then
    create policy vat_checks_own on public.vat_checks
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Supabase grants anon and authenticated everything on a new table by default,
-- and the anon key is published in the app itself. RLS is what protects the
-- rows, but the default grants are wider than anything needs -- see
-- migration-020 and migration-031, and the hole 037 shipped by naming only
-- `public, anon` in its revoke. Name authenticated explicitly.
revoke all on public.vat_checks from public, anon, authenticated;
grant select, insert on public.vat_checks to authenticated;

-- Deliberately no update and no delete. A record of what HMRC said on a date
-- is evidence; something you can quietly edit afterwards is not.
