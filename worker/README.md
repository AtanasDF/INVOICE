# Invoice inbox-import Worker

Receives inbound email at any `u-<token>@invoiceover.com` address, parses
it, and posts the body + attachments to the app's `/api/inbox/ingest`
route. Deployed separately from the Next.js app -- Cloudflare Workers,
not Vercel.

## One-time setup

```bash
cd worker
npm install
npx wrangler login          # opens a browser to authorize wrangler against your Cloudflare account
```

## Deploy

```bash
npx wrangler deploy
```

The first deploy needs one secret set (do this before or after the first
deploy, either order works):

```bash
npx wrangler secret put INBOX_WEBHOOK_SECRET
```

Paste in the value from `web/.env.local`'s `INBOX_WEBHOOK_SECRET` line --
the same value that also needs to be set in Vercel's environment
variables for the Next.js app, since both sides have to agree on it.

## Wire it up in Cloudflare (dashboard, one-time)

1. **Email** → **Email Routing** for `invoiceover.com`.
2. Under **Routing rules**, find (or add) a **Catch-all address** rule.
3. Set its action to **Send to a Worker**, and pick `invoice-inbox-worker`.
4. Leave the existing `receipts@invoiceover.com` → forward-to-Gmail rule
   in place if you still want it -- specific-address rules are matched
   before the catch-all, so the two don't conflict. Remove it whenever
   you're done using it as the placeholder/test address.

That's it -- every `u-<token>@invoiceover.com` now routes to this Worker
automatically, including tokens generated after this is set up. No
per-user Cloudflare configuration needed.

## Redeploying after a code change

```bash
npx wrangler deploy
```

Secrets already set (`INBOX_WEBHOOK_SECRET`) carry over automatically --
no need to re-set them.

## Debugging

```bash
npx wrangler tail
```

Streams this Worker's live logs -- useful for watching what happens when
a test email actually arrives.
