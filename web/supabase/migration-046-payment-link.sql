-- A "Pay now" button on an invoice, without us taking payments.
--
-- Somebody pastes a payment page they already have (SumUp, Stripe Payment
-- Link, PayPal.me, Monzo or Starling) in Settings, and their invoices -- on
-- screen, on the customer's /i/ link, and printed as the address in the PDF --
-- carry it beside the bank details. No money passes through us
-- (notes/launch-simplify.md).
--
-- The app only ever shows an https address (src/lib/paymentLink.ts), so the
-- column holds text and nothing else; a check here would only duplicate that
-- and could refuse a save the app would have cleaned up itself.
--
-- The owner already has update on every business_profile column through the
-- existing "own row" policy, and the /i/ page reads with the service role,
-- so there is no grant or policy to add.
--
-- Backup: 018-backup-before-migration-046.sql, run and verified first.
-- One nullable column, no default, no row rewritten. Additive and idempotent.

alter table public.business_profile add column if not exists payment_link text;

comment on column public.business_profile.payment_link is
  'A payment page the owner already has (SumUp, Stripe, PayPal...), shown as Pay now on their invoices. https only, enforced by the app.';

-- Check afterwards:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'business_profile' and column_name = 'payment_link';
--   -- payment_link | text | YES | (null)
