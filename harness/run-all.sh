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
  test-tax-rules test-reminder-clock test-money-edges test-vat-cash-basis test-pdf-pages test-next-number test-dates test-vat-pennies
  test-first-week test-prefix-wipe test-what-surfaces test-empty-account test-numbering test-half-saved test-keyboards test-long-values
  test-no-accidents test-public-links test-labels test-one-total test-round-trip
  test-currency test-dark-mode test-route-guards test-rls-audit test-one-handed test-free-draft test-bad-scan test-print test-no-silent-contacts test-fit-sweep test-company-picker test-company-number
  test-check-company test-review-fixes test-uploads test-address-fields test-price-finder
  test-mileage test-statement test-vat-return test-merge-contacts test-quote-chase
  test-cis test-delight test-texts test-tips test-share test-camera-tip test-camera-refusal test-big-account
  test-period-income test-sign-out test-quiet-failures test-midnight test-credit-rollback test-price-words
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

export OUT BASE
print -l -- $SUITES | xargs -P "$JOBS" -n 1 ./run-one.sh

for t in $SUITES; do
  [ -f "$OUT/$t.txt" ] && cat "$OUT/$t.txt"
done
