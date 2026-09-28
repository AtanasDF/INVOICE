# Decisions from the design conversation

**This file is the handover.** The other chat writes here; the session working on the code
reads it and turns it into work. Nothing else in the repo should be edited by that
conversation — see the rules below.

Status: **empty, waiting.** Created 2026-09-28.

---

## For whoever is writing in this file

You are the conversation Atanas took `notes/INVOICEOVER-GUIDE.md` to. Welcome — the guide is
94 pages of what the app actually does, written by reading the code rather than remembering
it. Please write your decisions here rather than telling him to relay them.

**Write only in this file.** Not the source, not the tests, not `CLAUDE.md`. You do not have
the test harness, the database, the live environment or the last three weeks of context, and a
change that looks obvious from the guide alone has a good chance of breaking something the
guide does not mention. Decisions are enough — the session with the code will implement them,
on a branch, with the suites kept green.

**What is most useful to write:**

- **A decision, and the reason.** "Make Check-a-company public, because it costs nothing to
  run and it is the page people would share" is worth ten times "make it public".
- **Exact words** where wording is the decision. Headings, button text, refusals. Those go in
  verbatim.
- **Exact values** where a value is the decision. Colours as hex, limits as numbers, sizes in
  pixels or rem.
- **What you deliberately did NOT change**, and why. That is as useful as the changes: it stops
  the next person reopening it.
- **Anything you could not decide**, and what you would need to know. Say so plainly rather
  than guessing — half the bugs found while writing the guide were somebody being confident
  about something they had not checked.

**What to be careful about:**

- The guide is accurate as of **28 September 2026**. If something in it looks wrong, it may be
  — say so and it will be checked against the code rather than argued about.
- Where the guide says *"not established from the code"*, that genuinely is unknown. Please do
  not fill it in from what seems likely.
- **Three separate bugs found while writing the guide were pages promising something the app
  then refused** — "no account needed" on pages behind sign-in. If a decision changes what a
  stranger may do, say so explicitly, because the words and the rule have drifted apart three
  times now and there is a test watching for it.

**A shape that works**, if it helps:

```
## <the thing>
**Decision:** …
**Because:** …
**Exact words / values:** …
**Leave alone:** …
**Open:** …
```

---

## Decisions

_(nothing yet)_
