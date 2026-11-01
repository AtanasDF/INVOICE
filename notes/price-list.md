# What I charge (price list) — 2026-11-01, cloud, branch `wip/price-list`

**Needs migration-047 before it merges (rule 4). Not run, not claimed to have run.**
Run `web/supabase/019-backup-before-migration-047.sql`, verify it both ways, then
`migration-047-price-list.sql`, then the checks and the rolled-back exercise in its footer.

## What Atanas asked for

"If I'm a handyman and I do 12 specific jobs, I should have them ready there. From my
invoices that I loaded and the jobs I give to customers... it should create my jobs and
roughly how much I charge. It can be fixed per hour all the time, or it can be different,
so you can leave the gap to change that and to be able to do both."

## What was built

- **`/prices`, "What I charge"**, a fourth tab under Invoices (Invoices · Quotes ·
  Repeating · What I charge). The menu stays at week 2's size: no new top-level link.
- The list builds itself from every sent invoice and quote (`learnPrices`,
  `src/lib/priceList.ts`), using exactly the rules `savedPrices` already had: drafts,
  blanks, deductions and £0 lines don't count, the same job written two ways is one item,
  the wording used most is the name, the price is the last one charged. On top of that it
  keeps the **range** (lowest and highest), and the card says how the price was worked
  out: "Charged once, at £900.00", "Charged 2 times, £90.00 every time" or "Charged 3
  times: £180.00 to £240.00, last £220.00".
- Each item is **Fixed** or **Per hour**. A line whose wording says it is hourly
  ("per hour", "hourly", "hrs", "/hr", "3 hours") starts as per hour; everything else
  starts fixed, and he switches it.
- **Change** (name, fixed/per hour, price, VAT rate when VAT registered), **Hide** /
  **Show it again**, **+ Add a price** for work never invoiced, and **Back to the learned
  price**. His price shows as "yours is £250.00" beside the learned line, so where it came
  from is always visible.
- **New invoice and New quote**: one picker (`components/PricePicker.tsx`). A fixed item
  goes straight on as one of it; a per-hour item opens "Hours of …" with an Add button that
  shows the total, and the line gets the hours as quantity and the rate as unit price.
  On New invoice the customer's own last prices still come first, as before; his own price
  wins over the customer's last one only where he set one; hidden items are not offered;
  items he added by hand are always offered after. New quote had no suggestions before; it
  now has the same picker ("Change prices" links to /prices from both).
- **Jobs** stays as it is and the two point at each other: the price list's tip says "Not
  the same as Jobs, which gathers one piece of work's invoices and receipts", and the Jobs
  tip says "Your prices are on What I charge, under Invoices". The help chat's grounding
  (`helpFacts.ts`, `navGroups.ts` GROUPS) describes /prices.

## What was decided

- **Storage: a new `business_profile.price_list jsonb`** (migration-047, backup 019). The
  only jsonb on business_profile is `custom_categories`, which is the category list and
  typed as one; sharing it would break categories. business_profile already has the
  owner's own-row policy, so no grant or policy is needed.
- **Only his changes are stored**, never the learned list: `[{key, name?, price?, kind?,
  vatRate?, hidden?}]`, keyed by the description folded the way savedPrices folds it; an
  item he added has key `own:<uuid>`. A change keeps only what differs from the learned
  figure (`editFor`), so a learned price that later goes up still shows wherever he didn't
  set his own. `readEdits` believes only well-formed entries from the column.
- **Its own store** (`src/lib/priceListStore.ts`), not `businessProfileStore.save`:
  Settings saves the profile whole, and is being split in a parallel session tonight;
  neither should be able to overwrite the other. The save is an upsert of `{user_id,
  price_list}` only.
- **Works read-only before 047**: a select of a missing column comes back 42703 and a write
  PGRST204; both mean "not there yet". The page then shows the learned prices with an
  amber line ("Your changes can't be kept yet…") and no Change / Hide / Add buttons, and
  the forms offer the learned prices. A form never fails to open because the price list
  did (`usePriceList` turns every failure into an empty list).
- No delete: an item he added himself can be hidden, not removed. Hiding is reversible and
  it matches "never delete anything" in spirit.

## What is left

- Run migration-047 (Atanas / the Mac), then the browser suites listed in SESSIONS.md.
- Not on iPhone yet: the hours box and the per-hour toggle at 390pt in Safari.
- Not done: a price per customer (his list is one price per item; the customer's own last
  price is still offered first on New invoice, as before), units other than hours (per
  m², per day), and sorting/grouping the list. "Per day" can be written into the name
  as a fixed price for now.
- The recurring-invoice and Free-page forms don't use the picker.
- `test-help-chat` needs no change for the new route, but its live half was not run here.
