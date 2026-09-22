#!/bin/zsh
# One suite, writing its summary to $OUT/<name>.txt. Used by run-all.sh
# through xargs, which is what actually gets several running at once --
# zsh has no `wait -n`, so the obvious loop quietly ran them one by one.
#
# A suite that dies before printing its {"passed":N,"total":N} line used to
# be reported as "0 fails", which reads exactly like a pass. Three suites
# sat like that for a whole run: their camera clip was missing, Chrome
# never got a video frame, puppeteer timed out, and the summary line said
# nothing was wrong. A crash is a failure and says so.
#
# A suite that prints its results and then never exits held the whole run
# up: on 2026-09-22, under heavy load, test-neutral, test-plain-words and
# test-copy-document each printed a full green summary, closed their
# browsers and then sat there for good, no sockets, no children, until
# stopped by hand. So each suite gets SUITE_LIMIT seconds (ten minutes by
# default; the slowest take four under load), and one stopped at the limit
# says so. Its summary still counts: a stuck exit is not a failed check.
# The suite runs in a process group of its own and the whole group is
# stopped, so a dev server it started can't be left holding its port for
# the next run to talk to by mistake.
t=$1
[ -f "$t.mjs" ] || exit 0
limit=${SUITE_LIMIT:-600}
out=$(perl -e '
  my $limit = shift;
  my $pid = fork();
  if ($pid == 0) { setpgrp(0, 0); exec @ARGV; exit 127; }
  $SIG{ALRM} = sub { kill "TERM", -$pid; sleep 2; kill "KILL", -$pid; exit 142 };
  alarm $limit;
  waitpid($pid, 0);
  exit($? >> 8);
' "$limit" node "$t.mjs" 2>&1)
code=$?
stopped=""
[ "$code" -eq 142 ] && stopped=" (stopped at the ${limit}s limit)"
summary=$(print -r -- "$out" | grep -o '{"passed":[0-9]*,"total":[0-9]*}' | tail -1)
fails=$(print -r -- "$out" | grep -c '^FAIL')
# A suite that passes some checks and then throws prints an ERROR line and a
# summary whose passed equals its total -- the checks after the throw never
# ran, so they are not in the total. Four suites sat green like that on
# 2026-09-22 (their upload fixtures had gone), one of them for 31 of its 48
# checks. An ERROR line is a crash, whatever the summary says.
errors=$(print -r -- "$out" | grep -c '^ERROR')
{
  if [ -z "$summary" ]; then
    print -r -- "== $t CRASHED -- no summary line (suite did not finish)$stopped"
    print -r -- "$out" | grep -E "Error|error:|TimeoutError|ENOENT|Cannot find" | head -3
  elif [ "$errors" -gt 0 ]; then
    print -r -- "== $t $summary CRASHED after its last check"
    print -r -- "$out" | grep '^ERROR' | head -2
  else
    print -r -- "== $t $summary $fails fails$stopped"
  fi
  print -r -- "$out" | grep '^FAIL' | head -5
} > "$OUT/$t.txt"
