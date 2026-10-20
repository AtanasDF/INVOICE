// One signed day count, and nobody growing a private one back.
//
// There were twelve: three functions called daysBetween (bills, duplicates,
// freeInvoiceDraft) and nine inline `/ 86_400_000` sums (the dashboard's ageing,
// money screen, statement, three in the tax estimate, the tax card, the Free
// page's date change, and copying terms off a scanned invoice). They did not
// agree -- duplicates.ts was UNSIGNED, freeInvoiceDraft gave null for a
// backwards gap, some floored, some rounded, some parsed the bare string and
// some pinned it to UTC midnight -- and only the second of those things
// mattered until somebody reused the wrong one.
//
// Three parts:
//   1. what the one function returns, across both clock changes, month ends,
//      a leap day and both signs;
//   2. every old copy, kept here VERBATIM as an oracle, against the new call
//      that replaced it, over every pair of days in a three-year window -- so
//      "no caller's behaviour changed" is checked, not asserted;
//   3. the source of web/src, read for any new private copy.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";
import { daysBetween } from "./gen/lib/today.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---------------------------------------------------------------------------
// 1. The function.

const cases = [
  ["the same day is nought", "2026-10-20", "2026-10-20", 0],
  ["tomorrow is one", "2026-10-20", "2026-10-21", 1],
  ["yesterday is minus one", "2026-10-20", "2026-10-19", -1],
  // Europe/London: clocks go forward 29 March 2026, back 25 October 2026.
  // A London-midnight count would make these days 23 and 25 hours long.
  ["across the spring change, forwards", "2026-03-28", "2026-03-30", 2],
  ["across the spring change, backwards", "2026-03-30", "2026-03-28", -2],
  ["the spring-change day itself is one day", "2026-03-29", "2026-03-30", 1],
  ["across the autumn change, forwards", "2026-10-24", "2026-10-26", 2],
  ["across the autumn change, backwards", "2026-10-26", "2026-10-24", -2],
  ["the autumn-change day itself is one day", "2026-10-25", "2026-10-26", 1],
  ["the end of a 31-day month", "2026-01-31", "2026-02-01", 1],
  ["the end of a 30-day month", "2026-04-30", "2026-05-01", 1],
  ["the end of a non-leap February", "2026-02-28", "2026-03-01", 1],
  ["a leap day is counted", "2024-02-28", "2024-03-01", 2],
  ["the leap day itself", "2024-02-29", "2024-03-01", 1],
  ["backwards over a leap day", "2024-03-01", "2024-02-28", -2],
  ["the end of a year", "2026-12-31", "2027-01-01", 1],
  ["a whole year is 365", "2026-01-01", "2027-01-01", 365],
  ["a leap year is 366", "2024-01-01", "2025-01-01", 366],
  ["a tax year, 6 April to 5 April, is 364 apart", "2026-04-06", "2027-04-05", 364],
  ["a long way back is negative", "2027-01-01", "2026-01-01", -365],
];
for (const [name, from, to, want] of cases) {
  const got = daysBetween(from, to);
  check(name, got === want, `daysBetween(${from}, ${to}) = ${got}, want ${want}`);
}
check("swapping the ends flips the sign and nothing else", cases.every(([, a, b]) => daysBetween(a, b) === -daysBetween(b, a) || daysBetween(a, b) === 0));
check("always a whole number", cases.every(([, a, b]) => Number.isInteger(daysBetween(a, b))));
check("an empty date is NaN, not a number of days", Number.isNaN(daysBetween("", "2026-10-20")) && Number.isNaN(daysBetween("2026-10-20", "")));
check("a half-typed date is NaN", Number.isNaN(daysBetween("2026-1", "2026-10-20")));

// The result must not depend on where the machine is. Run the same sums as a
// child under three zones -- the harness Mac is in London, the cloud in UTC.
const probe = `import("${new URL("./gen/lib/today.js", import.meta.url).href}").then(m=>console.log([m.daysBetween("2026-03-28","2026-03-30"),m.daysBetween("2026-10-24","2026-10-26"),m.daysBetween("2024-02-28","2024-03-01")].join()))`;
for (const tz of ["Europe/London", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
  const out = execFileSync(process.execPath, ["-e", probe], { env: { ...process.env, TZ: tz } }).toString().trim();
  check(`the same answer with the machine in ${tz}`, out === "2,2,2", out);
}

// ---------------------------------------------------------------------------
// 2. Every old copy, verbatim, against what replaced it.
//
// Each pair is [the old expression, the new call as the caller now makes it].
// Every caller passes a plain YYYY-MM-DD from a date column, a date input or a
// date already normalised server-side (documentDate.ts), plus "" or a
// half-typed value from a form -- so those are what is compared.

const OLD = {
  // lib/bills.ts -- moved, unchanged
  bills: (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000),
  // lib/duplicates.ts -- unsigned, not rounded
  duplicates: (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000,
  // lib/freeInvoiceDraft.ts -- null when unreadable or backwards
  freeDraft: (from, to) => {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Number.isNaN(a) || Number.isNaN(b) || b < a ? null : Math.round((b - a) / 86_400_000);
  },
  // app/page.tsx, the dashboard's ageing buckets
  ageing: (today, due) => Math.floor((new Date(today).getTime() - new Date(due).getTime()) / 86400000),
  // lib/moneyScreen.ts and lib/statement.ts, identical
  floorDays: (from, to) => Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000),
  // components/TaxSoFar.tsx daysUntil, and taxEstimate's three
  roundDays: (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000),
  // components/free-invoice/DraftEditor.tsx setDate
  draftEditor: (date, due) => {
    const gap = Math.round((Date.parse(due) - Date.parse(date)) / 86_400_000);
    return Number.isFinite(gap) && gap >= 0 ? gap : 30;
  },
  // app/invoices/new/page.tsx copiedTermsDays
  copiedTerms: (date, due) => {
    const gap = (Date.parse(due) - Date.parse(date)) / 86_400_000;
    return Number.isFinite(gap) && gap >= 0 ? Math.round(gap) : null;
  },
};
const NEW = {
  bills: (from, to) => daysBetween(from, to),
  duplicates: (a, b) => Math.abs(daysBetween(a, b)),
  freeDraft: (from, to) => { const d = daysBetween(from, to); return Number.isNaN(d) || d < 0 ? null : d; },
  ageing: (today, due) => daysBetween(due, today),
  floorDays: (from, to) => daysBetween(from, to),
  roundDays: (from, to) => daysBetween(from, to),
  draftEditor: (date, due) => { const gap = daysBetween(date, due); return Number.isFinite(gap) && gap >= 0 ? gap : 30; },
  copiedTerms: (date, due) => { const gap = daysBetween(date, due); return Number.isFinite(gap) && gap >= 0 ? gap : null; },
};

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const days = [];
for (let t = Date.UTC(2023, 11, 1); t <= Date.UTC(2026, 11, 31); t += 86_400_000) days.push(iso(t));
// Every pair is ~1.2 million per copy; every 7th "from" against every "to"
// still crosses every month end, both clock changes in three years, and 29
// February 2024 from both sides.
const froms = days.filter((_, i) => i % 7 === 0).concat(["2024-02-29", "2026-03-29", "2026-10-25", "2026-03-31", "2026-10-31"]);
const awkward = ["", "2026-1", "2026-13-01", "2026-02-30", "not a date"];
const guessedBefore = new Set();
const same = (x, y) => x === y || (Number.isNaN(x) && Number.isNaN(y));
for (const name of Object.keys(OLD)) {
  let pairs = 0;
  const differ = [];
  for (const a of froms) for (const b of days) {
    pairs++;
    const o = OLD[name](a, b), n = NEW[name](a, b);
    if (!same(o, n) && differ.length < 3) differ.push(`(${a}, ${b}) was ${o}, now ${n}`);
  }
  check(`${name}: unchanged on ${pairs.toLocaleString("en-GB")} pairs of real dates`, differ.length === 0, differ.join("; "));
  // Something that is not a date must give no number of days -- NaN, or the
  // caller's own fallback -- never one somebody could act on.
  const unusable = (v) => Number.isNaN(v) || v === null || v === 30;
  const odd = [];
  for (const a of awkward) for (const b of ["2026-10-20", ...awkward]) {
    const n = NEW[name](a, b);
    // 30 February is rolled on to 2 March by Date.parse itself, in every copy
    // old and new alike -- so it must AGREE, not be refused. No date input can
    // produce it.
    const whole = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (whole(a) && whole(b)) { if (!same(OLD[name](a, b), n)) odd.push(`(${a}, ${b}) was ${OLD[name](a, b)}, now ${n}`); continue; }
    if (!unusable(n)) odd.push(`(${JSON.stringify(a)}, ${JSON.stringify(b)}) gives ${n}`);
    if (!same(OLD[name](a, b), n) && !unusable(OLD[name](a, b))) guessedBefore.add(name);
  }
  check(`${name}: a date that is not one gives no number of days`, odd.length === 0, odd.join("; "));
}
// The ONE difference, and it is deliberate. The copies that handed the bare
// string to Date.parse read a half-date like "2026-1" as 1 January 2026 and
// counted from there (292 days to 20 October). The pinned form says NaN. No
// caller can be given one: every date here comes from a date column, an
// <input type="date"> (which yields "" or a whole date), todayISO/addDays, or
// documentDate.ts, which returns a full ISO date or null. Pinned so a change
// to this list is seen rather than slipped in.
check(
  "the old copies that guessed at a half-date are exactly the raw-parse ones",
  [...guessedBefore].sort().join() === "ageing,copiedTerms,draftEditor,duplicates,floorDays,roundDays",
  [...guessedBefore].sort().join()
);

// ---------------------------------------------------------------------------
// 3. The source. A private copy is the arithmetic itself -- a division by the
// length of a day -- or a helper given one of the old names. Comments are
// stripped first: the comment explaining the rule names the old copies.

const SRC = path.join(REPO, "web", "src");
const HOME = path.join(SRC, "lib", "today.ts");
// Excused by name, each for a reason that is not "it is a day count":
const EXCUSED = {
  // A rate-limit window of 24 hours, not a difference between two dates.
  "app/api/address-search/route.ts": /const DAY = 24 \* 60 \* 60 \* 1000;/,
};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
const code = (file) =>
  fs
    .readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, ""));

const DAY_LENGTH = /86_?400_?000|864e5|24 \* 60 \* 60 \* 1000|1000 \* 60 \* 60 \* 24|\/\s*(?:day|DAY|ONE_DAY|MS_PER_DAY|DAY_MS)\b/;
const OLD_NAME = /(?:function|const|let)\s+(?:daysBetween|daysUntil|daysSince|dayDiff|diffDays)\b/;
const DATE_MINUS_DATE = /getTime\(\)\s*-\s*new Date\(/;

const files = walk(SRC);
check("there is source to read", files.length > 100, String(files.length));
const found = [];
const excusedSeen = new Set();
for (const file of files) {
  if (file === HOME) continue;
  const rel = path.relative(SRC, file);
  code(file).forEach((line, n) => {
    if (!DAY_LENGTH.test(line) && !OLD_NAME.test(line) && !DATE_MINUS_DATE.test(line)) return;
    if (EXCUSED[rel]?.test(line)) { excusedSeen.add(rel); return; }
    found.push(`${rel}:${n + 1}: ${line.trim()}`);
  });
}
check("no private day count anywhere in web/src", found.length === 0, `\n  ${found.join("\n  ")}`);
// An excuse nobody needs any more should go, or it quietly excuses the next one.
for (const rel of Object.keys(EXCUSED)) check(`the excuse for ${rel} is still needed`, excusedSeen.has(rel));
check("the one copy is in lib/today.ts", /export function daysBetween\(from: string, to: string\): number/.test(fs.readFileSync(HOME, "utf8")));

// The guard has to be able to fail. Each old shape, written fresh, is caught.
const shapes = [
  "const days = Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);",
  "const gap = (b - a) / 86400000;",
  "function daysBetween(a: string, b: string) {",
  "const daysUntil = (a: string, b: string) => 0;",
  "return (new Date(a).getTime() - new Date(b).getTime()) / ONE_DAY;",
];
check("the guard catches each old shape written fresh", shapes.every((s) => DAY_LENGTH.test(s) || OLD_NAME.test(s) || DATE_MINUS_DATE.test(s)));

const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
