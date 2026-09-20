#!/bin/zsh
# Every scanner suite against the bent-paper worktree's dev server, one after another.
cd "$(dirname "$0")"
export BASE=${BASE:-http://localhost:3100}
TAG=${1:-after}
for t in test-bent.mjs test-far-v2.mjs test-batch-swap-3100.mjs test-far-recheck-3100.mjs test-autozoom3-v2.mjs test-pinch.mjs test-lens.mjs test-camera-tip.mjs; do
  echo "===== $t"
  SAVE=$TAG node $t 2>&1
done > suites-$TAG.log
echo done >> suites-$TAG.log
