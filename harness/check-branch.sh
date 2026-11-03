#!/bin/zsh
# check-branch.sh <branch> <logic suites...>: tsc, eslint, placeholder build, then the named logic suites.
set -u
B=$1; shift
REPO=${0:A:h:h}
WT=${TMPDIR:-/tmp}/invoicer-wt-${B//\//-}
cd $REPO
git worktree remove --force $WT 2>/dev/null
git worktree add -q --detach $WT origin/$B || exit 1
cd $WT/web
if cmp -s package-lock.json $REPO/web/package-lock.json; then cp -cR $REPO/web/node_modules node_modules; else npm ci >/dev/null 2>&1; fi
echo "== $B $(git rev-parse --short HEAD)"
npx tsc --noEmit >/dev/null 2>&1 && echo "tsc OK" || echo "tsc FAIL"
npx eslint . >/dev/null 2>&1 && echo "eslint OK" || echo "eslint FAIL"
NEXT_PUBLIC_SUPABASE_URL=https://wecfwjxzyzzrcwbwnwpo.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=harness-placeholder npm run build >build.log 2>&1 && echo "build OK" || { echo "build FAIL"; tail -15 build.log; }
cd $WT/harness
mkdir -p gen; printf '{"type":"module"}' > gen/package.json; ln -sfn $WT/web/node_modules gen/node_modules
$WT/web/node_modules/.bin/tsc -p tsconfig.logic.json >/dev/null 2>&1
python3 - <<'REWRITE'
import pathlib, re
for f in pathlib.Path("gen").rglob("*.js"):
    t = f.read_text()
    t2 = re.sub(r'from "@/lib/([\w-]+)"', r'from "./\1.js"', t)
    t2 = re.sub(r'from "(\./[\w-]+)"(?!\s*\.js)', r'from "\1.js"', t2)
    if t2 != t: f.write_text(t2)
REWRITE
for s in "$@"; do
  out=$(node $s.mjs 2>&1); echo "$s $(echo "$out" | tail -1) $(echo "$out" | grep -c '^FAIL') FAIL lines"
  echo "$out" | grep '^FAIL' | head -3
done
