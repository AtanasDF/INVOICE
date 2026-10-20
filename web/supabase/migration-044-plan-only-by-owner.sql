-- business_profile.plan can be changed only by the project owner.
--
-- WHY THIS EXISTS. migration-036 added `plan` (free | paid) and made it the
-- whole of the scan limits: scan_limits() reads it, and a `paid` account has
-- no day limit and no month limit. Photo ageing (/api/photos/age) reads it too
-- and keeps every photograph of a paid account. The app is careful never to
-- write it -- `SavableBusinessProfile` omits it, and `setting-an-account-to-paid.sql`
-- is the only intended way in -- and storage.ts says "the database refuses it
-- too".
--
-- The database does not. business_profile carries Supabase's default table
-- grants and the owner policy is `for all ... with check (auth.uid() =
-- user_id)`, so any signed-in account can send, with its own token and the
-- published anon key:
--
--   PATCH /rest/v1/business_profile?user_id=eq.<own id>   {"plan":"paid"}
--
-- and from then on scans without limit, every one of them a paid Gemini read
-- on Atanas's prepaid balance. Nothing in the repo revokes the column; check
-- the live grants before assuming otherwise (query 1 below).
--
-- A column-level revoke cannot do it: Postgres ignores a column revoke while
-- the table-level UPDATE grant stands, and replacing that with a per-column
-- grant list would break every column added later. So a trigger refuses the
-- change when it comes from the API roles, and lets the SQL editor (postgres)
-- and the service role through.
--
-- NO BACKUP FILE. This creates one function and one trigger. It adds no
-- column, changes no constraint and touches no row (the same precedent as
-- migration-034's trigger), so CLAUDE.md rule 2 asks for none.
--
-- Additive and idempotent: safe to run twice.

create or replace function public.business_profile_plan_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.plan is distinct from (case when tg_op = 'INSERT' then 'free' else old.plan end) then
    raise exception 'The plan on an account can only be changed by Invoiceover.' using errcode = '42501';
  end if;
  return new;
end $$;

-- A trigger function cannot be called on its own, but it is still executable
-- by PUBLIC by default; there is no reason for any API role to hold it.
revoke all on function public.business_profile_plan_guard() from public, anon, authenticated;

create or replace trigger business_profile_plan_guard
  before insert or update of plan on public.business_profile
  for each row execute function public.business_profile_plan_guard();

-- ── Checks after running ────────────────────────────────────────────
-- 1. Before or after: what the API roles may do to the table. If this shows
--    `authenticated` holding UPDATE, the hole was live until this ran.
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'business_profile'
--      and grantee in ('anon', 'authenticated') group by 1;
--
-- 2. The trigger is there:
--   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'business_profile_plan_guard';
--
-- 3. Exercised as the Hidefield owner, in a transaction ending in a raise.
--    Expect: "The plan on an account can only be changed by Invoiceover."
--    from the first update, and the business-name update in the second block
--    to go through (the guard must not get in the way of Settings).
--   begin;
--   select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = 'fragov@hidefield.co.uk'), true);
--   set local role authenticated;
--   update public.business_profile set plan = 'paid' where user_id = auth.uid();
--   rollback;
--
--   begin;
--   select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = 'fragov@hidefield.co.uk'), true);
--   set local role authenticated;
--   update public.business_profile set business_name = business_name where user_id = auth.uid();
--   do $$ begin raise exception 'rolled back on purpose'; end $$;
--
-- 4. setting-an-account-to-paid.sql still works from the SQL editor (role
--    postgres): try it on the test account, then put it back to free.
