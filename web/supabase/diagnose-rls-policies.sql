-- READ-ONLY. Investigates the "two overlapping RLS policies" flag on
-- clients/receipts/invoices. Changes nothing -- just SELECTs.
--
-- I can't query pg_policies myself (the app only has the public anon
-- key, which can't see database internals), so this needs to be run and
-- the output pasted back before I touch any policy. Dropping the wrong
-- one, or dropping one whose definition differs from what I assume, is
-- exactly the kind of thing worth seeing first rather than guessing.

select
  schemaname,
  tablename,
  policyname,
  cmd,          -- which operation this policy governs: select/insert/update/delete/all
  permissive,   -- 'PERMISSIVE' policies are OR'd together; 'RESTRICTIVE' are AND'd
  roles,
  qual,         -- the USING expression
  with_check    -- the WITH CHECK expression
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'receipts', 'invoices', 'credit_notes', 'business_profile')
order by tablename, policyname;
