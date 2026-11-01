# Moving from invoice-omega-rust.vercel.app to invoiceover.com

Launch item 15 (`notes/launch-review-2026-10-28.md`). Written 2026-11-01 on `wip/domain-ready`.
Nothing here has been done yet. Do the steps **in this order**, and do the test under each
step before going on to the next.

## What the code already does

- The app's own address is in one place: `web/src/lib/siteUrl.ts`, which reads
  `NEXT_PUBLIC_SITE_URL` and falls back to `https://invoice-omega-rust.vercel.app`.
  `harness/test-one-address.mjs` fails if any other file in `web/src` or `worker/src` writes
  the address. It feeds the canonical address and `metadataBase` (layout), `/sitemap.xml`,
  `/robots.txt`, the `subject` sent with every push notification, and the User-Agent the
  address lookup sends to postcodes.io and photon.
- Everything else uses whichever address the page was opened on (`window.location.origin`,
  or the request's own origin on the server). That covers the sign-in, sign-up and reset
  links, Google's way back, and the `/i/`, `/q/` and `/r/` links in emails and on the copy
  button. Links made on the new address carry the new address; links already sent keep the
  old one.
- The sending addresses (`invoices@`, `reminders@`, `documents@`, `feedback@`) and the email-in
  addresses (`u-<token>@`) are **already** on invoiceover.com. Resend and Email Routing
  don't change.
- Two places are not covered by the variable:
  - `web/public/.well-known/security.txt` is a static file (step 9).
  - `worker/wrangler.toml` holds the Worker's `APP_INGEST_URL` (step 8).

## Decide first: the old address stays

Customers already hold invoice and quote links on `invoice-omega-rust.vercel.app`. Several
things also belong to the address they were set up on:
- the iPhone home-screen app;
- push notifications;
- being signed in;
- what is kept on the device (theme, drafts, `scan-engine`).

So **do not remove the old domain from Vercel**, and do not redirect it yet. A redirect
would sign everybody out, switch their notifications off and leave the home-screen icon
pointing at the old address. Keep both addresses serving the same app. Deciding whether and
when to redirect is a separate job for after launch.

Also decide **apex or www**. The recommendation is the apex `invoiceover.com` as the real
address, with `www.invoiceover.com` added in Vercel as a redirect to it.

## The steps

### 1. Turnstile hostname (first, or sign-in breaks)

Cloudflare dashboard -> Turnstile -> widget **"Invoiceover sign-up"** -> Hostname management:
add `invoiceover.com` (and `www.invoiceover.com` if www will serve). **Keep**
`invoice-omega-rust.vercel.app`. CAPTCHA protection is ON in Supabase, so on an unlisted
hostname every sign-in, sign-up and password reset fails.

*Test:* sign in on the old address in a real browser, not the built-in preview pane, which
cannot solve Turnstile (CLAUDE.md). It must still work.

### 2. Supabase redirect URLs

Supabase -> Authentication -> URL Configuration -> Redirect URLs. **Add** these and keep
every old one:
- `https://invoiceover.com/login`
- `https://invoiceover.com/login?*`
- `https://invoiceover.com/reset-password`

Leave **Site URL** as it is for now (step 7).

*Test:* on the old address, "Email me a sign-in link" in Settings (under Account once the Settings split is merged) still arrives
and lands on `/reset-password` there.

### 3. Google sign-in (only if it has been switched on)

`NEXT_PUBLIC_GOOGLE_SIGNIN` is off today (`notes/google-sign-in.md`). If it is on by then:
in Google Cloud -> Credentials -> the OAuth client, add `https://invoiceover.com` to
**Authorised JavaScript origins**. The redirect URI is Supabase's own
(`https://wecfwjxzyzzrcwbwnwpo.supabase.co/auth/v1/callback`) and does not change.

*Test:* after step 5, Continue with Google on the new address comes back signed in.

### 4. Add the domain in Vercel

Vercel -> project `invoice` -> Settings -> Domains:
- add `invoiceover.com`;
- add `www.invoiceover.com`, set to redirect to it.

Vercel then shows the DNS records it wants, normally an A record for the apex and a CNAME
for www. **Leave the vercel.app domain in place.**

*Test:* none yet; Vercel shows "Invalid configuration" until step 5.

### 5. DNS in Cloudflare

Cloudflare -> invoiceover.com -> DNS: add exactly the records Vercel showed, **DNS only
(grey cloud)**, which is what Vercel asks for.

**Do not touch the mail records:**
- the MX, SPF and DKIM records Email Routing added on 2026-09-21;
- the records Resend added (its `resend._domainkey` TXT and the `send` subdomain's MX and
  TXT).

An A record at the apex sits alongside the apex MX without trouble. If a CAA record exists,
it must allow Let's Encrypt.

*Tests:*
- `https://invoiceover.com` loads with a valid certificate.
- `curl -sI https://invoiceover.com/api/vat-check | grep x-vercel-id` ends in `fra1` (the
  function region; the first code is only the edge).
- An email to the **test** account's `u-...@invoiceover.com` address still turns up in
  Needs review.
- An invoice emailed from the test account is still delivered (Resend dashboard).

### 6. Walk the new address on the test account

Use atanaschoo@gmail.com in a real browser, then on the iPhone:
- sign in (Turnstile);
- sign out, then "Forgotten your password?": the link must land on
  `https://invoiceover.com/reset-password`;
- make an account with a throwaway address: the six-digit code and the link both work;
- copy an invoice link: it starts `https://invoiceover.com/i/`;
- open an old `invoice-omega-rust.vercel.app/i/...` link: it still works;
- turn notifications on again (they belong to each address).

### 7. Make the new address the official one

1. Vercel -> Settings -> Environment Variables (Production): `NEXT_PUBLIC_SITE_URL` =
   `https://invoiceover.com`, then **redeploy**. A `NEXT_PUBLIC_` variable is baked in at
   build time, so a new deploy is required.
2. Supabase -> URL Configuration -> **Site URL** = `https://invoiceover.com`. This is where a
   Supabase email link goes when the app's own `redirectTo` is not on the allowed list.

*Tests:*
- `curl -s https://invoiceover.com/ | grep -o 'rel="canonical"[^>]*'` names invoiceover.com.
- `/sitemap.xml` lists invoiceover.com addresses.
- A push notification still arrives (test account, "Invoice opened").

### 8. The email-in Worker

**This only goes live from the Mac.** A push to `main` does NOT deploy `worker/`. Nothing
changes until somebody runs `npx wrangler deploy` from `worker/`, which is exactly how
commit `1564983` sat undeployed for eleven days.

1. In `worker/wrangler.toml`, set `APP_INGEST_URL` to
   `https://invoiceover.com/api/inbox/ingest`.
2. Commit it to `main`.
3. On the Mac, from `worker/`, run `npx wrangler deploy`.
4. Record the new version id in CLAUDE.md, as the previous ones are.

The old URL keeps working while the old domain serves, so this step is not urgent; it is
safest done after step 7 has run for a day.

*Test:* `npx wrangler tail` in one window. Email a PDF to the test account's `u-` address
and check that it lands in Needs review and the tail shows a 200 from the new URL. A
mistyped `u-` address must still bounce.

### 9. security.txt

In `web/public/.well-known/security.txt`, change the `Contact:` and `Canonical:` lines to
`https://invoiceover.com/...`, then commit to main.

*Test:* `curl https://invoiceover.com/.well-known/security.txt`.

### 10. Resend

Nothing to do: `invoiceover.com` has been the verified sending domain since 2026-09-19
(Ireland). Optionally add a DMARC record (`_dmarc` TXT) now that the domain is the public
face.

### 11. Afterwards

- Update CLAUDE.md:
  - "Live at" -> invoiceover.com;
  - the Turnstile hostname note;
  - the Worker's deploy line.
- Update `notes/google-sign-in.md` and the launch review item 15.
- Tell Atanas to delete the home-screen icon and add it again from the new address when he
  is ready. Signing in again there is expected.
