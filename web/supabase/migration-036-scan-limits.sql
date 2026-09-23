-- How many documents a free account may have read, and the counting behind it.
--
-- WHY THIS EXISTS. There is no limit of any kind today: a free account can put
-- unlimited documents through the reader, and every one of them costs Atanas
-- money. Launching to depots full of drivers without this is the one thing on
-- the plan that cannot slip (notes/launch-plan.md). The numbers are his
-- (notes/pricing-and-limits.md); the mechanism is notes/scan-limits-design.md.
--
-- 50 a day, 600 a calendar month, one self-serve top-up of another 600 per
-- month, and 300 a day for the first seven days of a new account. The cap
-- exists to stop the app being used as a free bulk reader, not to ration a
-- tradesman: the most a free account can cost in a month is 1,200 documents,
-- which is pennies.
--
-- WHY A TABLE RATHER THAN THE EXISTING RATE LIMITER. `hit_rate_limit`
-- (migration-018) is a sliding window over HMAC'd keys, deliberately
-- unreadable and deliberately forgetful -- which is right for "10 an hour per
-- IP" and wrong here. This has to be shown to the person it applies to ("38 of
-- 50 today"), summed over a calendar month, and topped up once. That needs
-- rows you can read back.
--
-- WHY THE DAY IS LONDON'S. `(now() at time zone 'Europe/London')::date`,
-- matching todayISO(). Britain is UTC+1 from late March to late October, so a
-- UTC day would reset an hour early for half the year -- a limit that comes
-- back at 11pm in summer and midnight in winter is a bug people feel and can
-- never explain. This app has already been bitten by exactly that once
-- (CLAUDE.md, "What day it is").
--
-- WHY THE FUNCTIONS TAKE NO USER ID. Every one of them reads auth.uid() for
-- itself. A user id passed in would let any signed-in account spend, inspect
-- or top up somebody else's allowance -- and they are security definer, so
-- RLS would not stop it.
--
-- BACKUP. 016-backup-before-migration-036.sql, because `business_profile`
-- gains a column. The two new tables need none.
--
-- Additive and idempotent: safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. What has been read, and when
-- ---------------------------------------------------------------------------
create table if not exists scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  scans integer not null default 0 check (scans >= 0),
  primary key (user_id, day)
);

-- The month total is a sum over these rows rather than a second counter, so
-- the daily and monthly figures can never disagree.
create index if not exists scan_usage_user_day_idx on scan_usage (user_id, day desc);

-- ---------------------------------------------------------------------------
-- 2. The one top-up a month
-- ---------------------------------------------------------------------------
-- Claimed, not counted: unique on (user, month) so two taps racing each other
-- cannot both win.
create table if not exists scan_topups (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- ---------------------------------------------------------------------------
-- 3. Free or paid
-- ---------------------------------------------------------------------------
-- Nothing sells this yet; it exists so that the day payments arrive, none of
-- the above has to be rebuilt. Everyone is 'free' until he says otherwise.
alter table business_profile add column if not exists plan text not null default 'free';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_profile_plan_check') then
    alter table business_profile add constraint business_profile_plan_check check (plan in ('free', 'paid'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Who may see what
-- ---------------------------------------------------------------------------
alter table scan_usage enable row level security;
alter table scan_topups enable row level security;

-- Readable by the person it is about, so the app can show "38 of 50 today"
-- without a round trip through a function. Writable only through the
-- functions below: a row people could update themselves is not a limit.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'scan_usage' and policyname = 'scan_usage_select_own') then
    create policy scan_usage_select_own on scan_usage for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'scan_topups' and policyname = 'scan_topups_select_own') then
    create policy scan_topups_select_own on scan_topups for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- Supabase grants anon/authenticated everything on a new table by default.
-- Revoke first, then give back only the reading the policies above describe.
revoke all on scan_usage from anon, authenticated;
revoke all on scan_topups from anon, authenticated;
grant select on scan_usage to authenticated;
grant select on scan_topups to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The rules, in one place
-- ---------------------------------------------------------------------------
-- Every limit is decided here, so the app, the wall it draws and the counting
-- can never disagree about what the numbers are.
create or replace function scan_limits()
returns table (day_limit integer, month_limit integer, welcome boolean, plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_created timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select coalesce(p.plan, 'free') into v_plan from business_profile p where p.user_id = v_user;
  v_plan := coalesce(v_plan, 'free');
  select u.created_at into v_created from auth.users u where u.id = v_user;

  -- The first seven days of an account are generous on purpose: someone
  -- catching up on a year of receipts should not meet a wall on their first
  -- evening. The monthly cap is lifted with it, or the burst would hit it.
  welcome := v_plan = 'free' and v_created is not null and v_created > now() - interval '7 days';
  plan := v_plan;

  if v_plan = 'paid' then
    day_limit := null;
    month_limit := null;
  elsif welcome then
    day_limit := 300;
    month_limit := null;
  else
    day_limit := 50;
    month_limit := 600;
  end if;

  return next;
end $$;

-- ---------------------------------------------------------------------------
-- 6. What is left
-- ---------------------------------------------------------------------------
create or replace function scan_allowance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/London')::date;
  v_month text := to_char((now() at time zone 'Europe/London')::date, 'YYYY-MM');
  v_lim record;
  v_today integer;
  v_month_used integer;
  v_topped boolean;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_lim from scan_limits();

  select coalesce(scans, 0) into v_today from scan_usage where user_id = v_user and day = v_day;
  select coalesce(sum(scans), 0) into v_month_used
    from scan_usage where user_id = v_user and to_char(day, 'YYYY-MM') = v_month;
  select exists (select 1 from scan_topups where user_id = v_user and month = v_month) into v_topped;

  return jsonb_build_object(
    'plan', v_lim.plan,
    'welcome', v_lim.welcome,
    'usedToday', coalesce(v_today, 0),
    'usedThisMonth', coalesce(v_month_used, 0),
    'dayLimit', v_lim.day_limit,
    'monthLimit', case when v_lim.month_limit is null then null else v_lim.month_limit + (case when v_topped then 600 else 0 end) end,
    'topUpUsed', v_topped,
    'topUpAvailable', v_lim.month_limit is not null and not v_topped,
    'day', v_day,
    'month', v_month
  );
end $$;

-- ---------------------------------------------------------------------------
-- 7. Spending it
-- ---------------------------------------------------------------------------
-- Called by the scan routes AFTER a successful read, for the number of
-- documents that actually came back. A read that fails costs nothing: nobody
-- should pay for our own mistake, and charging for it would punish exactly the
-- awkward documents we most want people to try.
create or replace function take_scans(p_count integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/London')::date;
  v_month text := to_char((now() at time zone 'Europe/London')::date, 'YYYY-MM');
  v_lim record;
  v_today integer;
  v_month_used integer;
  v_month_cap integer;
  v_topped boolean;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- One tap can legitimately hold a handful of documents; a number far beyond
  -- that is a caller with a bug or a bad idea.
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'take_scans: count must be between 1 and 50' using errcode = '22023';
  end if;

  select * into v_lim from scan_limits();
  if v_lim.plan = 'paid' then
    -- Still recorded, so he can see what it costs; simply never refused.
    insert into scan_usage (user_id, day, scans) values (v_user, v_day, p_count)
      on conflict (user_id, day) do update set scans = scan_usage.scans + excluded.scans;
    return jsonb_build_object('allowed', true, 'reason', null);
  end if;

  -- Take the day's row and hold it: two phones scanning at once must not both
  -- slip past the last allowed document.
  insert into scan_usage (user_id, day, scans) values (v_user, v_day, 0) on conflict do nothing;
  select scans into v_today from scan_usage where user_id = v_user and day = v_day for update;

  select coalesce(sum(scans), 0) into v_month_used
    from scan_usage where user_id = v_user and to_char(day, 'YYYY-MM') = v_month;
  select exists (select 1 from scan_topups where user_id = v_user and month = v_month) into v_topped;

  if v_lim.day_limit is not null and v_today + p_count > v_lim.day_limit then
    return jsonb_build_object('allowed', false, 'reason', 'day', 'usedToday', v_today, 'dayLimit', v_lim.day_limit);
  end if;

  if v_lim.month_limit is not null then
    v_month_cap := v_lim.month_limit + (case when v_topped then 600 else 0 end);
    if v_month_used + p_count > v_month_cap then
      return jsonb_build_object('allowed', false, 'reason', 'month', 'usedThisMonth', v_month_used,
                                'monthLimit', v_month_cap, 'topUpAvailable', not v_topped);
    end if;
  end if;

  update scan_usage set scans = scans + p_count where user_id = v_user and day = v_day;
  return jsonb_build_object('allowed', true, 'reason', null, 'usedToday', v_today + p_count);
end $$;

-- ---------------------------------------------------------------------------
-- 8. The extra 600, once
-- ---------------------------------------------------------------------------
create or replace function claim_scan_topup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_month text := to_char((now() at time zone 'Europe/London')::date, 'YYYY-MM');
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into scan_topups (user_id, month) values (v_user, v_month) on conflict do nothing;
  -- A second press in the same month is refused politely rather than silently:
  -- the app says so, so nobody taps it again wondering.
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'already');
  end if;
  return jsonb_build_object('granted', true);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Who may call them
-- ---------------------------------------------------------------------------
revoke all on function scan_limits() from public, anon;
revoke all on function scan_allowance() from public, anon;
revoke all on function take_scans(integer) from public, anon;
revoke all on function claim_scan_topup() from public, anon;

grant execute on function scan_allowance() to authenticated;
grant execute on function claim_scan_topup() to authenticated;
-- take_scans is spent by the scan routes on the caller's behalf, and they hold
-- the user's own token, so `authenticated` is right. scan_limits is internal.
grant execute on function take_scans(integer) to authenticated;
grant execute on function scan_limits() to authenticated;

-- ---------------------------------------------------------------------------
-- RUN AND VERIFIED 2026-09-23. What was actually checked, as the signed-in
-- role and inside transactions that ended in `raise exception`:
--   allowance before      50 a day, 600 a month, top-up available
--   take_scans(3)         allowed, usedToday 3, usedThisMonth 3
--   claim_scan_topup()    granted once, then {"granted": false, "already"}
--   another account       reads 0 of this account's scan_usage rows
--   the owner             reads its own
--   a direct insert       REFUSED for authenticated -- a row people could write
--                         themselves would make the limit decorative
--   anon                  0 table grants, execute on none of the functions
--   after rollback        scan_usage and scan_topups both empty
--
-- VERIFY (re-run any of these; read the answers rather than assuming)
-- ---------------------------------------------------------------------------
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns where table_name = 'business_profile' and column_name = 'plan';
--
-- select relname, relrowsecurity from pg_class where relname in ('scan_usage', 'scan_topups');
-- select tablename, policyname, cmd from pg_policies where tablename in ('scan_usage', 'scan_topups');
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('scan_usage', 'scan_topups') order by grantee;
--
-- Exercise as the signed-in role, inside a transaction that is rolled back:
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<a real user id>","role":"authenticated"}';
--   select scan_allowance();
--   select take_scans(3);
--   select scan_allowance();          -- usedToday should have risen by 3
--   select claim_scan_topup();        -- granted true
--   select claim_scan_topup();        -- granted false, reason already
--   raise exception 'rolled back on purpose';
-- commit;
