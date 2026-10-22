# Continue with Google: switching it on (2026-10-22)

The button is built and OFF (`NEXT_PUBLIC_GOOGLE_SIGNIN`). Switching it on needs three
things Atanas does himself, because they mean creating credentials in his accounts:

1. **Google Cloud** (console.cloud.google.com, signed in as atanaschoo@gmail.com):
   new project "Invoiceover" -> APIs & Services -> OAuth consent screen: External, app name
   Invoiceover, support email, logo optional, scopes email + profile + openid only, links to
   /privacy and /terms. Then Credentials -> Create OAuth client ID -> Web application.
   - Authorised JavaScript origins: `https://invoice-omega-rust.vercel.app`
     (add `https://invoiceover.com` when the domain moves)
   - Authorised redirect URI: `https://wecfwjxzyzzrcwbwnwpo.supabase.co/auth/v1/callback`
   Copy the Client ID and Client secret. Publish the consent screen (In production): with
   only email/profile scopes Google does not need a review.
2. **Supabase** -> Authentication -> Sign In / Providers -> Google: on, paste the two values.
   Authentication -> URL Configuration -> Redirect URLs: add
   `https://invoice-omega-rust.vercel.app/login` (and `/login?*`).
3. Tell Claude. Claude sets `NEXT_PUBLIC_GOOGLE_SIGNIN=on` in Vercel Production and
   redeploys; the Privacy page then names Google by itself.

Behaviour: the button sits above the email form on both tabs (Google makes the account on
first use, so Sign in and New here are the same press). Hidden inside the iPhone home-screen
app, where Google would open in Safari and the session would stay there. The people check
(Turnstile) does not apply to Google sign-in; Google has done that job.

Sign in with Apple is the obvious next one for iPhone users, but needs a paid Apple
Developer account ($99 a year). Not built.
