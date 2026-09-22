# Tonight's list — 22 September 2026

Made at 03:45 with Atanas, from everything open: `notes/backlog.md`, `notes/tonight.md`,
`notes/claude-notes.md`, the open items in `CLAUDE.md` and `SESSIONS.md`, the first-page
research, his four Settings screenshots (the five voice notes with them are still to be
heard), and tonight's asks: feedback by email, sign-in before scanning, a confirmation
email on sign-up. Sixty-one items, numbered straight through; each says the effort,
whether it needs a migration, and what only Atanas can do. The order inside a section
is the order to do them in. Tick items off here as they land, with the commit.

## 1. Feedback
What exists: a Feedback pill on every signed-in page, a /feedback page (category, message, page, time) saving to a `feedback` table; each person sees only their own notes. Missing: nothing reaches Atanas (his account cannot even read other people's rows — only the service role can), no email, no session check, no handled mark, no `notes/feedback-inbox.md`.

1. Email each feedback to Atanas the moment it is sent, through Resend, with the sender's address and page (an hour; Atanas: which address receives it).
2. Start-of-session check: read new rows with the service role, write them into notes/feedback-inbox.md (an hour).
3. A way to mark feedback handled — a `handled_at` column, or a tick in the inbox file (an hour; migration if in the database; Atanas: which).

## 2. Accounts
4. Decide the scope: sign-in before scanning only; typing an invoice, Check a company and the address lookup stay open (decision; recommended so).
5. Scan route refuses strangers; Free page's scan button becomes "Sign in to scan"; "No account needed" reworded; route-guard and free-draft tests and notes updated; one commit (an evening).
6. Supabase: Site URL and redirect list set to the live site (minutes; Atanas signed in to Supabase, Claude clicks).
7. Supabase auth emails through Resend SMTP from invoiceover.com, rate limit checked (an hour; Atanas: creates and pastes the key).
8. Confirm/reset/change-email wording drafted, copy kept in the repo (an hour; Atanas pastes into the templates).
9. Switch "Confirm email" on, link expiry to 24 hours — last of the dashboard steps (minutes; Atanas).
10. App side: link comes back to the app, a "We've sent you an email" screen with Send it again, plain words for "email not confirmed" and expired links (an evening).
11. Decide: link only, or also a 6-digit code typed in the app — recommended both, folds into 10 (decision).
12. Free-page draft survives the sign-up detour; tested on the phone (an hour).
13. Harness suite for sign-up, resend, code, unconfirmed sign-in (an evening).
14. Live proof with atanaschoo+signup1@gmail.com, never Hidefield (an hour; Atanas: inbox and phone).
15. Put the app on invoiceover.com before confirmation links go out; email DNS untouched (an hour; Atanas: root or app. host).

## 3. The first page
16. Decide how sign-in-before-scan fits a page that bans "account" and "sign up" — recommended: ask at the photo choice, not on the first page (decision).
17. Build the recommended page: headline, one line, two full-width buttons, foot line; static paint, no dashboard code, own title, suite (an evening).
18. "How would you like to start?" screen with two big buttons; retrain the eleven suites that press today's labels (an hour).
19. Editor opens with four fields, the rest under "Add more details", Print visible on a phone (an evening).
20. "What is the company called?" screen; accept hyphens and any case; new no-match wording (an hour).
21. Accessibility checklist on all three screens: 18px text, 64px buttons, focus rings, 320px, Lighthouse (an evening; Atanas: VoiceOver read-through).
22. Banned words off the Free page and the company-check page (two hours).
23. Reading-age and banned-word check in the harness (an hour).
24. Companies House key so Check a company works live (minutes; Atanas registers, adds to Vercel by pipe).
25. Decide: show Check a company before the key exists, or "coming soon" (decision).
26. Pick one site name (tab, header, manifest, sign-in, domain differ) (decision).
27. Pick the verb: Make or Write an invoice (decision).
28. The picture: photo or drawing, then make it; page ships without it if not ready (decision + an evening).
29. Try the page on three people, two questions (Atanas).

## 4. Settings page

**His voice notes, typed out at 04:00:**
- Expense categories should follow the kind of account (personal, sole trader, limited company) and change with it. Proposal below.
- Invoice numbering: one line. No essay.
- VAT: one switch, with or without VAT, then the VAT number. No explanation.
- Address finder "doesn't work at all". Reproduced on the live site: SE18 1HU lists nothing but the postcode; tapping it fills only the town and postcode. "149 Benares Road" lists the street, then schools in Devon and Hampshire. Cause: OpenStreetMap, the free source, holds no houses for most UK postcodes; Royal Mail's file (paid) holds every address. Decision below.
- Company name: type three letters and a list appears, narrowing as you type; picking one fills the company number; a full company number fills the name. The first two are built and work behind the Companies House key, which is not set on the live site, so today the boxes are plain. Number-to-name to check and add.
- Check a company: names, numbers and the facts appear in the app, with a link to the government page; today, without the key, the page can only send people to the government's own search.

**Categories by account kind, proposal.** The kind picked at the top of Settings chooses the starting list. A list someone has already changed is kept as it is; changing the kind offers "Switch to the sole-trader list", which adds what is missing and never removes anything (receipts keep whatever category they have). Mileage stays its own thing.
- Personal: Groceries, Household, Rent or mortgage, Bills, Gas & Electric, Transport & Taxis, Fuel, Travel, Meals & eating out, Clothes, Health, Childcare, Subscriptions, Gifts, Other.
- Sole trader, matching the boxes on the self-assessment form: Materials & stock, Subcontractors, Staff wages, Fuel & mileage, Travel & hotels, Meals when away, Rent, rates & utilities, Repairs, Phone & internet, Office & stationery, Software & subscriptions, Advertising, Bank charges & interest, Accountant & legal, Insurance, Tools & equipment, Training, Other.
- Limited company: the sole-trader list plus Salaries & PAYE, Pension contributions, Director's expenses, Client entertaining (not allowable, kept apart so the accountant sees it).

30. Copy fixes: stale logo sentence, "no delete button", Notifications lists all four pushes, address not "(optional)" for VAT/limited (minutes). VAT card becomes one switch and the number box; numbering becomes one line (an hour).
31. Neutral colours: radios and checkboxes, eleven red Remove links, red Regenerate button (minutes).
32. Cards in a new user's order, account and Sign out last; dashboard reminder switch moved to Notifications (minutes).
33. Feedback pill stops covering text and Save (an hour).
34. Sticky Save when something changed, unsaved-changes guard, instant cards say so (two hours).
35. Reorder arrows big enough to tap (an hour).
36. Payment reminders intro cut to two sentences, rest behind "How it works"; same for VAT and numbering (an hour).
37. Export includes recurring invoices, quote requests, reminder history, links (an hour).
38. Mileage added to customised category lists when defaults grow (an hour).
39. Small: shortened import address with Reveal/Copy on their own row; yellow autofill boxes; VAT number shape note (an hour).
40. Logo upload now storage exists (decision; an evening).
41. Personal use adapts the cards (decision; an evening).
42a. Categories follow the account kind, as proposed above (an evening; Atanas: agree the three lists).
42b. Address finder: pick the address data (decision below), then the paid lookup goes live behind the key with the free one as fallback; the free fallback stops listing places hundreds of miles away and says plainly when it has no houses for a postcode (an evening; Atanas: account and key).
42c. Companies House key, so the name list, the number fill and Check a company work live; then number-to-name; then Check a company keeps the facts in the app with a link out to the register (minutes for the key, an evening for the rest; Atanas: registers at the Companies House Developer Hub, Claude guides on screen).
42. Fill in business details on Hidefield: company number, bank, VAT switch, and the invoice prefix and next number (the notes say 357358) (minutes; Atanas only).

## 5. Scanner
43. Investigate test-far's nine failures: seven "still" checks never calling the ImageCapture stand-in, the dark phone-like object, the white box on a coloured bill; checks or scanner wrong (an evening).
44. "Getting ready" sign while OpenCV downloads on a cold start (an hour; Atanas: his go-ahead, he said hold).
45. VAT worked out from a printed rate when no figure prints, shown as worked out, harness case (an hour).
46. Correct the GO OUTDOORS date 2012 → 2026 on Hidefield (minutes; Atanas).
47. Decide Gemini reads everything; recommended keep Gemini default, Claude behind the switch (decision).
48. iPhone tries: batch, signature, scan-to-fill, Share, far receipts, Paid moment, badge, the three hold/zoom changes (an hour; Atanas: phone, test account).
49. Offline scan queue (days; Atanas: needs the phone at hand).

## 6. Everything else
50. Get an email-import address on his account (minutes; Atanas).
51. Dashboard JavaScript under 1.5 MB; agree budgets for the stranger pages (an evening).
52. Suites that fail only four-at-a-time made reliable; harness npm install noted (an hour).
53. Tests for the /i/, /q/ and /r/ pages via the mock-server pattern (an evening).
54. Tidy stale notes: limiter, Anthropic key, Worker, placeholder, 1.1 s, Gemini default (minutes).
55. Safari camera permission set once (minutes; Atanas).
56. Paywall design conversation (decision; days; migration).
57. Open Banking provider and design — not now (decision).
58. Royal Mail addresses key (decision; Atanas: key and limits).
59. Three unused exports: remove or keep (decision; minutes).
60. "Keep working" routine: recreate with permissions or drop (decision).
61. Deletions only he may make: old Resend key, Vercel "web" project, iCloud "name 2" copies and leaving iCloud sync, 24 backup tables, Mapbox token (decision; minutes).

## Decisions for Atanas
Scope of sign-in (4); link or code (11); host name (15); sign-in on the first page (16); Check a company before the key (25); site name (26); button verb (27); picture (28); logo (40); personal-use cards (41); scanner "getting ready" go-ahead (44); Gemini for all (47); paywall (56); banking (57); Royal Mail (58); unused code (59); routine (60); deletions (61); feedback address and handled mark (1, 3).
