-- The database answers "what day is it" in UTC. The app answers in London.
--
-- WHY THIS EXISTS. `src/lib/today.ts` is the only place the app asks what day
-- it is, and it answers in Europe/London, because these are UK accounting
-- records. CLAUDE.md gives the whole story: for the hour after midnight on a
-- summer night, UTC still says yesterday, and that hour once dated a receipt
-- into the wrong day, the wrong VAT quarter, and out of the tax card entirely.
-- `harness/test-utc-today.mjs` pins the pattern in TypeScript so a new screen
-- cannot reintroduce it.
--
-- It could not see this. Supabase runs Postgres in UTC, so `current_date`
-- inside a function is the UTC date, and four functions used it as though it
-- were today:
--
--   respond_to_quote_link (026)        a quote could be ACCEPTED for an hour
--                                      after it expired. The customer's page
--                                      says "valid until 26 September" and
--                                      shows no buttons from 00:00 BST on the
--                                      27th, while the database still let the
--                                      answer through until 01:00 -- so the
--                                      owner is bound to a price they set to
--                                      expire the day before, and the refusal
--                                      on screen was untrue.
--   generate_recurring_invoice (016)   a recurring invoice raised in that hour
--                                      is DATED YESTERDAY, and its due date is
--                                      30 days from yesterday. That is a wrong
--                                      date in the accounting record, and on
--                                      the first of a quarter it falls into the
--                                      previous VAT period -- the exact damage
--                                      the TypeScript fix was made to stop. It
--                                      also compares next_due_date <=
--                                      current_date, so a schedule due today
--                                      can be generated a day early.
--   submit_quote_request_response (028) a supplier could send prices for an
--                                      hour after needed_by had passed.
--
-- WHAT IS DELIBERATELY NOT CHANGED. `quotes.date` and `invoice_payments.date`
-- both carry `default current_date`. The app always sends a date (from
-- todayISO()), so those defaults are a fallback nothing reaches; changing them
-- would alter existing tables, which under CLAUDE.md rule 2 would need a
-- backup file, for no behavioural gain. They are written down here rather than
-- quietly left: if anything ever inserts without a date, fix them then.
-- migration-036 has its own inline copy of the London-day expression, which is
-- correct and is left as it is.
--
-- NO BACKUP FILE. This creates one function and replaces three. It alters no
-- table, adds no column and touches no row, so CLAUDE.md rule 2 asks for none
-- and this header says so.
--
-- Additive and idempotent: safe to run twice. Every function body below is the
-- current one with `current_date` replaced by `public.uk_today()` and nothing
-- else changed -- diff them against 016, 026 and 028 before running.

-- ---------------------------------------------------------------------------
-- One place that answers it, as the app has one place
-- ---------------------------------------------------------------------------
-- STABLE, not IMMUTABLE: it depends on the clock, so it must never be folded
-- into an index or cached across statements.
create or replace function public.uk_today()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone 'Europe/London')::date $$;

comment on function public.uk_today() is
  'Today in Europe/London, matching todayISO() in src/lib/today.ts. Postgres runs in UTC on Supabase, so current_date is an hour wrong for an hour after midnight through the British summer.';

revoke all on function public.uk_today() from public, anon, authenticated;
-- The two invoker-rights functions below are granted to service_role only, so
-- that is who calls this. generate_recurring_invoice is SECURITY DEFINER and
-- runs as the owner, which needs no grant.
grant execute on function public.uk_today() to service_role;

-- ---------------------------------------------------------------------------
-- A quote cannot be accepted after it expires
-- ---------------------------------------------------------------------------
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
  -- An earlier answer doesn't block a new one: the quote has to be back at
  -- sent (the owner reopened it) for the update below to apply.
  select * into v_link from public.quote_links where token = p_token for update;
  if not found then
    return;
  end if;
  update public.quotes q
     set status = p_response
   where q.id = v_link.quote_id and q.user_id = v_link.user_id and q.status = 'sent'
     and (q.valid_until is null or q.valid_until >= public.uk_today());
  if not found then
    return;
  end if;
  update public.quote_links
     set response = p_response, responded_at = now(), responder_name = nullif(left(trim(coalesce(p_name, '')), 120), '')
   where quote_links.quote_id = v_link.quote_id;
  return query select v_link.quote_id, v_link.user_id;
end $$;

revoke all on function public.respond_to_quote_link(text, text, text) from public;
revoke execute on function public.respond_to_quote_link(text, text, text) from anon, authenticated;
grant execute on function public.respond_to_quote_link(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- A recurring invoice is dated today, in London
-- ---------------------------------------------------------------------------
create or replace function public.generate_recurring_invoice(p_recurring_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.recurring_invoices%rowtype;
  v_invoice_id uuid;
begin
  select ri.* into v_row
  from public.recurring_invoices ri
  left join public.clients c on c.id = ri.client_id
  where ri.id = p_recurring_invoice_id
    and ri.active = true
    and ri.next_due_date <= public.uk_today()
    and coalesce(c.archived, false) = false
  for update of ri;

  if not found then
    raise exception 'Recurring invoice % not found, not active, not yet due, or its client is archived.', p_recurring_invoice_id;
  end if;

  insert into public.invoices (user_id, client_id, date, number, items, notes, due_date, payment_terms, status, tags)
  values (
    v_row.user_id,
    v_row.client_id,
    public.uk_today(),
    'DRAFT-' || gen_random_uuid()::text,
    v_row.items,
    v_row.notes,
    (public.uk_today() + interval '30 days')::date,
    v_row.payment_terms,
    'draft',
    '[]'::jsonb
  )
  returning id into v_invoice_id;

  -- Postgres CLAMPS a month end and the app now does the same (see commit
  -- 4e53854): 31 January plus a month is 28 February, not 3 March. Unchanged
  -- here on purpose -- this is the definition the app was made to agree with.
  update public.recurring_invoices
     set next_due_date = (v_row.next_due_date + interval '1 month')::date
   where id = p_recurring_invoice_id;

  return v_invoice_id;
end;
$$;

revoke all on function public.generate_recurring_invoice(uuid) from public;
revoke execute on function public.generate_recurring_invoice(uuid) from anon;
grant execute on function public.generate_recurring_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A supplier cannot answer after the day it was needed by
-- ---------------------------------------------------------------------------
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
  if not found or v_request.status <> 'open' or (v_request.needed_by is not null and v_request.needed_by < public.uk_today()) then
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

revoke all on function public.submit_quote_request_response(text, text, jsonb, numeric, boolean, date, text, text) from public;
revoke execute on function public.submit_quote_request_response(text, text, jsonb, numeric, boolean, date, text, text) from anon, authenticated;
grant execute on function public.submit_quote_request_response(text, text, jsonb, numeric, boolean, date, text, text) to service_role;

-- ── Checks after running ────────────────────────────────────────────
--   select public.uk_today(), current_date;
--     -> the same date except between 00:00 and 01:00 London time in summer,
--        when uk_today() is one day AHEAD of current_date. Worth running once
--        in that hour if you ever get the chance; otherwise trust the offset:
--   select (now() at time zone 'Europe/London')::date = public.uk_today();  -> true
--   select provolatile from pg_proc where proname = 'uk_today';  -> 's' (stable)
--
--   No function may still be asking UTC:
--   (prokind = 'f' matters: pg_get_functiondef throws outright on an aggregate,
--    so without it this check errors instead of answering.)
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prokind = 'f'
--      and pg_get_functiondef(p.oid) ~ 'current_date' order by 1;
--     -> nothing. (A hit here is the bug this migration exists to remove.)
--
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_name in ('uk_today', 'respond_to_quote_link', 'generate_recurring_invoice', 'submit_quote_request_response')
--      and grantee in ('anon', 'authenticated', 'service_role') order by 1, 2;
--     -> uk_today: service_role. respond_to_quote_link: service_role.
--        submit_quote_request_response: service_role.
--        generate_recurring_invoice: authenticated. anon: nowhere.
--
--   Exercised as `authenticated` inside a transaction that ends in a raise, so
--   nothing is left behind:
--   begin;
--     set local role authenticated;
--     select public.uk_today();                     -> permission denied (correct: no grant)
--     select public.generate_recurring_invoice(gen_random_uuid());
--       -> raises 'Recurring invoice ... not found...', which is the definer
--          function reaching uk_today() as the owner and getting past the grant
--   raise exception 'rolled back';
