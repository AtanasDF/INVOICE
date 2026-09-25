-- "They have told me in writing that they are an end user."
--
-- WHY THIS EXISTS. The VAT domestic reverse charge (migration notes and
-- src/lib/reverseCharge.ts) applies to CIS work between VAT-registered
-- businesses UNLESS the customer has told the supplier, in writing, that they
-- are an end user or an intermediary supplier. That single sentence from the
-- customer flips the whole treatment back to ordinary VAT.
--
-- It is a durable fact about that customer, not about one invoice: a builder
-- who has sent the declaration has sent it. Without somewhere to keep it the
-- app asks the same question on every invoice to them for ever, and a question
-- asked too often is a question people stop reading -- which is exactly how
-- somebody ends up charging VAT they should not have, or not charging VAT they
-- should.
--
-- It is the CUSTOMER's statement, never our guess, so it defaults to false and
-- only a person can set it.
--
-- NO BACKUP FILE. This adds one nullable column to an existing table and
-- changes nothing that is there, so CLAUDE.md rule 2 asks for none: nothing can
-- be lost by running it.
--
-- Additive and idempotent: safe to run twice.

alter table public.clients
  add column if not exists reverse_charge_end_user boolean not null default false;

comment on column public.clients.reverse_charge_end_user is
  'The customer has confirmed IN WRITING that they are an end user or intermediary supplier for the VAT domestic reverse charge, so the charge does not apply to them. Their statement, not an inference.';

-- No policy or grant changes: `clients` already has row level security and the
-- owner-only policy from the original schema, and a new column on an existing
-- table inherits both.
