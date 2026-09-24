#!/bin/zsh
# Every suite that runs against a built app on $BASE (default 3000).
# Camera/clip suites are excluded -- they have their own runners and clips.
#
# Suites run a few at a time: each has its own mock database and its own
# Chrome profile, so they don't touch each other, and the whole run comes
# down from about eleven minutes to about four. JOBS=1 makes it serial
# again, which is what to do if a timing-sensitive suite starts flaking.
export BASE=${BASE:-http://localhost:3000}
JOBS=${JOBS:-4}
APP=/Users/nasko/Desktop/INVOICE/web
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

# The pure-logic suites (tax and reminders) run straight off the app's own
# source, recompiled every run so they can never test a stale copy.
if [ -f "$APP/src/lib/taxEstimate.ts" ]; then
  mkdir -p gen
  # The compiled logic is ESM; without this Node reads it as CommonJS and
  # every logic suite dies on "does not provide an export named".
  printf '{"type":"module"}' > gen/package.json
  # Some of the app's own logic imports real packages (pdf-lib). Node can't
  # resolve a bare specifier from gen/, so it borrows the app's.
  ln -sfn "$APP/node_modules" gen/node_modules
  "$APP/node_modules/.bin/tsc" -p tsconfig.logic.json >/dev/null 2>&1
  python3 - <<'REWRITE'
import pathlib, re
for f in pathlib.Path("gen").rglob("*.js"):
    t = f.read_text()
    t2 = re.sub(r'from "@/lib/([\w-]+)"', r'from "./\1.js"', t)
    if t2 != t: f.write_text(t2)
REWRITE
fi

SUITES=(
  test-tax-rules test-reminder-clock test-money-edges test-money-combined test-vat-boundaries test-awkward-money test-vat-cash-basis test-pdf-pages test-next-number test-dates test-vat-pennies test-vat-from-rate test-address-words test-feedback-email test-feedback-inbox
  test-first-week test-prefix-wipe test-what-surfaces test-empty-account test-numbering test-half-saved test-keyboards test-long-values
  test-no-accidents test-public-links test-labels test-one-total test-round-trip
  test-currency test-dark-mode test-route-guards test-rls-audit test-one-handed test-free-draft test-bad-scan test-print test-no-silent-contacts test-fit-sweep test-company-picker test-company-number
  test-check-company test-review-fixes test-uploads test-address-fields test-price-finder
  test-mileage test-statement test-vat-return test-merge-contacts test-quote-chase
  test-cis test-delight test-texts test-tips test-share test-camera-tip test-camera-refusal test-big-account
  test-period-income test-sign-out test-quiet-failures test-midnight test-credit-rollback test-price-words test-answer-clash test-quote-not-invoice test-exact-customer test-register-outage test-lost-pages
  test-rotated-pages test-fit-320 test-two-users test-stored-photos test-announced test-big-slow test-odd-files test-exif-rotation test-weight
  test-inbox-worker test-inbox-ingest test-quote-vat-snapshot test-settings-save test-vat-rate-scan test-feedback test-feedback-page test-first-page test-sign-up test-plain-dates test-neutral test-plain-words test-multi-docs test-company test-copy-document test-send-document test-logo test-public-logo test-site-name test-source-text test-address-stubbed test-public-request test-links test-quote-links test-save-as test-convert
  test-theme test-readable test-dashboard test-get-the-app test-privacy-terms test-came-from test-scan-limit-text test-throwaway-email test-no-sideways test-scans-left test-scan-wall test-invites test-photo-ageing test-break-it test-people-check test-feel test-upload-panel test-file-strip test-pay-several test-form-errors test-tap-targets test-autocomplete test-page-titles test-open-receipt test-vocabulary test-double-press test-write-fails test-refusal-place test-said-so test-save-these test-cold-start test-keyboard-only test-getting-started test-money-screen test-saved-prices test-weekly-summary
  # Written before run-all.sh existed, against hand-built servers on their own
  # ports, and never added to it -- so 83 checks sat in the repo not running
  # for weeks (found 2026-09-23). They take $BASE like everything else; the
  # port in each is only its default.
  test-receipts-list test-clear test-lines test-vat-snapshot test-payments test-reminders-ui test-quotes
)

# $BASE is served by `next start` from a BUILT app, not by a watching dev
# server: edit a file and nothing on :3000 changes until it is rebuilt.
# That has already cost a whole debugging session -- a suite passed on the
# old bundle, then failed on the new one, for a fix that had been right all
# along. So: refuse to run against a build older than the source.
if [ -d "$APP/.next" ]; then
  NEWEST_SRC=$(find "$APP/src" "$APP/next.config.ts" -type f -newer "$APP/.next/BUILD_ID" 2>/dev/null | head -1)
  if [ -n "$NEWEST_SRC" ]; then
    echo "STALE BUILD: $NEWEST_SRC is newer than $APP/.next/BUILD_ID."
    echo "Run 'npm run build' in $APP and restart 'npx next start -p 3000' first,"
    echo "or set ALLOW_STALE=1 to run anyway."
    [ -z "$ALLOW_STALE" ] && exit 1
  fi
fi

# The files the upload suites hand to the app are made, not kept in git.
[ -d uploads ] || python3 gen-uploads.py >/dev/null
[ -d multi ] || python3 gen-multi.py >/dev/null

# Suites that start their own `next dev` in web/ can't run beside each
# other: two dev servers in one folder trip over the same build cache, and
# test-check-company stopped after 2 of its 54 checks when it ran next to
# test-feedback (2026-09-22). They run one at a time, after the rest.
DEV_SERVER=(test-check-company test-inbox-ingest test-feedback test-send-document test-public-logo test-address-stubbed test-public-request test-links test-quote-links test-quote-requests)
PARALLEL=(${SUITES:|DEV_SERVER})

export OUT BASE
print -l -- $PARALLEL | xargs -P "$JOBS" -n 1 ./run-one.sh
print -l -- $DEV_SERVER | xargs -P 1 -n 1 ./run-one.sh

for t in $SUITES; do
  [ -f "$OUT/$t.txt" ] && cat "$OUT/$t.txt"
done

# The run itself used to exit 0 whatever the suites said, so a script or a
# person checking only the status saw every run as green -- including the
# one where every browser suite crashed on a missing puppeteer-core.
# Judged by the summary itself (passed must equal total, and be more than
# nothing: a suite that dies before its first check prints 0/0), not by counting
# FAIL lines: ten suites end a thrown error with `console.log("ERROR", ...);
# results.push(false)`, which prints no FAIL line and still isn't a pass.
bad=$(cat "$OUT"/*.txt 2>/dev/null | awk '/^== /{ if ($0 ~ /CRASHED/) { n++; next } if (match($0, /"passed":[0-9]+,"total":[0-9]+/)) { split(substr($0, RSTART, RLENGTH), a, /[:,]/); if (a[2] != a[4] || a[4] == 0) n++ } else n++ } END { print n + 0 }')
[ "$bad" -eq 0 ] || { echo "$bad suite(s) not green"; exit 1; }
