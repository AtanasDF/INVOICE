-- Invite a friend: who brought whom, and the bonus that follows.
--
-- WHY THIS EXISTS. The whole depot plan rests on drivers telling each other
-- (notes/promotion.md), so this rewards exactly that. Both sides get extra
-- documents, and nothing is paid until the invited person has confirmed their
-- email AND had a scan counted. Design: notes/invite-a-friend-design.md.
--
-- NO BACKUP FILE. This creates three tables and replaces two functions; it
-- alters no existing table and drops nothing, so `CLAUDE.md` rule 2 asks for
-- none. `take_scans` and `scan_allowance` are redefined, and both are
-- `create or replace` of functions added by 036 — the versions here are those
-- versions plus the bonus.
--
-- WHY THE REWARD WAITS. Paying at sign-up would be a machine for making fake
-- accounts and would undo the three protections that went live the same day. By
-- waiting for a confirmed email and a real scan, an attacker needs a fresh
-- person, a real inbox, a new address and an actual document per reward. The
-- confirmed email comes free: "Confirm email" is on, so an unconfirmed account
-- cannot sign in, and a scan cannot be counted for someone who never signed in.
--
-- WHY REWARDING LIVES INSIDE take_scans. It is the one place that already knows
-- a real document was read by a real signed-in account. A trigger on
-- `scan_usage` would fire for the paid path too and for any future writer;
-- doing it here keeps "a scan happened" and "therefore reward" in one place.
--
-- Additive and idempotent: safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. One code each
-- ---------------------------------------------------------------------------
create table if not exists invite_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Who brought whom
-- ---------------------------------------------------------------------------
-- One claim per invited person, for ever: the primary key is the invited user,
-- so nobody can be invited twice, by anybody, in any month.
create table if not exists invite_claims (
  invited_user_id uuid primary key references auth.users (id) on delete cascade,
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  claimed_at timestamptz not null default now(),
  rewarded_at timestamptz,
  constraint invite_claims_not_self check (invited_user_id <> inviter_user_id)
);

create index if not exists invite_claims_inviter_idx on invite_claims (inviter_user_id);

-- ---------------------------------------------------------------------------
-- 3. Extra documents for a month
-- ---------------------------------------------------------------------------
-- Deliberately additive rows rather than a number on the profile: a bonus can
-- then be explained ("reason") and counted, and two of them cannot race.
create table if not exists scan_bonuses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  scans integer not null check (scans > 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists scan_bonuses_user_month_idx on scan_bonuses (user_id, month);

-- ---------------------------------------------------------------------------
-- 4. Who may see what
-- ---------------------------------------------------------------------------
alter table invite_codes enable row level security;
alter table invite_claims enable row level security;
alter table scan_bonuses enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'invite_codes' and policyname = 'invite_codes_select_own') then
    create policy invite_codes_select_own on invite_codes for select to authenticated using (user_id = auth.uid());
  end if;
  -- Both sides may see a claim they are part of: the inviter to know it
  -- worked, the invited to know where they came from.
  if not exists (select 1 from pg_policies where tablename = 'invite_claims' and policyname = 'invite_claims_select_mine') then
    create policy invite_claims_select_mine on invite_claims for select to authenticated
      using (inviter_user_id = auth.uid() or invited_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'scan_bonuses' and policyname = 'scan_bonuses_select_own') then
    create policy scan_bonuses_select_own on scan_bonuses for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- Supabase grants anon/authenticated everything on a new table by default.
revoke all on invite_codes from anon, authenticated;
revoke all on invite_claims from anon, authenticated;
revoke all on scan_bonuses from anon, authenticated;
grant select on invite_codes to authenticated;
grant select on invite_claims to authenticated;
grant select on scan_bonuses to authenticated;

-- ---------------------------------------------------------------------------
-- 5. My code
-- ---------------------------------------------------------------------------
-- Made on first asking rather than for every account at once: most accounts
-- will never invite anybody, and a code nobody has seen is a row nobody needs.
-- No 0/O/1/I/l: it gets read aloud across a depot.
create or replace function my_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_try int := 0;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select code into v_code from invite_codes where user_id = v_user;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_try := v_try + 1;
    -- md5 of a uuid rather than gen_random_bytes: pgcrypto lives in the
    -- `extensions` schema and this function pins search_path to public, so
    -- gen_random_bytes would fail at call time rather than at creation --
    -- the worst kind of failure, because the migration would look fine.
    -- gen_random_uuid and md5 are both built in.
    v_code := upper(substr(translate(md5(gen_random_uuid()::text), '01', 'wx'), 1, 7));
    begin
      insert into invite_codes (user_id, code) values (v_user, v_code);
      return v_code;
    exception when unique_violation then
      -- Another account already has that code; try again. Seven characters
      -- from a 30-odd character alphabet makes this vanishingly rare, but a
      -- loop is cheaper than a support conversation.
      if v_try > 10 then raise; end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Claiming one
-- ---------------------------------------------------------------------------
-- Called once, just after an account is made. Records who brought whom; pays
-- nothing. Refusing is not an error -- a code typed wrongly, or a second
-- attempt, simply answers `claimed: false` with a reason the app can say out
-- loud.
create or replace function claim_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_inviter uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_code is null or length(btrim(p_code)) = 0 then
    return jsonb_build_object('claimed', false, 'reason', 'no code');
  end if;

  if exists (select 1 from invite_claims where invited_user_id = v_user) then
    return jsonb_build_object('claimed', false, 'reason', 'already');
  end if;

  select user_id into v_inviter from invite_codes where code = upper(btrim(p_code));
  if v_inviter is null then
    return jsonb_build_object('claimed', false, 'reason', 'unknown');
  end if;
  if v_inviter = v_user then
    return jsonb_build_object('claimed', false, 'reason', 'self');
  end if;

  insert into invite_claims (invited_user_id, inviter_user_id, code)
  values (v_user, v_inviter, upper(btrim(p_code)))
  on conflict (invited_user_id) do nothing;

  return jsonb_build_object('claimed', found);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Paying it, once, when a real scan happens
-- ---------------------------------------------------------------------------
create or replace function reward_invite_if_due()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_month text := to_char((now() at time zone 'Europe/London')::date, 'YYYY-MM');
  v_inviter uuid;
begin
  -- Locked, so two scans landing together cannot both pay. The `rewarded_at is
  -- null` in the update is the second guard: even if two transactions got this
  -- far, only one changes a row.
  select inviter_user_id into v_inviter
    from invite_claims
   where invited_user_id = v_user and rewarded_at is null
   for update skip locked;

  if v_inviter is null then
    return false;
  end if;

  update invite_claims set rewarded_at = now()
   where invited_user_id = v_user and rewarded_at is null;
  if not found then
    return false;
  end if;

  insert into scan_bonuses (user_id, month, scans, reason)
  values (v_user, v_month, 300, 'invited'),
         (v_inviter, v_month, 300, 'invite accepted');
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 8. The two functions from 036, now counting bonuses
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
  v_bonus integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_lim from scan_limits();

  select coalesce(scans, 0) into v_today from scan_usage where user_id = v_user and day = v_day;
  select coalesce(sum(scans), 0) into v_month_used
    from scan_usage where user_id = v_user and to_char(day, 'YYYY-MM') = v_month;
  select exists (select 1 from scan_topups where user_id = v_user and month = v_month) into v_topped;
  select coalesce(sum(scans), 0) into v_bonus
    from scan_bonuses where user_id = v_user and month = v_month;

  return jsonb_build_object(
    'plan', v_lim.plan,
    'welcome', v_lim.welcome,
    'usedToday', coalesce(v_today, 0),
    'usedThisMonth', coalesce(v_month_used, 0),
    'dayLimit', v_lim.day_limit,
    'monthLimit', case when v_lim.month_limit is null then null
                  else v_lim.month_limit + (case when v_topped then 600 else 0 end) + coalesce(v_bonus, 0) end,
    'topUpUsed', v_topped,
    'topUpAvailable', v_lim.month_limit is not null and not v_topped,
    'bonusThisMonth', coalesce(v_bonus, 0),
    'day', v_day,
    'month', v_month
  );
end $$;

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
  v_bonus integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'take_scans: count must be between 1 and 50' using errcode = '22023';
  end if;

  select * into v_lim from scan_limits();
  if v_lim.plan = 'paid' then
    insert into scan_usage (user_id, day, scans) values (v_user, v_day, p_count)
      on conflict (user_id, day) do update set scans = scan_usage.scans + excluded.scans;
    perform reward_invite_if_due();
    return jsonb_build_object('allowed', true, 'reason', null);
  end if;

  insert into scan_usage (user_id, day, scans) values (v_user, v_day, 0) on conflict do nothing;
  select scans into v_today from scan_usage where user_id = v_user and day = v_day for update;

  select coalesce(sum(scans), 0) into v_month_used
    from scan_usage where user_id = v_user and to_char(day, 'YYYY-MM') = v_month;
  select exists (select 1 from scan_topups where user_id = v_user and month = v_month) into v_topped;
  select coalesce(sum(scans), 0) into v_bonus
    from scan_bonuses where user_id = v_user and month = v_month;

  if v_lim.day_limit is not null and v_today + p_count > v_lim.day_limit then
    return jsonb_build_object('allowed', false, 'reason', 'day', 'usedToday', v_today, 'dayLimit', v_lim.day_limit);
  end if;

  if v_lim.month_limit is not null then
    v_month_cap := v_lim.month_limit + (case when v_topped then 600 else 0 end) + coalesce(v_bonus, 0);
    if v_month_used + p_count > v_month_cap then
      return jsonb_build_object('allowed', false, 'reason', 'month', 'usedThisMonth', v_month_used,
                                'monthLimit', v_month_cap, 'topUpAvailable', not v_topped);
    end if;
  end if;

  update scan_usage set scans = scans + p_count where user_id = v_user and day = v_day;
  -- A real document, read for a real signed-in account: if an invite is owed,
  -- this is the moment it is earned.
  perform reward_invite_if_due();
  return jsonb_build_object('allowed', true, 'reason', null, 'usedToday', v_today + p_count);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Who may call them
-- ---------------------------------------------------------------------------
revoke all on function my_invite_code() from public, anon;
revoke all on function claim_invite(text) from public, anon;
-- `authenticated` as well, and that word is the whole point. Supabase grants
-- execute to `authenticated` by default, so revoking only from public and anon
-- left every signed-in account able to call this directly -- which is a way to
-- be PAID WITHOUT SCANNING, the one rule the design rests on. Found by reading
-- the catalogue after the migration rather than trusting the revoke above it.
revoke all on function reward_invite_if_due() from public, anon, authenticated;

grant execute on function my_invite_code() to authenticated;
grant execute on function claim_invite(text) to authenticated;
-- Not granted to anyone: it is called only from inside take_scans, which is
-- security definer and runs as the owner. Nobody should be able to ask to be
-- paid; they can only earn it by scanning.
-- (no grant for reward_invite_if_due)

-- ---------------------------------------------------------------------------
-- VERIFY (run after, and read the answers rather than assuming)
-- ---------------------------------------------------------------------------
-- select relname, relrowsecurity from pg_class
--   where relname in ('invite_codes','invite_claims','scan_bonuses');
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('invite_codes','invite_claims','scan_bonuses');
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('invite_codes','invite_claims','scan_bonuses') and grantee in ('anon','authenticated');
-- select proname, coalesce(array_to_string(proacl, ','), 'none') from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and proname in ('my_invite_code','claim_invite','reward_invite_if_due');
--
-- RUN AND VERIFIED 2026-09-23, as two real accounts, rolled back:
--   code                  7 characters, and the same on a second call
--   invite yourself       refused, "self"
--   a code that is wrong  refused, "unknown"
--   first claim           true; a second   refused, "already"
--   before any scan       0 bonuses -- nothing is paid at sign-up
--   after TWO scans       exactly 2 bonuses, 300 each, one per side
--   month limit           600 -> 900 for the invited account
--   direct call to reward_invite_if_due as authenticated  REFUSED
--   scanning still pays after that revoke
--
-- Exercise as two real accounts, inside a transaction that is rolled back:
-- begin;
--   -- as A: select my_invite_code();
--   -- as B: select claim_invite('<A''s code>');   -> claimed true
--   -- as B: select claim_invite('<A''s code>');   -> claimed false, "already"
--   -- as B: select take_scans(1);                 -> allowed, and both get 300
--   -- select * from scan_bonuses;                 -> two rows, 300 each
--   -- as B: select take_scans(1);                 -> no second reward
--   raise exception 'rolled back on purpose';
-- commit;
