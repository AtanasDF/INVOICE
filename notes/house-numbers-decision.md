# Why a postcode doesn't list house numbers (2026-09-23)

Atanas: *"when you add the postcode the system now recognises the address but just the
name and doesn't let you chose the number. The system, after you add the postcode should
give you the full list of addresses there so you can chose the correct one with the
number."*

**This is not a bug, and no amount of code fixes it.** It is the data.

## What the free lookup actually returns

Measured against the live services today:

| Postcode | What comes back |
|---|---|
| SE18 1HU | **Street names only** — Amar Court, Benares Road, St. Nicholas Road. No numbers at all. |
| M1 1AE | A few: "113 Newton Street", "Oxid House, 78 Newton Street", plus the street itself. |
| BS1 4DJ | One building, one street. |
| SW1A 1AA | Buildings and streets, no numbered houses. |

The free stack is postcodes.io (postcode → town, no houses) and OpenStreetMap via photon
(whatever volunteers have mapped). **OpenStreetMap has never set out to hold every UK
house number**, and for most residential postcodes it holds none. There is no free UK
dataset that does: OS Open Names is streets only, AddressBase is licensed, and the Open
Addresses UK project closed in 2016.

The only complete list of UK house numbers is **Royal Mail's Postcode Address File
(PAF)**, and PAF is licensed — every reseller charges.

## The code for it is already written

`/api/address-search` already has the whole PAF path behind `IDEAL_POSTCODES_API_KEY`:
Royal Mail's list for a postcode, suggestions for a number and street, the full address
fetched only when one is picked, per-account and overall caps, a rest period when the key
is refused, and a fall back to the free lookup whenever it is capped or failing — with the
box saying so. `harness/test-address-stubbed.mjs` exercises all of that against a stand-in
(38 checks, green). **Setting the key is the whole job.**

## What it costs (ideal-postcodes.co.uk, read 2026-09-23)

Pay as you go, no subscription, **credits valid 12 months**:

| Pack | Price | Per lookup |
|---|---|---|
| Free trial | **£0** | 50 credits, 1 month, **no card** |
| 200 | £9 | £0.045 |
| 1,100 | £42 | £0.038 |
| 4,300 | £155 | £0.036 |
| 12,800 | £420 | £0.033 |

Their own wording: *"Searching as a customer types is free. A credit is only spent when a
full address is returned."* So a credit goes when somebody **picks** their address, not
while they type — roughly one credit per address actually entered.

## Recommended

1. Take the **free trial** — 50 credits, no card. Enough to see real numbered addresses in
   the app and judge whether it is worth paying for.
2. If it is, **£9 for 200 credits**, auto top-up **off**, and a daily limit set in their
   dashboard as well as the caps already in our code.
3. Revisit when there are enough users to matter. At 200 new addresses a month this is
   £9/month; the free lookup keeps working underneath for everyone else, so a spent
   balance degrades rather than breaks.

The key goes in Vercel as `IDEAL_POSTCODES_API_KEY`. Nothing else changes.
