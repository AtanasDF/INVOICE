# The test harness

Headless Chrome driving the real app against a fake database, plus synthetic camera
footage. It is how nearly everything in this repo has been checked: no test has ever
touched Atanas's live Supabase.

This folder is the **source of truth for the harness code**. It was living only in a
session scratchpad, which is wiped without warning — 179 files and several days of work
that nothing was keeping.

## What's here

- `mockdb.mjs` — a PostgREST stand-in. `launchSignedIn(db, {base, width, profile, intercept})`
  opens Chrome with a fake Supabase session and answers every request to the Supabase host
  from an in-memory `db.tables`. `db.fail = {"GET invoices": 5}` makes the next five of
  those fail; `db.loseReply` lets a write commit and then drops the reply; `db.allowDelete`
  lists the tables a test is allowed to delete from. Nothing leaves the machine.
- `test-*.mjs` — one suite per subject. Each prints `PASS`/`FAIL` lines and ends with
  `{"passed":n,"total":n}`.
- `run-all.sh` — runs the suites four at a time (`JOBS=1` for serial, `BASE` for the
  server). About four minutes for the whole set.
- `tsconfig.logic.json` — compiles the app's own pure logic (tax, reminders, CIS, VAT,
  dates, recurrence) into `gen/` so the logic suites test the real source rather than a
  copy that can drift. `run-all.sh` recompiles it every run.
- `camera*.mjs`, `mock-server.mjs`, `qr-mock-server.mjs` — fake camera and standalone
  PostgREST servers for the scanner suites.
- `gen-*.py` — generate the synthetic camera clips (PIL): concatenated JPEGs, 720x1080 at
  30fps, which is exactly what Chrome's `--use-file-for-fake-video-capture` reads. The
  clips themselves are ~770MB and are **not** kept here; run the generator for the clip a
  suite needs before running it. `gen-large.py` makes `large.mjpeg`, the one nine suites
  use — it had no generator at all until 2026-09-20, having only ever been made by hand in
  a scratchpad that was later wiped, so four suites in `run-all.sh` simply crashed.
  `gen-torch.py` makes `torch-bright.mjpeg` and `dark-nocv2.mjpeg` (`test-torch`,
  `test-torch-nocv`, neither in `run-all.sh`); `gen-dark.py` and `gen-dim.py` the other two
  torch clips.
- `gen-uploads.py` and `gen-multi.py` — the files the upload suites hand to the app, into
  `uploads/` and `multi/` (both gitignored; `run-all.sh` makes them when missing). They too
  had lived only in a wiped scratchpad, and for a while four suites stopped part-way and
  still counted as green. The PDFs in `uploads/` carry DOC1..DOC3 in UTF-16 in their Title,
  which is how the stand-in readers tell them apart; the photos in `multi/` are told apart
  by pixel size (1200x900, 800x1000, 900x1100, 1000x700), so those sizes are the contract.
- `run-one.sh` counts a suite as crashed when it has no summary line, and also when it
  prints an ERROR line after some passes: the checks after a throw never ran, so they are
  not in its total, and passed == total would otherwise read as green.

## One trap worth knowing

Seed rows with `UID` from `mockdb.mjs`, not a made-up `user_id: "x"`. Reads work either
way (the mock enforces no RLS), so most suites get away with it — but an **upsert**
matches its conflict target against what the app writes, which is the signed-in session's
real id. Seeded as `"x"`, a `business_profile` upsert matches nothing, appends a second
row, and a suite reading `tables[0]` sees the stale one and passes for the wrong reason.
That cost an hour on 2026-09-20, chasing a fix that had been correct all along.

## A second trap: innerText is not the whole page

`bodyText(page)` is `document.body.innerText`, which does **not** include what is typed
in an `<input>`, `<textarea>` or `<select>`. A negative check on data that lives in a box
-- "this draft was not imported", "that field is empty" -- therefore passes whether or not
the thing happened. Read the values too:

```js
const everything = async () =>
  (await bodyText(page)) + " " +
  (await page.evaluate(() => [...document.querySelectorAll("input, textarea, select")].map((i) => i.value).join(" ")));
```

## A third trap: suites that run somebody else's copy of the app

`test-check-company` starts its own Next server (it needs a Companies House key and a
stand-in API), and its `WEB` pointed at `.claude/worktrees/check-company/web` — the
branch the feature was written on. It had been testing a frozen copy ever since that
branch merged: green whatever changed in `main`, and broken outright the day those
worktrees are deleted. Fixed 2026-09-21; `test-quote-requests` imported from a worktree
the same way. If a suite needs a path outside `harness/`, it should be `web/`.

## Running it

```
cd web && npm run build && npx next start -p 3000        # a built app to test
cd harness && npm install                                 # puppeteer-core only
BASE=http://localhost:3000 ./run-all.sh
```

Chrome comes from `/Applications/Google Chrome.app`. Each suite keeps its own
`profile-*` directory so they don't tread on each other — those, `gen/` and the clips are
all disposable, which is why only source is kept here.

Run it from a scratchpad copy rather than from the repo if you don't want profile
directories and screenshots landing in the working tree.

## Writing one

Copy the shape of `test-first-week.mjs` (the end-to-end walk) or `test-money-edges.mjs`
(pure logic, no browser). Two things learned the hard way:

- **Make the mock answer the way the real thing answers.** `test-bad-scan` faked
  `/api/scan` with `documents` but no `result`, which the client reads as a failed scan —
  so all three of its cases quietly tested the same error path, and hid a crash on an
  empty read until the mock was fixed.
- **Check the app before "fixing" it.** Two suites here failed against correct behaviour:
  the dashboard lists every unpaid bill while only the banner counts urgent ones, and a
  credit note on a CIS invoice takes less off the balance than its face value because part
  of it was being kept back anyway. Both times the code was right and the expectation was
  wrong.

## Added 2026-09-23

| Suite | What it holds to |
|---|---|
| `test-theme` | A theme changes ordinary `neutral-*` classes, survives a reload with no flash of grey, reaches the front door, and never reaches a printed invoice. |
| `test-readable` | Contrast in all five themes on the front door and the dashboard, every box labelled, a visible focus ring, nothing too small to tap. It found `neutral-500` on `neutral-100` failing AA in every theme. |
| `test-dashboard` | The scanner at the top, the three buttons under it, one list of customers and suppliers, a name starting their invoice, three panels remembered per device, Check a company lower and smaller. |
| `test-first-page` | The front door: three lines not six, a picture, and the sign-in box above the reading on a phone. |
| `test-get-the-app` | Install steps that match the phone. Headless Chrome offers an install of its own accord, so the cases are staged through `navigator` — **not** request interception, which the harness uses for Supabase and which blanks the app if taken over. |
| `test-privacy-terms` | Both readable signed out, linked everywhere, saying the two things people would be angry to learn later, and never printed. |
| `test-came-from` | A flyer's tag kept on the device, first one winning, cleaned of anything that is not letters, digits or dashes, and carried onto the account at sign-up. |
| `test-scan-limit-text` | What someone is told at the wall, and that with `SCAN_LIMITS` unset nothing is ever refused. |
| `test-throwaway-email` | Mostly who must **not** be caught: tempest-joinery, temperance-ltd, notmailinator. |
| `test-no-sideways` | Nothing scrolls sideways at any width from 1440 down to 320 — from the first feedback anyone outside ever sent. |

`check-scans.mjs` is not a suite: it marks a real scanning session against
`test-documents/expected.json` and prints what was misread.
