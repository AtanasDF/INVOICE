-- Backup 019's check, migration-047 and 047's checks in ONE run, so Atanas
-- presses Run once. It is all one DO block: if any check fails it raises and
-- Postgres undoes the lot, so the database is either fully done and verified
-- or exactly as it was. The owner test runs in an inner block that raises on
-- purpose, so its write is undone while the column stays.
-- Needs 019's create/RLS/revoke to have been run first (done 2026-11-03).

do $$
declare
  owner uuid;
  cols text; b1 int; b2 int; live int; bak int; rls bool; grants int;
  col_type text; col_null text; col_def text; touched int;
  saw jsonb; others int; after_cnt int;
begin
  -- the backup's own columns, so a second press (price_list already there) still compares like with like
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'business_profile_backup_20261101';
  execute format('select count(*) from (select %1$s from business_profile except select %1$s from business_profile_backup_20261101) t', cols) into b1;
  execute format('select count(*) from (select %1$s from business_profile_backup_20261101 except select %1$s from business_profile) t', cols) into b2;
  select count(*) into live from business_profile;
  select count(*) into bak from business_profile_backup_20261101;
  select relrowsecurity into rls from pg_class where relname = 'business_profile_backup_20261101' and relnamespace = 'public'::regnamespace;
  select count(*) into grants from information_schema.role_table_grants
   where table_name = 'business_profile_backup_20261101' and grantee in ('anon', 'authenticated');
  if b1 <> 0 or b2 <> 0 or live <> bak or not coalesce(rls, false) or grants <> 0 then
    raise exception 'STOP, nothing changed: backup check failed (missing %, extra %, live %, backup %, rls %, grants %)', b1, b2, live, bak, rls, grants;
  end if;

  alter table public.business_profile add column if not exists price_list jsonb;
  comment on column public.business_profile.price_list is
    'The owner''s changes to the price list learned from their invoices and quotes (What I charge). Array of {key, name?, price?, kind?, vatRate?, hidden?}; null = no changes.';

  select data_type, is_nullable, column_default into col_type, col_null, col_def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'business_profile' and column_name = 'price_list';
  select count(*) into touched from business_profile where price_list is not null;

  select id into owner from auth.users where email = 'fragov@hidefield.co.uk';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    update business_profile set price_list = '[{"key":"day rate","kind":"hourly","price":30}]' where user_id = auth.uid();
    select price_list into saw from business_profile where user_id = auth.uid();
    select count(*) into others from business_profile where user_id <> auth.uid();
    raise exception 'rolled back on purpose';
  exception when others then
    if sqlerrm <> 'rolled back on purpose' then raise; end if;
  end;

  select count(*) into after_cnt from business_profile where price_list is not null;
  if not (col_type = 'jsonb' and col_null = 'YES' and col_def is null and touched = 0
          and saw->0->>'key' = 'day rate' and others = 0 and after_cnt = 0) then
    raise exception 'STOP, nothing changed: 047 check failed (type %, nullable %, default %, touched %, saw %, others %, after %)',
      col_type, col_null, col_def, touched, saw, others, after_cnt;
  end if;

  create temp table if not exists one_press_answer (answer text, detail text);
  insert into one_press_answer values ('GREEN',
    format('backup: %s rows, same both ways, RLS on, no open grants. 047: price_list jsonb, empty, owner test saved and undone, other rows seen: %s', live, others));
end $$;

select * from one_press_answer;
