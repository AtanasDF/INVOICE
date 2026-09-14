-- READ-ONLY. Investigates the report that feedback submissions aren't
-- actually persisting even though the form clears and looks successful.
-- Changes nothing -- just SELECTs.
--
-- I reviewed feedback/page.tsx and feedbackStore.add() in storage.ts and
-- they're structurally identical to every other store in the app
-- (clientsStore, receiptsStore, etc.) that's already been verified
-- working all session: .insert({...}).select().single(), and any error
-- is thrown and shown to the user rather than swallowed. I also confirmed
-- an unauthenticated insert is correctly rejected by RLS (42501), so RLS
-- isn't simply switched off. I can't go further than that myself -- no
-- SQL access beyond the public anon key, and no authenticated session to
-- actually submit a real one and watch what happens. This is the next
-- step: see what's actually configured and actually in the table.

-- 1. Is RLS actually turned on for this table?
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'feedback' and relnamespace = 'public'::regnamespace;

-- 2. Every policy currently defined on it, whatever it's actually named
-- (migration-003 only creates "feedback_owner_all" if a policy by that
-- exact name doesn't already exist -- if something else was created
-- under that name during an earlier attempt tonight, this migration
-- would have silently left it in place rather than fixing it).
select
  policyname,
  cmd,          -- which operation this policy governs: select/insert/update/delete/all
  permissive,   -- 'PERMISSIVE' policies are OR'd together; 'RESTRICTIVE' are AND'd -- a
                -- stray RESTRICTIVE policy here would block inserts the permissive one allows
  roles,
  qual,         -- the USING expression
  with_check    -- the WITH CHECK expression -- this is the one that actually
                -- governs INSERT; if it's null or wrong, that's the bug
from pg_policies
where schemaname = 'public' and tablename = 'feedback';

-- 3. Is anything actually in the table right now? If Cowork's test
-- submitted through the real UI and it's really not persisting, this
-- should be empty (or missing whatever was just submitted). If rows ARE
-- here, the write path works and the bug is more likely in reading it
-- back (the "Previously sent" list on the feedback page) or in how the
-- test was performed.
select id, user_id, category, page, created_at, left(message, 60) as message_preview
from public.feedback
order by created_at desc
limit 20;

select count(*) as total_feedback_rows from public.feedback;
