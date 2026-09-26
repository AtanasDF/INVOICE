# "It doesn't ask for my fingerprint" — what is actually happening

Atanas, 2026-09-26: *"When log in it doesn't directly ask you to prove it's you via
finger print via the mac and sends you to a different page to prove it's you."* Then, when
asked: *"the fingerprint was from the computer."* So this is **macOS Safari or Chrome on the
MacBook**, not the iPhone.

## The short answer

**The app has no fingerprint sign-in, so nothing is broken — it was never built.** There is
no WebAuthn anywhere in `web/src` (nought hits for `webauthn`, `passkey`,
`credentials.create`, `PublicKeyCredential`). Sign-in is email and password through Supabase.

Touch ID can reach a password form in exactly one way today: **the browser fills a password
it has already saved, and asks for the fingerprint to unlock its own keychain.** That is the
browser's feature, not the app's. If the password was never saved on that Mac there is
nothing to unlock and no prompt — which is the likeliest thing here, since he signs in on
the Mac rarely.

## What was checked, so nobody checks it again

The sign-in form is already marked up the way Safari and every password manager expect, and
that was the first suspicion:

- one `<form>` containing both fields (`SignInCard.tsx`);
- the identifier is `type="email"` with `autoComplete="email"`;
- the password is `type="password"`, `name="password"`, `id="password"`, with
  `autoComplete="current-password"` on sign-in and `"new-password"` on sign-up;
- the six-digit box is `autoComplete="one-time-code"`.

So autofill is not being blocked by the markup. **Do not go changing these attributes on a
hunch** — that was the tempting wrong move.

## The "different page to prove it's you"

Three candidates, and it is worth finding out which before building anything:

1. **The six-digit code screen.** Reading the code, this is only reached on sign-**up**, or
   when signing in to an account whose email was never confirmed. Not on an ordinary
   sign-in.
2. **A Cloudflare Turnstile challenge.** Captcha protection is ON in Supabase
   (Authentication → Attack Protection), in **Managed** mode. Managed mode can put up an
   interactive "confirm you are human" step, and on a machine used rarely it is more likely
   to. This is the best fit for "a different page to prove it's you".
3. **A Supabase re-verification** after a long gap. He signs in on the Mac rarely, which is
   exactly when a session has expired.

**The cheapest way to settle it is to watch him do it once** and read what the page says.
Ninety seconds of his time beats any amount of guessing here.

## If passkeys are wanted

Worth knowing what it costs before agreeing to it. Supabase Auth has no first-class WebAuthn
factor, so this is not a setting:

- a table of credentials per account (public key, credential id, sign count, device label);
- a route to start registration and one to verify it, holding a challenge for a minute;
- the same pair for signing in, ending in a Supabase session minted server-side — which
  means the service role key is issuing sessions, so that route has to be as careful as
  `/api/inbox/ingest` is;
- the recovery story, which is the part that bites: a passkey lives on one device, so losing
  the Mac must not lose the account, and "fall back to the password" throws away most of the
  security it bought;
- and it can only be tested on his hardware — a headless Chrome cannot present a fingerprint.

Not started, on purpose: it is a real piece of work whose whole value is on a device this
session cannot reach, and item 1 above may turn out to be the actual complaint.
