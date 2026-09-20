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
  `torch-bright.mjpeg` and `dark-nocv2.mjpeg` (used by `test-torch`, `test-torch-nocv`,
  neither in `run-all.sh`) are still missing a generator.

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
