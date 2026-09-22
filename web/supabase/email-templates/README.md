# The emails Supabase sends for sign-in

Plain words, the app's own look (neutral, no logo yet), written 2026-09-22 for the day
"Confirm email" is switched on (notes/tonight-list.md, items 6–9 and 11). Supabase sends
these itself; nothing in the app code uses these files.

**Where they go:** Supabase → the project → Authentication → Emails → Templates. For each
one below, paste the subject into "Subject heading" and the whole of the `.html` file into
"Message body", then Save. Do all four before switching "Confirm email" on.

| Template in Supabase | Subject | File |
|---|---|---|
| Confirm signup | Confirm your email to finish signing up | `confirm-signup.html` |
| Reset password | Your link to sign in and set a new password | `reset-password.html` |
| Change email address | Confirm your new email address | `change-email.html` |
| Magic link | Your link to sign in | `magic-link.html` |

`{{ .ConfirmationURL }}` is the link, `{{ .Token }}` the six-digit code, `{{ .Email }}` the
address it went to, `{{ .NewEmail }}` the new address on an email change. The sign-up email
carries both the link and the code: the app's "Check your email" screen has a box for the
code, for someone who opens the email on another device (the link would sign in that
device, not this one).

The link expiry is set on the same screen (Authentication → Emails, or Providers → Email):
24 hours is the recommendation.
