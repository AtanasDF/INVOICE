# Invite a friend — how it works, before any of it is built

His ask (2026-09-23): "maybe we can give them some bonus for inviting friends". Agreed the
same day: **both sides rewarded**, and **nothing paid until the invited person has confirmed
their email *and* scanned something**. The whole depot plan rests on drivers telling each
other, so this rewards exactly the behaviour the flyers are trying to start.

## The shape

- Every account has one **invite code**, made the first time it is asked for. Short, and
  safe to read aloud in a depot.
- A friend arrives at `/?invite=CODE`. The code is kept on the device the same way a flyer
  tag is, because people arrive and sign up minutes or days later.
- At sign-up the code rides along on the account, and a **claim** is recorded: who invited
  whom, once, for ever.
- The reward lands **later**, not at sign-up: the first time the invited person has a scan
  counted, both of them get a bonus for that month.

## Why the reward waits

Paying at sign-up would be a machine for making fake accounts, and would undo the three
protections that went live today. Waiting for a confirmed email *and* a real scan means an
attacker needs a fresh person, a real inbox, a new address and an actual document per
reward — at which point they may as well be a customer.

The confirmed email comes free: "Confirm email" is on, so an unconfirmed account cannot sign
in at all, and a scan cannot be counted for someone who never signed in.

## What is stored

Three small tables, no personal data.

- `invite_codes (user_id, code)` — one each, unique.
- `invite_claims (invited_user_id primary key, inviter_user_id, code, claimed_at,
  rewarded_at)` — one claim per person for ever, so nobody can be invited twice.
- `scan_bonuses (user_id, month, scans, reason)` — extra documents for a calendar month.
  `scan_allowance()` and `take_scans()` add the month's bonuses to the month's limit, which
  is the same place the one-a-month top-up already lands.

## The numbers

**300 extra documents each, for the month the reward lands in.** Cheap — 300 documents is
well under a pound — and meaningful, since it is six normal days of scanning. Not a month of
the paid plan, because there is no paid plan to give yet.

## The rules, stated so they cannot drift

1. **Nobody invites themselves.** A claim where inviter and invited are the same account is
   refused.
2. **One claim per person, for ever.** Not per month, not per code.
3. **No chains.** A rewards B, B rewards C, and that is where it stops: there is no bonus
   for an invite of an invite.
4. **A claim is never deleted**, only marked rewarded — the record of who brought whom is
   worth keeping, and nothing in this project deletes.
5. **Rewarding is idempotent.** Two scans landing at once cannot pay twice: the claim row is
   locked and `rewarded_at` is set in the same statement.

## Off by default

`NEXT_PUBLIC_INVITES` unset means no screen mentions it and no code is made. The database
side can be applied and sit unused, exactly as the limits did.

## Still to settle with him

- Whether 300 each is the right number once there are real users.
- Whether an invite should ever be worth a month of paid, when there is a paid plan.
