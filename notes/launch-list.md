# Launch list (written 2026-11-01)

What stands between today and the front door going public. Each line says who does it.
**Atanas** = only he can (his accounts, his money, his phone). **Mac** = a session on
this Mac. **Cloud** = a cloud session, repo only.

## Building now (cloud, started 01/11 night)

| Branch | What | Then |
|---|---|---|
| `wip/price-list` | What I charge: learned from invoices, fixed or per hour, editable, picked on New invoice/quote | `wip/business-categories` |
| `wip/settings-split` | Settings as short pages: Business, Invoices and payments, Account | `wip/domain-ready` |
| `wip/visual-pass` | Week 3 item I: fewer borders, compact lists, one look | `wip/how-it-works` |

Price list may need a migration (rule 4): it cannot merge until Atanas runs it.

## Order of work

1. **Mac, as each branch lands**: fetch, tsc/eslint/build, logic suites, then the browser
   suites each branch names (needs Chrome, below), merge into one `integrate/launch`
   branch, iPhone-sized shots with `harness/shots-launch.mjs`.
2. **Atanas**: look at the shots on his phone and say yes or what to change.
3. **Mac**: merge into `main` on his yes (deploys).
4. **Atanas, on his iPhone**: the batch camera with real invoices (the 28/10 fix is not
   yet confirmed on a phone), one real scan, one draft invoice on the **test** account sent
   to himself.
5. **Then the outside-the-code list below**, then the front door goes public.

## Outside the code

- [ ] **Vercel Pro** (Atanas). Hobby is for non-commercial use.
- [ ] **Supabase plan** (Atanas). Decides daily backups and whether the project can pause.
- [ ] **invoiceover.com as the address** (Atanas + Mac), following `notes/domain-move.md`
      once `wip/domain-ready` lands. The Turnstile hostname comes first, or sign-in breaks.
- [ ] **ICO data protection fee** (Atanas, about £52 a year for a small business), then
      the registration number goes on `/privacy`.
- [ ] **A real business name and address in Settings on Hidefield** (Atanas). The legal
      pages and every email use them.
- [ ] **Decide on purpose** (Atanas): help chat, invite a friend, photo ageing. All built,
      all off. Launching with all three off is fine.
- [ ] **Rounding** (Atanas): should an invoice line round to the penny before the total
      is added up? (`notes/audit-components.md`, section 7). Today's answer is "no", which
      is safe for invoices already issued.
- [ ] HMRC VAT check, production (Atanas, waits on the UTR letter). Not needed for launch.

## This Mac, before it can do step 1

- [ ] **GitHub sign-in for git** (Atanas, once). Without it nothing here can be pushed.
- [ ] **Google Chrome** in /Applications, for the browser suites and the shots.
- [ ] **Pillow** (`pip3 install --user pillow`) for the camera clip generators.
- [ ] `web/.env.local` copied from the other Mac, only for anything that must touch the
      real database. The harness does not need it.

## Still red, known

- `test-pale`: a white invoice on a white worktop is never found. Needs Chrome and the
  clips, so it is a Mac job, not a cloud one.
- See the foot of tonight's SESSIONS.md entry for the no-browser run on this Mac.
