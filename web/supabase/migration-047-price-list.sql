-- "What I charge": the owner's own changes to the price list the app learns
-- from their invoices and quotes (src/lib/priceList.ts, page /prices).
--
-- Only the CHANGES are stored -- a renamed item, his own price, fixed or per
-- hour, a VAT rate, hidden, or an item added by hand -- never the learned
-- list, which is worked out afresh from the invoices every time. An array of
-- small objects keyed by the item, so it lives on business_profile beside
-- everything else that is the account's own way of working, and follows the
-- account to every device (localStorage would not).
--
-- The app reads it through readEdits(), which believes only well-formed
-- entries, so a check here would only duplicate that.
--
-- The owner already has select/insert/update on every business_profile
-- column through the existing "own row" policy (business_profile_owner_all),
-- and nothing reads it with the service role, so there is no grant or policy
-- to add. migration-044's plan guard fires only on a change of plan, which
-- this never sends.
--
-- Until this has been run the app works read-only: /prices shows the learned
-- prices and says changes cannot be kept yet (src/lib/priceListStore.ts
-- treats 42703 / PGRST204 as "column not there").
--
-- Backup: 019-backup-before-migration-047.sql, run and verified first.
-- One nullable column, no default, no row rewritten. Additive and idempotent.

alter table public.business_profile add column if not exists price_list jsonb;

comment on column public.business_profile.price_list is
  'The owner''s changes to the price list learned from their invoices and quotes (What I charge). Array of {key, name?, price?, kind?, vatRate?, hidden?}; null = no changes.';

-- Check afterwards:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'business_profile' and column_name = 'price_list';
--   -- price_list | jsonb | YES | (null)
--   select count(*) from business_profile where price_list is not null;   -- 0: no row touched
--
-- Exercise as the owner, rolled back (replace the uuid with the Hidefield owner's):
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims', '{"sub":"<owner uuid>","role":"authenticated"}', true);
--     update business_profile set price_list = '[{"key":"day rate","kind":"hourly","price":30}]' where user_id = auth.uid();
--     select price_list from business_profile where user_id = auth.uid();   -- the row above
--     select count(*) from business_profile where user_id <> auth.uid();     -- 0: nobody else's row
--     do $$ begin raise exception 'rolled back on purpose'; end $$;
--   rollback;
