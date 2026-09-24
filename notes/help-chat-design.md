# A chat people can text (2026-09-24)

Atanas: *"can we add a chat bot text so they can chat with the bot and then anything can be
emailed to us or dealt with through the bot if possible."*

Yes — and most of the second half already exists.

## What is already built and can be reused whole

- **`/api/feedback`** already emails every message to him, from `feedback@invoiceover.com`,
  with Reply-to set to the sender. The "emailed to us" half is finished.
- **`hit_rate_limit`** (service role, HMAC'd keys, in the database) already meters the scan
  routes. The same limiter covers this, so it cannot run away.
- **`GEMINI_API_KEY`** is already in production and `gemini-3.5-flash-lite` is the cheap
  model the scanner uses for reading.

So the new part is a chat screen, a route, and a system prompt. Not much.

## What it should be

**A help bot, grounded in what the app actually does**, that answers "how do I…"
questions, and hands anything it cannot answer to Atanas by email — in one tap, through
the route that already exists.

Three rules it lives by:

1. **It says when it does not know.** A bot that invents an answer about somebody's
   accounting is worse than no bot at all. The same rule the scanner already follows:
   *only fill in what the reading is sure of*.
2. **It cannot see their records.** Not in the first version. A wrong answer about
   somebody's VAT quarter or what they are owed is real harm, and grounding it in their
   data multiplies both the risk and the cost. It answers about **the app**, not about
   **their money**.
3. **Every conversation can become an email to Atanas.** One button. That is the feature he
   actually asked for, and it is the part that already works.

## Cost, which is the real question

This is the **first thing in the app that costs money every time somebody uses it, with no
natural limit.** Scanning has one — people only have so many receipts. Chatting does not:
one bored person can send a thousand messages.

So, from the first day and not later:

- Signed in only, like every other reader route.
- Per-account and overall caps through `hit_rate_limit`, the same as `/api/scan`.
- `gemini-3.5-flash-lite`, not Opus. A help answer is not a document read.
- A short conversation window — the last few messages, not the whole history — because cost
  grows with everything you send back.
- The refusal, when a cap is hit, follows the rule already written down: a refusal is not a
  failure, it says what still works, and it leads somewhere. Here it leads to the email.

An open LLM endpoint is also **a free LLM for anyone who finds it**, which is its own reason
for every fence above.

## What it must not become

Not a replacement for the tips on each screen, and not a reason to leave a screen
confusing. If people have to ask the bot how to send an invoice, the invoice screen is
wrong. The bot is for the long tail, not for the main path.

## Worth deciding with him

- Does it appear on every screen (a small button), or only on the feedback page?
  Recommendation: **the feedback page and the header's Tools group first.** Everywhere is a
  bigger commitment and a bigger bill, and can follow if it earns it.
- Should it know his **name**? A bot that says "I'll pass this to Atanas" is friendlier and
  more honest than one that says "our team".
