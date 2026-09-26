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
import { REPO } from "./repo.mjs";

const APP = `${REPO}/web/src`;
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

// ---------------------------------------------------------------------------
// One addDays, not four
// ---------------------------------------------------------------------------
// There were four, and they did not agree: reminderTemplates and the two
// page-local copies threw a RangeError on a date that would not parse, while
// freeInvoiceDraft returned the input untouched. Every one of them was right
// about real dates, which is exactly why they all survived. Not a live bug --
// invoices coerce an empty due date to null and receipts' never reach it --
// but four functions of one name behaving two ways is how the next caller
// picks the wrong one.
const defines = files.filter((f) => /^\s*(export )?function addDays\b/m.test(fs.readFileSync(f, "utf8")));
check("addDays is defined in exactly one place", defines.length === 1, defines.map((f) => path.relative(APP, f)).join(", "));
check("...and that place is today.ts", defines[0]?.endsWith("lib/today.ts"), defines.map((f) => path.relative(APP, f)).join(", "));
// It must not throw on a date it cannot read: the Free-invoice draft holds a
// half-typed date while somebody is typing, and a throw there white-screens
// the page under their hands.
check("it guards a date it cannot parse", /if \(!\/\^\\d\{4\}/.test(today) || /test\(iso\)/.test(today), "no guard in addDays");

// Anything that needs today should be importing it rather than rolling its
// own. This is a floor, not a ceiling: it only proves the helper is in real use.
const usesToday = files.filter((f) => /todayISO\s*\(/.test(fs.readFileSync(f, "utf8"))).length;
check("todayISO is what the app actually uses", usesToday >= 10, String(usesToday));

// ---------------------------------------------------------------------------
// The other side of the boundary: SQL
// ---------------------------------------------------------------------------
// This suite reads TypeScript, and for that reason it could not see the same
// bug sitting in four database functions. Supabase runs Postgres in UTC, so
// `current_date` inside a function is the UTC date, and it was being used as
// though it were today:
//
//   respond_to_quote_link         a quote could be ACCEPTED for an hour after
//                                 it expired, while the customer's own page
//                                 had said "expired" since midnight.
//   generate_recurring_invoice    an invoice raised in that hour was DATED
//                                 YESTERDAY, into the wrong VAT quarter on the
//                                 first of one -- the same damage today.ts was
//                                 written to stop.
//   submit_quote_request_response a supplier could send prices for an hour
//                                 after needed_by had passed.
//
// migration-041 replaces all three (and 013, which 016 already superseded)
// with `public.uk_today()`. What is checked here is that nothing brings it
// back: a `current_date` in a function body must be in a file this list says
// has been superseded, and adding one anywhere else fails here. A column
// DEFAULT is allowed and listed separately -- the app always sends a date, so
// those are a fallback nothing reaches, and changing them would alter existing
// tables for no behavioural gain (migration-041's header says so too).
const SQL_DIR = `${REPO}/web/supabase`;
// Superseded, with the migration that did it. Nothing new belongs here without
// the same kind of reason written beside it.
const SUPERSEDED = {
  "migration-013-generate-recurring-invoice-function.sql": "superseded by 016, then by 041",
  "migration-016-skip-archived-client-in-recurring-invoice.sql": "superseded by 041",
  "migration-026-quote-links.sql": "superseded by 041",
  "migration-028-quote-requests.sql": "superseded by 041",
};
const sqlFiles = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql"));
const sqlOffenders = [];
let sqlDefaults = 0;
for (const f of sqlFiles) {
  const sqlLines = fs.readFileSync(path.join(SQL_DIR, f), "utf8").split("\n");
  sqlLines.forEach((line, n) => {
    // Strip -- comments AND single-quoted literals: migration-041's own
    // comment on the function explains the bug in prose, and the word inside
    // a string is not the database asking anything.
    const sqlCode = line.split("--")[0].replace(/'[^']*'/g, "''");
    if (!/current_date/.test(sqlCode)) return;
    if (/default\s+current_date/i.test(sqlCode)) { sqlDefaults += 1; return; }
    if (SUPERSEDED[f]) return;
    sqlOffenders.push(`${f}:${n + 1} ${sqlCode.trim().slice(0, 70)}`);
  });
}
check("no SQL asks UTC what day it is, outside the files recorded as superseded", sqlOffenders.length === 0, sqlOffenders.join(" | "));
check("the superseded files are all still there, so the list is about something real", Object.keys(SUPERSEDED).every((f) => sqlFiles.includes(f)), Object.keys(SUPERSEDED).filter((f) => !sqlFiles.includes(f)).join(", "));
// The column sqlDefaults are knowingly left, so their number is pinned: a new one
// is a decision somebody should make on purpose, not inherit.
check("the column defaults that still say current_date are the two known ones", sqlDefaults === 2, String(sqlDefaults));

const sqlFix = sqlFiles.find((f) => f.startsWith("migration-041"));
check("a migration exists that puts the London day into SQL", !!sqlFix, "migration-041 is missing");
if (sqlFix) {
  const sql = fs.readFileSync(path.join(SQL_DIR, sqlFix), "utf8");
  check("...it defines one place that answers it, as the app has one place", /create or replace function public\.uk_today\(\)/.test(sql) && /now\(\) at time zone 'Europe\/London'/.test(sql), "uk_today is not defined there");
  check("...marked STABLE, so it is never folded into an index or cached across a statement", /returns date\s+language sql\s+stable/.test(sql), "not stable");
  check("...and every function it replaces now calls it", ["respond_to_quote_link", "generate_recurring_invoice", "submit_quote_request_response"].every((fn) => new RegExp(`create or replace function public\\.${fn}`).test(sql)) && (sql.match(/public\.uk_today\(\)/g) ?? []).length >= 5, "a function is missing or does not call uk_today");
  check("...and it grants uk_today to nobody it need not", /revoke all on function public\.uk_today\(\) from public, anon, authenticated;/.test(sql), "the revoke is not there");
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
// run-one.sh finds a suite's result by grepping for exactly this line, and
// reports "CRASHED -- no summary line" without it. All four of these suites
// printed only the human-readable line above, so every one of them was
// reported as a crash in a full run while passing on its own.
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
