# UK address lookup: which provider

Written 2026-09-22, 04:30, after Atanas's note that the address finder "doesn't work at
all" (his postcode SE18 1HU lists nothing but itself; a typed street lists schools in
Devon). Five providers checked against their own pages by five agents, one synthesis.
Prices are as read that night; check before buying.

Today the app's free sources show nothing for SE18 1HU but the postcode itself. Only Royal Mail's PAF lists every address at a postcode; every provider below resells it.

| Provider | Data | Free tier | Price | What you must do |
|---|---|---|---|---|
| **Ideal Postcodes** (code already in the app) | Royal Mail PAF, refreshed daily | 1-month trial, 50 credits, no card (one docs page says 100 — unverified) | Packs, 12-month life: £9/200, £42/1,100, £155/4,300 — 3.6–4.5p per postcode searched | Sign up (business email, company name, address), copy the `ak_` key, set a daily cap on it, paste it into Vercel, buy a pack after the trial |
| **Data8 PredictiveAddress** | Royal Mail PAF, daily | 14-day trial, 100 credits, no card | 6p per picked address (price table not labelled PredictiveAddress — unverified), £25+VAT minimum, 12-month life; searching free | Register, make a key, new code in the app |
| **Postcoder** (Allies) | Royal Mail PAF incl. Multiple Residence | 30-day trial, 150 lookups, no card; trial may not serve real visitors | £27/250 lookups (10.8p), £35/500 (7p), ex VAT, 12-month life (prices from a rendered page — check once in a browser) | Register, verify email, new code |
| **OS Places** (Ordnance Survey) | AddressBase Premium, PAF-matched, daily | 60-day trial, evaluation only | 2.82p per postcode (VAT unverified); Royal Mail part invoiced quarterly upfront | Premium Plan is "not for internal business use" — a judgement call; card, quarterly review with OS support, OS logo and copyright line on the page, 24-hour cache limit, new code |
| **getAddress.io** | Unlicensed PAF copy (High Court, Oct 2025) | — | — | Nothing: it stopped on 4 Feb 2026 (its own site shows no notice; competitors and reviewers say so, and that it kept billing) |
| Loqate / Fetchify | PAF | 45- / 30-day trials | 7.8–8.6p / 6.3–7.5p per lookup, ex VAT | New code |

## Recommendation

Use Ideal Postcodes. The code, the key slot and the caps are already written and tested; it is the cheapest working service per lookup; no subscription; and its dashboard caps the key per day, so a busy free page cannot run up a bill. **At 300 lookups a month: about £11–13** (a £42 pack lasts about three and a half months; the £155 pack covers a year). One credit goes per postcode searched, picked or not; an unknown postcode costs nothing. Sign up, then paste the key into Vercel as `IDEAL_POSTCODES_API_KEY` yourself — I never handle the key.

## A stranger on the free page when the paid lookup is capped or off

The same as today, quietly: the postcode fills the town and postcode, any street or house OpenStreetMap knows is offered, and they type the first line themselves. No error and no mention of a paid service; the app already falls back this way. Worth adding: a one-line hint, "Type your house number and street", once the list is empty, so nobody thinks it is broken. The key stays on the server; the page never sees it.
