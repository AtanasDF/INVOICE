-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup file for this one -- it only creates a function, it doesn't
-- touch any table's data, so there's nothing to snapshot. Rollback is
-- just `drop function public.assign_invoice_number(uuid);`. Same
-- precedent as migration-008 (push_subscriptions), which also needed no
-- backup.
--
-- Replaces the 3-round-trip "save draft, flip status, advance counter"
-- sequence in confirmSend() (invoices/[id]/page.tsx) with one atomic
-- transaction. That sequence had a real gap: if the connection dropped
-- between the counter advancing and the invoice actually being saved as
-- sent, the counter would be ahead of reality with nothing to detect it
-- -- exactly the kind of silent gap in the sequence this whole feature
-- exists to prevent. Flagged after two genuine connection drops in one
-- session.
--
-- Also drops the manual override this replaces: the send panel no
-- longer accepts a typed-in number, only the one this function assigns.
-- The override was flagged as the one thing still capable of writing a
-- gap on purpose, and there's no concrete case yet that needs it.
--
-- security definer so it can write to both tables in one statement;
-- every write is scoped to auth.uid() explicitly in its WHERE clause,
-- so it can't touch another account's rows regardless. search_path is
-- pinned per standard practice for security definer functions.
create or replace function public.assign_invoice_number(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_updated int;
begin
  update public.business_profile
     set invoice_next_number = invoice_next_number + 1
   where user_id = auth.uid()
  returning invoice_prefix || (invoice_next_number - 1)::text into v_number;

  if v_number is null then
    raise exception 'No business profile found for this account.';
  end if;

  update public.invoices
     set number = v_number, status = 'sent'
   where id = p_invoice_id and user_id = auth.uid() and status = 'draft';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Invoice % was not found, not owned by this account, or is not a draft.', p_invoice_id;
  end if;

  return v_number;
end;
$$;

-- A plain CREATE FUNCTION grants EXECUTE to PUBLIC (every role,
-- including anon) by default -- narrow that down. auth.uid() already
-- returns null for an anon caller, so this fails harmlessly for one
-- either way, but no reason to leave it callable at all.
--
-- revoke ... from public only removes the PUBLIC pseudo-role. Supabase
-- also grants anon, authenticated, and service_role their own explicit
-- EXECUTE privileges at creation time, and those survive the line above
-- untouched -- confirmed via the actual ACL after running this the first
-- time. anon needs its own explicit revoke; service_role is left alone
-- on purpose (the cron routes use it).
revoke all on function public.assign_invoice_number(uuid) from public;
grant execute on function public.assign_invoice_number(uuid) to authenticated;
revoke execute on function public.assign_invoice_number(uuid) from anon;
