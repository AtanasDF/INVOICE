-- Deletes the leftover test/placeholder records: "Jane Testworth" and
-- "Northlight Test Ltd", plus everything linked to them (their receipts,
-- invoices, and any credit notes against those invoices).
--
-- Explicitly confirmed by the user. Unlike every other script in this
-- folder, this one IS destructive by design -- that's the point. Each
-- DELETE below has a RETURNING clause, so the query output itself is a
-- record of exactly which rows were removed, in place of a separate
-- preview step.
--
-- Run once. Safe to run again afterward -- it'll just match zero rows
-- the second time.

-- Credit notes on any invoice belonging to these two records
delete from public.credit_notes
where invoice_id in (
  select id from public.invoices
  where client_id in (
    select id from public.clients where name in ('Jane Testworth', 'Northlight Test Ltd')
  )
)
returning *;

-- Invoices belonging to these two records
delete from public.invoices
where client_id in (
  select id from public.clients where name in ('Jane Testworth', 'Northlight Test Ltd')
)
returning *;

-- Receipts belonging to these two records
delete from public.receipts
where client_id in (
  select id from public.clients where name in ('Jane Testworth', 'Northlight Test Ltd')
)
returning *;

-- The client/supplier records themselves
delete from public.clients
where name in ('Jane Testworth', 'Northlight Test Ltd')
returning *;

-- Safety net: catches the known TEST-001 invoice and the known £240
-- receipt in case either was saved as a general expense (no client_id
-- link) rather than tied to the Northlight record above -- the earlier
-- description of the original three test rows didn't specify which.
-- If either of these returns nothing, everything was already caught by
-- the blocks above and there's nothing more to do.
delete from public.invoices where number = 'TEST-001' returning *;
delete from public.receipts where vendor ilike '%northlight%' and amount = 240 returning *;
