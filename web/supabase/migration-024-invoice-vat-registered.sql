-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- Run 012-backup-before-migration-024.sql first and check it.
--
-- An invoice's totals were worked out with the account's CURRENT VAT
-- setting, so registering for VAT later put VAT on every old invoice (on
-- screen, reprints, balances, reminders). The setting is now saved on the
-- invoice when it's issued: assign_invoice_number records it in the same
-- update that gives the number. Invoices already issued get today's
-- setting, which is the one they have been showing all along. Drafts keep
-- null and follow the current setting until issued.
--
-- Additive: one nullable column, a backfill of nulls only, and a
-- replacement of assign_invoice_number with the same signature, security
-- and grants. Safe to re-run.

alter table public.invoices add column if not exists vat_registered boolean;

update public.invoices i
   set vat_registered = coalesce((select bp.vat_registered from public.business_profile bp where bp.user_id = i.user_id), false)
 where i.status <> 'draft' and i.vat_registered is null;

create or replace function public.assign_invoice_number(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_vat boolean;
  v_updated int;
begin
  update public.business_profile
     set invoice_next_number = invoice_next_number + 1
   where user_id = auth.uid()
  returning invoice_prefix || (invoice_next_number - 1)::text, coalesce(vat_registered, false) into v_number, v_vat;

  if v_number is null then
    raise exception 'No business profile found for this account.';
  end if;

  update public.invoices
     set number = v_number, status = 'sent', vat_registered = v_vat
   where id = p_invoice_id and user_id = auth.uid() and status = 'draft';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Invoice % was not found, not owned by this account, or is not a draft.', p_invoice_id;
  end if;

  return v_number;
end;
$$;

revoke all on function public.assign_invoice_number(uuid) from public;
grant execute on function public.assign_invoice_number(uuid) to authenticated;
revoke execute on function public.assign_invoice_number(uuid) from anon;

-- ── Checks after running ────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--     where table_schema = 'public' and table_name = 'invoices' and column_name = 'vat_registered';
--   select count(*) from public.invoices where status <> 'draft' and vat_registered is null;  -> 0
--   select grantee, privilege_type from information_schema.routine_privileges
--     where routine_name = 'assign_invoice_number';  -> authenticated (and service_role/postgres), not anon
--   Rolled back as authenticated: a draft issued through assign_invoice_number gets the
--   profile's vat_registered; flipping the profile setting afterwards leaves it unchanged.
