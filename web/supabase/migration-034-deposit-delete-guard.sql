-- Stop a deposit invoice being deleted while a balance invoice is still
-- taking it off.
--
-- WHAT IS BROKEN NOW. A quote's deposit is invoiced on its own; the
-- balance invoice is then built with the deposit invoice's lines negated
-- (quantity -1), and those figures are FROZEN into the balance invoice's
-- `items` jsonb at the moment it is created (src/lib/quoteDeposit.ts).
-- Nothing ever recomputes them.
--
-- `quotes.deposit_invoice_id` is `on delete set null` (migration-022), so
-- removing the deposit invoice succeeds, silently clears the link, and
-- leaves the "Less deposit (invoice INV-1001)" line sitting on the balance
-- invoice. ON DELETE RESTRICT on invoice_payments does not help while the
-- deposit is unpaid -- which is exactly when it is most likely to be
-- deleted as a mistake.
--
-- The result: a £1,200 job invoiced as £360 deposit + £840 balance becomes
-- £840 asked for in total. The £360 is in no invoice, no turnover and no
-- VAT return, while the customer may still be holding the emailed copy of
-- the deposit invoice -- so money can arrive with no invoice behind it.
--
-- WHY A TRIGGER RATHER THAN `on delete restrict`. Blanket RESTRICT on
-- deposit_invoice_id would make every deposit invoice undeletable,
-- including a draft one raised by mistake, and it would dead-lock the
-- existing recovery: `quotesStore.releaseDeposit` updates
-- `.is("deposit_invoice_id", null)` and the "Let me invoice the deposit
-- again" banner is gated on there being no deposit invoice -- both only
-- become reachable BECAUSE the FK nulls the column on delete. The same
-- applies to `quotes.invoice_id`, where removing a draft invoice made from
-- a quote is deliberate (migration-020) and the quote page relinks an
-- orphan by its `from <number>` tag.
--
-- So this blocks one case only: the deposit invoice is still deductible
-- from a balance invoice that has already been made. Everything else --
-- deleting a draft deposit invoice, deleting a deposit invoice on a quote
-- that has not been balanced yet, deleting a draft invoice made from a
-- quote -- behaves exactly as it does today.
--
-- NO BACKUP FILE IS NEEDED: this creates a function and a trigger and
-- changes no row. Safe to run more than once.

create or replace function public.block_deposit_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.quotes q
     where q.deposit_invoice_id = old.id
       and q.invoice_id is not null
  ) then
    raise exception 'The balance invoice for this quote takes this deposit off, so the deposit invoice can''t be removed.'
      using errcode = '23503';
  end if;
  return old;
end $$;

drop trigger if exists block_deposit_invoice_delete on public.invoices;
create trigger block_deposit_invoice_delete
  before delete on public.invoices
  for each row
  execute function public.block_deposit_invoice_delete();

-- Check afterwards: the trigger exists and fires before delete.
--
--   select tgname, tgtype, tgenabled
--     from pg_trigger
--    where tgrelid = 'public.invoices'::regclass
--      and not tgisinternal;
--
-- And exercise it as the owner inside a transaction that rolls back. With
-- a quote that has both a deposit invoice and a balance invoice, this must
-- raise 23503; with either missing, the delete must succeed:
--
--   begin;
--     delete from public.invoices where id = '<the deposit invoice id>';
--   raise exception 'rolled back on purpose';
