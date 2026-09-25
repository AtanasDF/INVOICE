// Never ask UTC what day it is.
//
// `new Date().toISOString().slice(0, 10)` is the date in UTC. Britain is
// UTC+1 from late March to late October, so for the hour after midnight
// every summer night that expression answers YESTERDAY. This is an app for
// somebody who does the paperwork after the job, so that hour is not a
// corner case: in it, a receipt was filed under yesterday's date in a real
// accounting record, an invoice due that day was not flagged overdue, a sale
// on the first of a quarter fell into the previous quarter's VAT, and an
// invoice issued through the scan page dropped out of the tax card
// altogether. `src/lib/today.ts` exists entirely because of it, and
// `test-midnight` pins the behaviour with the clock held at 23:30 UTC.
//
// This suite pins the PATTERN, which behaviour tests cannot: a new screen
// can reintroduce it in a place no suite happens to look, and it is invisible
// for 23 hours a day. It was worth writing -- it found the 3-day bill window
// in the push cron still counting from UTC while `today` in the same function
// was already London.
//
// What is NOT the bug, and must not be flagged: UTC arithmetic on a date
// STRING (`addDays`, `addMonths`, `cutoffFor`), which anchors at
// `${iso}T00:00:00Z` and is correct and deliberate; and a full ISO timestamp
// from `new Date()`, which is a moment rather than a day.
import fs from "node:fs";
import path from "node:path";

const APP = "/Users/nasko/Desktop/INVOICE/web/src";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const SKIP = new Set(["node_modules", ".next", "vendor"]);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

const files = walk(APP);
check("there is app source to check", files.length > 50, String(files.length));

// An argless `new Date()` is the current moment. Within the next stretch of
// code, a `.slice(0, 10)` off a UTC string turns that moment into a DAY --
// and that is the bug. The window is generous on purpose, because the two
// halves are usually three lines apart:
//     const d = new Date();
//     d.setUTCDate(d.getUTCDate() + days);
//     return d.toISOString().slice(0, 10);
const WINDOW = 260;
const offenders = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  // today.ts describes the bug in its own comments, which is the one place
  // the words belong.
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /new Date\(\s*\)/g;
  let m;
  while ((m = re.exec(code))) {
    const after = code.slice(m.index, m.index + WINDOW);
    if (/toISOString\(\)/.test(after) && /slice\(\s*0\s*,\s*10\s*\)/.test(after)) {
      offenders.push(`${path.relative(APP, f)} :: ${after.split("\n").slice(0, 3).join(" ").trim().slice(0, 110)}`);
    }
  }
}
check("nothing in the app asks UTC what day it is", offenders.length === 0, offenders.join("\n  "));

// The one place that answers it, and it answers in London.
const today = fs.readFileSync(path.join(APP, "lib/today.ts"), "utf8");
check("today.ts answers in Europe/London", /timeZone:\s*"Europe\/London"/.test(today));
check("todayISO is exported from it", /export function todayISO/.test(today));
check("ukDate is exported from it, for any other moment", /export function ukDate/.test(today));
// en-CA is what gets ISO ordering out of Intl; a change here would silently
// start producing "21/09/2026" and every date comparison would break.
check("it formats in ISO order", /"en-CA"/.test(today));

// Anything that needs today should be importing it rather than rolling its
// own. This is a floor, not a ceiling: it only proves the helper is in real use.
const usesToday = files.filter((f) => /todayISO\s*\(/.test(fs.readFileSync(f, "utf8"))).length;
check("todayISO is what the app actually uses", usesToday >= 10, String(usesToday));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
// run-one.sh finds a suite's result by grepping for exactly this line, and
// reports "CRASHED -- no summary line" without it. All four of these suites
// printed only the human-readable line above, so every one of them was
// reported as a crash in a full run while passing on its own.
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
