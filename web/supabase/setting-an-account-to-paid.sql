-- Putting an account on the paid plan, and taking it off again.
--
-- WHY THERE IS NO BUTTON FOR THIS. Nothing sells a paid plan yet, so the only
-- person who should be able to grant one is Atanas. A screen that could set it
-- would be a screen someone could find, and `businessProfileStore.save` refuses
-- it in the type system for the same reason (`SavableBusinessProfile` omits
-- `plan`). Until payments exist, this file is the whole mechanism.
--
-- Run it in the Supabase SQL editor, signed in as the project owner. Read the
-- answer back rather than assuming -- an email that does not match simply
-- updates nothing and says "0 rows", which looks identical to success if
-- nobody looks.

-- 1. Who is on what, right now.
select u.email,
       coalesce(p.plan, 'free') as plan,
       p.business_name
  from auth.users u
  left join business_profile p on p.user_id = u.id
 order by u.created_at;

-- 2. Put one account on paid. Change the address, run, and check it says 1 row.
-- update business_profile
--    set plan = 'paid'
--  where user_id = (select id from auth.users where email = 'someone@example.com');

-- 3. Put it back on free.
-- update business_profile
--    set plan = 'free'
--  where user_id = (select id from auth.users where email = 'someone@example.com');

-- 4. Check it took, and that the app will agree. `plan` is read by
-- scan_limits(), so a paid account gets no day limit and no month limit and is
-- never refused -- though its scans are still counted, so the cost of it can be
-- seen.
-- select u.email, p.plan from business_profile p
--   join auth.users u on u.id = p.user_id
--  where u.email = 'someone@example.com';

-- A NOTE ON SOMEONE WITH NO PROFILE ROW YET. An account that has never opened
-- Settings may have no `business_profile` row, and an update touches nothing.
-- Insert one rather than wondering why it did not work:
-- insert into business_profile (user_id, plan)
--   select id, 'paid' from auth.users where email = 'someone@example.com'
--   on conflict (user_id) do update set plan = 'paid';
