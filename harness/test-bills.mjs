// What counts as a bill, when one is due soon -- and that nothing has grown
// its own copy of either.
//
// Both rules were written out four times. The rule itself (a supplier invoice,
// not paid, not still waiting to be checked) was in the dashboard, again in
// moneyScreen.ts, and again as three .eq() filters in the push cron. The window
// was the bare number 3 in the dashboard's due label, the dashboard's banner
// count, the receipts list's amber badge, and the cron's query.
//
// They agreed, which is not the point. `addMonths` agreed too, until a second
// copy without the month-end clamp printed a one-month warranty as running
// "until 3 March" and the recurring-invoice cron and the button on the
// recurring page disagreed about 31 January plus a month. A rule stated once in
// CLAUDE.md and implemented four times with a magic number is the same
// arrangement waiting for the same accident.
//
// So the second half of this file is the part that earns its keep: it reads the
// source and fails if a screen counts bills, or the days until one is due, by
// itself.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";
import { BILL_DUE_SOON_DAYS, daysBetween, dueSoon, dueSoonBy, isBill } from "./gen/lib/bills.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const bill = (over = {}) => ({ documentType: "invoice", paid: false, needsReview: false, ...over });

// ---------------------------------------------------------------------------
// What a bill is
// ---------------------------------------------------------------------------
check("an unpaid supplier invoice is a bill", isBill(bill()) === true);
check("a paid one is not", isBill(bill({ paid: true })) === false);
check("a receipt is not a bill", isBill(bill({ documentType: "receipt" })) === false);
check("a credit note is not a bill", isBill(bill({ documentType: "credit_note" })) === false);
check("'other' is not a bill", isBill(bill({ documentType: "other" })) === false);
// Nobody should be chased for a figure a machine read off a photograph and no
// person has looked at yet.
check("one still waiting to be checked is not a bill", isBill(bill({ needsReview: true })) === false);
check("...not even when it is unpaid and overdue", isBill(bill({ needsReview: true, paid: false })) === false);

// ---------------------------------------------------------------------------
// Due soon, and already late
// ---------------------------------------------------------------------------
const TODAY = "2026-10-09";
check("the window is three days", BILL_DUE_SOON_DAYS === 3, String(BILL_DUE_SOON_DAYS));
check("due today is soon", dueSoon("2026-10-09", TODAY) === true);
check("due tomorrow is soon", dueSoon("2026-10-10", TODAY) === true);
check("due on the last day of the window is soon", dueSoon("2026-10-12", TODAY) === true);
check("a day past the window is not", dueSoon("2026-10-13", TODAY) === false);
check("a fortnight away is not -- nothing nags about that", dueSoon("2026-10-23", TODAY) === false);
// Already late must count, or a bill goes quiet the moment it matters most.
check("already late counts as soon", dueSoon("2026-10-01", TODAY) === true);
check("very late still counts", dueSoon("2025-01-01", TODAY) === true);
// No due date is not a deadline. It still shows in the list of what is owed;
// it just cannot be counted down to.
check("no due date is never soon", dueSoon(null, TODAY) === false);
check("an empty due date is never soon", dueSoon("", TODAY) === false);

check("the SQL cut-off is the end of the window", dueSoonBy(TODAY) === "2026-10-12", dueSoonBy(TODAY));
check("...and it agrees with dueSoon", dueSoon(dueSoonBy(TODAY), TODAY) === true);
check("...right up to its edge", dueSoon("2026-10-13", TODAY) === false && dueSoonBy(TODAY) < "2026-10-13");

// ---------------------------------------------------------------------------
// Counting days, over the awkward boundaries
// ---------------------------------------------------------------------------
check("a day is a day", daysBetween("2026-10-09", "2026-10-10") === 1);
check("the past is negative", daysBetween("2026-10-09", "2026-10-08") === -1);
check("the same day is nought", daysBetween("2026-10-09", "2026-10-09") === 0);
// Britain is UTC+1 from late March to late October. Both endpoints are parsed
// as UTC midnight, so a difference across the boundary must still be whole.
check("across the end of BST it is still whole days", daysBetween("2026-10-24", "2026-10-26") === 2);
check("across the start of BST it is still whole days", daysBetween("2026-03-28", "2026-03-30") === 2);
check("a leap day is counted", daysBetween("2024-02-28", "2024-03-01") === 2);
check("a non-leap February is counted", daysBetween("2026-02-28", "2026-03-01") === 1);
check("a year is 365 days", daysBetween("2026-01-01", "2027-01-01") === 365);
// A whole year of starts, so nothing is special about the dates above.
let whole = true;
for (let d = 0; d < 400; d++) {
  const from = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(2026, 0, 1 + d + 3)).toISOString().slice(0, 10);
  if (daysBetween(from, to) !== 3) whole = false;
}
check("three days is three days on every date of the year", whole);

// ---------------------------------------------------------------------------
// AND NOBODY HAS THEIR OWN COPY
// ---------------------------------------------------------------------------
const SRC = `${REPO}/web/src`;
const SKIP = new Set(["node_modules", ".next", "vendor"]);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
// Comments are blanked line-for-line, because the comments that EXPLAIN this
// rule quote the very things it bans -- the mistake test-promises made and
// fixed.
const code = (file) =>
  fs
    .readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, ""));

const files = walk(SRC);
check("there is source to read", files.length > 100, String(files.length));

const HOME = path.join(SRC, "lib", "bills.ts");
const ownRule = [];
const ownDays = [];
for (const file of files) {
  if (file === HOME) continue;
  const rel = path.relative(`${REPO}/web`, file);
  code(file).forEach((line, n) => {
    // The rule spelled out: a document type of invoice tested together with
    // paid. Either the TypeScript shape or the database columns.
    if (/documentType === "invoice"/.test(line) && /!\s*\w+\.paid|\.paid\s*===\s*false/.test(line)) ownRule.push(`${rel}:${n + 1}`);
    // The cron has to ask Postgres rather than a list, so it filters by
    // column -- but with BILL_COLUMNS from the same file, not a second copy
    // that happens to agree.
    if (/"document_type",\s*"invoice"/.test(line)) ownRule.push(`${rel}:${n + 1} (as a query)`);
    // A fresh copy of the day count.
    if (/function daysBetween\b/.test(line)) ownDays.push(`${rel}:${n + 1}`);
  });
}
check("no screen decides for itself what a bill is", ownRule.length === 0, ownRule.join(", "));
// The cron's query must be built from the shared columns, or the rule is in two
// places again -- in two languages, which is worse.
// Comments stripped: the comment that EXPLAINS this rule names the old helper,
// so reading the raw file made the check fail on its own fix -- the same
// mistake test-promises made and wrote down.
const cron = code(`${SRC}/app/api/notifications/check/route.ts`).join("\n");
check("the push cron asks the database with the shared rule", /\.match\(BILL_COLUMNS\)/.test(cron));
check("...and takes the window from the shared number", /dueSoonBy\(/.test(cron) && !/daysFromToday\(/.test(cron));

// The day count is NOT consolidated yet and this check says so out loud rather
// than passing quietly: four copies exist and they are not equivalent --
// lib/duplicates.ts returns an UNSIGNED difference and does not round, so
// reusing it for "is this overdue" gives the wrong sign without a word. The
// number here comes down as they are replaced, and must never go up.
check(
  "the copies of daysBetween are not multiplying",
  ownDays.length <= 4,
  `${ownDays.length} copies: ${ownDays.join(", ")}`
);

// The window must be one number. A bare 3 compared against a day count is the
// shape that was spread over four files.
//
// lib/duplicates.ts is excused by name, not by accident: its `<= 3` is a
// DIFFERENT rule -- how near in date two receipts must be to be a possible
// duplicate of each other -- and it is 3 by coincidence. Making it follow the
// bill window would tie two unrelated things together, which is its own bug
// waiting to happen.
const DIFFERENT_RULE = [path.join(SRC, "lib", "duplicates.ts")];
const loose = [];
for (const file of files) {
  if (file === HOME || DIFFERENT_RULE.includes(file)) continue;
  const rel = path.relative(`${REPO}/web`, file);
  code(file).forEach((line, n) => {
    if (/days(?:Between\([^)]*\))?\s*<=\s*3\b/.test(line) || /daysFromToday\(3\)/.test(line)) loose.push(`${rel}:${n + 1}`);
  });
}
check("the three-day window is not written out by hand anywhere", loose.length === 0, loose.join(", "));

// And CLAUDE.md states this rule, so the file and the code must agree.
const claude = fs.readFileSync(`${REPO}/CLAUDE.md`, "utf8");
check("CLAUDE.md still describes the window it is written with", new RegExp(`within ${BILL_DUE_SOON_DAYS} days`).test(claude), `CLAUDE.md does not say "within ${BILL_DUE_SOON_DAYS} days"`);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
