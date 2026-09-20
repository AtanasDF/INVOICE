#!/bin/zsh
# One suite, writing its summary to $OUT/<name>.txt. Used by run-all.sh
# through xargs, which is what actually gets several running at once --
# zsh has no `wait -n`, so the obvious loop quietly ran them one by one.
t=$1
[ -f "$t.mjs" ] || exit 0
out=$(node "$t.mjs" 2>&1)
{
  print -r -- "== $t $(print -r -- "$out" | tail -1) $(print -r -- "$out" | grep -c '^FAIL') fails"
  print -r -- "$out" | grep '^FAIL' | head -5
} > "$OUT/$t.txt"
