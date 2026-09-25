// The harness checking itself: can every suite be seen, and can it report?
//
// Two things have now gone wrong twice each, and both are invisible in a
// green run, which is the worst place for a fault to live.
//
// 1. **A suite that cannot report.** run-one.sh finds a result by grepping the
//    output for `{"passed":N,"total":N}`. On 2026-09-25 four new suites printed
//    only a friendly "26/26 passed", so all four were reported CRASHED in every
//    full run while passing perfectly alone -- and the first time it happened it
//    was blamed on something else entirely.
//
// 2. **A suite nobody runs.** On 2026-09-23, 83 checks were found sitting in the
//    repo, never added to run-all.sh, not running for weeks. The same day this
//    was written, `test-quote-requests` (81 checks) turned out to be in
//    DEV_SERVER but absent from SUITES -- so it ran, its failures counted
//    towards "not green", and no line ever said which suite they came from.
//
// Neither is about the app. Both are about trusting the run, which is what every
// other suite's value rests on.
import fs from "node:fs";
import path from "node:path";

const HERE = "/Users/nasko/Desktop/INVOICE/harness";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const sh = fs.readFileSync(path.join(HERE, "run-all.sh"), "utf8");
const names = (block) => {
  const out = new Set();
  for (const line of block.split("\n")) for (const m of line.split("#")[0].matchAll(/\b(test-[a-z0-9-]+)\b/g)) out.add(m[1]);
  return out;
};
const SUITES = names(/SUITES=\(\n([\s\S]*?)\n\)/.exec(sh)?.[1] ?? "");
const DEV = names(/DEV_SERVER=\(([\s\S]*?)\)/.exec(sh)?.[1] ?? "");

check("run-all.sh lists suites at all", SUITES.size > 100, String(SUITES.size));

// ---------------------------------------------------------------------------
// Every suite it names exists, and can say how it did
// ---------------------------------------------------------------------------
const missing = [...SUITES].filter((t) => !fs.existsSync(path.join(HERE, `${t}.mjs`)));
check("every suite named in run-all.sh has a file", missing.length === 0, missing.join(", "));

// The line run-one.sh greps for. Either spelling: JSON.stringify({ passed ... })
// or the literal. A suite without it is reported as a crash however green it is.
const REPORTS = /JSON\.stringify\(\s*\{\s*passed|"passed":/;
// A suite may delegate instead: test-fit-320 sets WIDTH and imports
// test-fit-sweep, which does the printing. That looked mute to the first
// version of this check, which is a false accusation -- so one level of
// delegation is followed. (Only one: a chain is worth noticing by hand.)
const reports = (t) => {
  const f = path.join(HERE, `${t}.mjs`);
  if (!fs.existsSync(f)) return false;
  const src = fs.readFileSync(f, "utf8");
  if (REPORTS.test(src)) return true;
  const to = /await import\(\s*["']\.\/(test-[a-z0-9-]+)\.mjs["']\s*\)/.exec(src)?.[1];
  return to ? REPORTS.test(fs.readFileSync(path.join(HERE, `${to}.mjs`), "utf8")) : false;
};
const mute = [...SUITES].filter((t) => fs.existsSync(path.join(HERE, `${t}.mjs`))).filter((t) => !reports(t));
check("every suite can report its result", mute.length === 0,
  `these print no {"passed":N,"total":N} and will be reported CRASHED: ${mute.join(", ")}`);

// ---------------------------------------------------------------------------
// Nothing runs invisibly
// ---------------------------------------------------------------------------
// run-all.sh runs DEV_SERVER directly, but the summary loop at its foot prints
// only what is in SUITES. A name in one and not the other runs unseen.
const unseen = [...DEV].filter((t) => !SUITES.has(t));
check("every dev-server suite is also in SUITES, so its line prints", unseen.length === 0, unseen.join(", "));

// ---------------------------------------------------------------------------
// Every suite on disk is either run, or excluded on purpose
// ---------------------------------------------------------------------------
// The camera suites drive synthetic clips and have their own runners, which
// run-all.sh says in its header. Everything else that exists should run.
const CLIP_RUNNERS = new Set([
  "test-autozoom", "test-autozoom-out", "test-autozoom2", "test-autozoom3", "test-autozoom3-v2",
  "test-bent", "test-conditions", "test-far", "test-far-recheck", "test-far-recheck-3100",
  "test-far-v2", "test-lens", "test-pinch", "test-torch", "test-torch-nocv",
  "test-address", "test-batch-swap", "test-batch-swap-3100",
]);
// Older copies kept against a port of their own, superseded by a suite that IS
// run. Named individually rather than matched by a pattern, so a NEW one cannot
// hide here: adding a file means either running it or naming it, deliberately.
const SUPERSEDED = new Map([
  ["test-receipts-list-3302", "test-receipts-list"],
  ["test-receipts-list-3302-orig", "test-receipts-list"],
]);
// Suites that exist, are not camera suites, and are not run. Every one is either
// live work nobody is running or a copy that should be named above. Listing them
// is the point: this check is what makes the choice deliberate.
const PENDING = new Set(["test-deposits", "test-free-quote", "test-quotes-fixes", "test-quotes-ux", "test-settings-add", "test-tax"]);

const onDisk = fs.readdirSync(HERE).filter((f) => /^test-[a-z0-9-]+\.mjs$/.test(f)).map((f) => f.slice(0, -4));
const unaccounted = onDisk.filter((t) => !SUITES.has(t) && !CLIP_RUNNERS.has(t) && !SUPERSEDED.has(t) && !PENDING.has(t));
check("no suite on disk is unaccounted for", unaccounted.length === 0,
  `not run, and not named as a clip suite, a superseded copy or pending: ${unaccounted.join(", ")}`);

// A superseded copy must be superseded BY something that actually runs.
const orphaned = [...SUPERSEDED].filter(([, by]) => !SUITES.has(by));
check("every superseded copy points at a suite that runs", orphaned.length === 0, JSON.stringify(orphaned));

// The pending ones are a debt, and a number that should go down. If it goes UP,
// somebody has written a suite and not run it, which is how 83 checks hid for
// weeks in September.
const pendingChecks = [...PENDING]
  .filter((t) => fs.existsSync(path.join(HERE, `${t}.mjs`)))
  .reduce((n, t) => n + (fs.readFileSync(path.join(HERE, `${t}.mjs`), "utf8").match(/^\s*check\(/gm)?.length ?? 0), 0);
console.log(`NOTE ${PENDING.size} suites are written and not running, about ${pendingChecks} checks between them.`);
check("the written-but-not-running debt has not grown", PENDING.size <= 6, String(PENDING.size));
// They must at least still exist; a name left here for a deleted file is a lie.
const ghostPending = [...PENDING].filter((t) => !fs.existsSync(path.join(HERE, `${t}.mjs`)));
check("nothing is listed as pending that is not there", ghostPending.length === 0, ghostPending.join(", "));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
