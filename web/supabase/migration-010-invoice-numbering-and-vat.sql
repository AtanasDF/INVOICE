-- Run 006-backup-before-migration-010.sql first.
-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Adds sequential invoice numbering and VAT.
--
-- business_profile gets four new nullable/defaulted columns -- purely
-- additive, safe to run more than once:
--   invoice_prefix       text, default 'INV-'
--   invoice_next_number  integer, default 1 (the next suggested number)
--   vat_registered       boolean, default false (VAT is off until turned on)
--   bank_details         text, the "How to pay" block on printed invoices
--
-- invoices.items is jsonb, not a real column per line item, so adding
-- vatRate to each item (done at the app level) needs no schema change at
-- all -- existing items just don't have that key yet, and the app
-- defaults it to "standard" when reading them back.
alter table public.business_profile add column if not exists invoice_prefix text default 'INV-';
alter table public.business_profile add column if not exists invoice_next_number integer not null default 1;
alter table public.business_profile add column if not exists vat_registered boolean not null default false;
alter table public.business_profile add column if not exists bank_details text;

-- The one part that ISN'T purely additive: invoice numbers stay freely
-- editable in the app (per spec), so a client-side warning alone can't
-- actually guarantee uniqueness -- this is the real backstop. Guarded so
-- it only tries to add the constraint if it doesn't already exist, and
-- raises a clear error naming the actual duplicate numbers if any exist,
-- rather than a cryptic constraint-violation failure -- fix those by hand
-- (rename one of each duplicate pair) and re-run this file.
do $$
declare
  dup record;
  dup_list text := '';
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_user_id_number_key' and conrelid = 'public.invoices'::regclass
  ) then
    for dup in
      select user_id, number, count(*) from public.invoices
      group by user_id, number having count(*) > 1
    loop
      dup_list := dup_list || format('(user_id=%s, number=%s, count=%s) ', dup.user_id, dup.number, dup.count);
    end loop;

    if dup_list <> '' then
      raise exception 'Cannot add unique(user_id, number) -- duplicate invoice numbers exist: %. Rename one of each pair, then re-run this migration.', dup_list;
    end if;

    alter table public.invoices add constraint invoices_user_id_number_key unique (user_id, number);
  end if;
end $$;
