-- The deposit-delete guard also covers a balance invoice whose link to
-- its quote was lost.
--
-- WHAT IS BROKEN NOW. migration-034's trigger refuses to delete a deposit
-- invoice while `quotes.invoice_id` points at a balance invoice. But the
-- balance invoice is made first and linked second (quotes/[id]/page.tsx:
-- insert, then quotesStore.linkInvoice, whose failure is swallowed), so a
-- network blip between the two leaves a balance invoice with the deposit
-- deduction frozen into it and a quote with invoice_id null. The quote
-- page relinks that orphan by its `from <number>` tag on its next load --
-- the app already knows this happens -- and until then the guard sees no
-- balance invoice and lets the deposit invoice go, which is exactly the
-- loss 034 was written to stop.
--
-- Now the guard also counts an unlinked invoice of the same owner tagged
-- `from <quote number>` as that quote's balance invoice.
--
-- NO BACKUP FILE IS NEEDED: this only redefines a trigger function and
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
       and (
         q.invoice_id is not null
         or exists (
           select 1
             from public.invoices i
            where i.user_id = q.user_id
              and i.id <> old.id
              and i.tags ? ('from ' || q.number)
         )
       )
  ) then
    raise exception 'The balance invoice for this quote takes this deposit off, so the deposit invoice can''t be removed.'
      using errcode = '23503';
  end if;
  return old;
end $$;

-- Check afterwards: the function body mentions the tag, and the trigger
-- from 034 still fires it.
--
--   select prosrc like '%''from '' || q.number%' as covers_orphans
--     from pg_proc where proname = 'block_deposit_invoice_delete' and pronamespace = 'public'::regnamespace;
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.invoices'::regclass and not tgisinternal;
--
-- And exercise it as the owner inside a transaction that rolls back: a
-- quote with a deposit invoice, invoice_id null, and an invoice tagged
-- `from <its number>` -- deleting the deposit invoice must raise 23503;
-- with the tagged invoice gone it must succeed.
