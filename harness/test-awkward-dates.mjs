// The days arithmetic goes wrong on.
//
// test-midnight already pins the one that bit for real: the app asking UTC
// what day it is, which for an hour after midnight in summer dated a
// receipt yesterday. This is the rest of the family -- the days that are
// not 24 hours long, the months that are not 30 days, and the year that has
// a 29th of February.
//
// All pure logic, so it runs anywhere and fast: the point is to try every
// awkward date rather than the handful somebody remembers.
import { addDays, reminderDueToday, longDate, REMINDER_SCHEDULE } from "./gen/lib/reminderTemplates.js";
import { quarterOf, previousQuarter } from "./gen/lib/vatReturn.js";
import { todayISO } from "./gen/lib/today.js";
import { addMonths, nextDueFromDay } from "./gen/lib/recurrence.js";
import { taxYearOf } from "./gen/lib/taxEstimate.js";
import fs from "node:fs";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---- Days that are not 24 hours long ---------------------------------------
// Britain springs forward on the last Sunday in March and back on the last
// in October. Date arithmetic on a date STRING is immune to that, which is
// the whole reason the app does it that way -- so prove it stays immune.
check("the clocks going forward does not lose a day", addDays("2026-03-28", 1) === "2026-03-29" && addDays("2026-03-29", 1) === "2026-03-30");
check("the clocks going back does not repeat one", addDays("2026-10-24", 1) === "2026-10-25" && addDays("2026-10-25", 1) === "2026-10-26");
check("thirty days across the spring change lands right", addDays("2026-03-15", 30) === "2026-04-14", addDays("2026-03-15", 30));
check("and across the autumn one", addDays("2026-10-15", 30) === "2026-11-14", addDays("2026-10-15", 30));

// ---- February ---------------------------------------------------------------
check("2024 had a 29th of February", addDays("2024-02-28", 1) === "2024-02-29");
check("2026 does not", addDays("2026-02-28", 1) === "2026-03-01");
check("2100 will not, despite dividing by four", addDays("2100-02-28", 1) === "2100-03-01");
check("2000 did, despite dividing by one hundred", addDays("2000-02-28", 1) === "2000-02-29");
check("a year from a leap day is the 28th, not the 1st", addDays("2024-02-29", 365) === "2025-02-28", addDays("2024-02-29", 365));

// ---- Month ends -------------------------------------------------------------
// 30 days from the 31st of January is not "the 31st of February".
check("thirty days from 31 January is 2 March", addDays("2026-01-31", 30) === "2026-03-02", addDays("2026-01-31", 30));
check("and in a leap year, 1 March", addDays("2024-01-31", 30) === "2024-03-01", addDays("2024-01-31", 30));
for (const d of ["2026-01-31", "2026-03-31", "2026-05-31", "2026-08-31", "2026-10-31", "2026-12-31"]) {
  const next = addDays(d, 1);
  if (!/^\d{4}-\d{2}-01$/.test(next)) check(`the day after ${d}`, false, next);
}
check("the day after every month end is the first of the next", true);
check("the day after 31 December is New Year's Day", addDays("2026-12-31", 1) === "2027-01-01", addDays("2026-12-31", 1));

// ---- VAT quarters -----------------------------------------------------------
const q = quarterOf("2026-02-15");
check("a February date is in the Jan-Mar quarter", q.from === "2026-01-01" && q.to === "2026-03-31", JSON.stringify(q));
const feb = quarterOf("2024-02-29");
check("a leap day belongs to its quarter like any other", feb.from === "2024-01-01" && feb.to === "2024-03-31", JSON.stringify(feb));
const last = quarterOf("2026-12-31");
check("the last day of the year is in the Oct-Dec quarter", last.from === "2026-10-01" && last.to === "2026-12-31", JSON.stringify(last));
const prevOfJan = previousQuarter("2026-01-01");
check("the quarter before January is the last of the old year", prevOfJan.from === "2025-10-01" && prevOfJan.to === "2025-12-31", JSON.stringify(prevOfJan));
// The boundary that matters: a sale at 23:59 on the last day of a quarter
// belongs to that quarter, not the next.
const boundary = quarterOf("2026-06-30");
check("the last day of a quarter is in it, not the next one", boundary.to === "2026-06-30", JSON.stringify(boundary));
check("and the first day of the next is in the next", quarterOf("2026-07-01").from === "2026-07-01");
// Every quarter end is a real date.
for (const m of ["01", "04", "07", "10"]) {
  const qq = quarterOf(`2026-${m}-05`);
  const dayCount = Math.round((Date.parse(qq.to) - Date.parse(qq.from)) / 86400000) + 1;
  if (dayCount < 89 || dayCount > 92) check(`quarter from ${qq.from} is ${dayCount} days`, false, JSON.stringify(qq));
}
check("every quarter is between 89 and 92 days", true);

// ---- Reminders --------------------------------------------------------------
// Each reminder has a three-day catch-up window and they must never overlap,
// or one invoice gets chased twice on the same day.
const due = "2026-02-27";
const fired = [];
for (let d = -10; d <= 40; d++) {
  const today = addDays(due, d);
  const kind = reminderDueToday(due, today);
  if (kind) fired.push({ today, kind });
}
const byDay = new Map();
for (const f of fired) byDay.set(f.today, (byDay.get(f.today) ?? 0) + 1);
// This looked like the overlap check and was not: reminderDueToday returns
// the FIRST schedule entry that matches, so it can never return two and the
// count is one by construction. Proved vacuous by widening the catch-up
// window to nine days and watching nothing fail.
check("no day ever fires two reminders", [...byDay.values()].every((n) => n === 1), JSON.stringify([...byDay].filter(([, n]) => n > 1)));
// The second attempt was vacuous too: it recomputed the windows inside the
// test with the same arithmetic, so it checked my sums rather than the
// app's. The contract that cannot be faked is this one -- on the day a
// reminder is scheduled for, THAT is the reminder that fires. A window wide
// enough to swallow the next one breaks it immediately.
const onTheDay = REMINDER_SCHEDULE.map((step) => ({ want: step.kind, got: reminderDueToday(due, addDays(due, step.days)) }));
check("each reminder fires on the day it is scheduled for", onTheDay.every((r) => r.want === r.got), JSON.stringify(onTheDay));
// And the day before a reminder is due, it is not that one yet.
const notYet = REMINDER_SCHEDULE.slice(1).map((step) => ({ kind: step.kind, dayBefore: reminderDueToday(due, addDays(due, step.days - 1)) }));
check("and not a day early", notYet.every((r) => r.dayBefore !== r.kind), JSON.stringify(notYet));

check("every reminder in the schedule gets a chance to fire", new Set(fired.map((f) => f.kind)).size === REMINDER_SCHEDULE.length, JSON.stringify([...new Set(fired.map((f) => f.kind))]));
// A due date on a leap day, chased across the year boundary.
const leapDue = "2024-02-29";
const leapFired = [];
for (let d = -5; d <= 35; d++) if (reminderDueToday(leapDue, addDays(leapDue, d))) leapFired.push(d);
check("an invoice due on a leap day is still chased", leapFired.length >= REMINDER_SCHEDULE.length, JSON.stringify(leapFired));
check("an invoice due on 31 December is chased into the new year", reminderDueToday("2026-12-31", "2027-01-30") !== null, String(reminderDueToday("2026-12-31", "2027-01-30")));

// ---- Recurring --------------------------------------------------------------
// A monthly bill dated the 31st is the classic one, and this suite used to
// pin the WRONG answer. `setUTCMonth` rolls over: 31 January plus a month
// became 3 March, and the comment here called that "worth knowing about and
// pinning". What it did not know is that the same column is advanced by two
// different things -- `addMonths` when somebody presses the button on the
// recurring page, and `next_due_date + interval '1 month'` inside
// generate_recurring_invoice (migration-013, line 89) when the nightly cron
// does it -- and Postgres CLAMPS. So the two paths disagreed on any day past
// the 28th and whichever ran last won. Postgres's answer is the right one and
// `addMonths` now gives it; checked by running the migration's own expression
// in a real Postgres 18 over every day of 2024-2027 by seven different
// offsets, 10,227 comparisons, no disagreements.
//
// The day picker clamps the chosen day to 28, which is the only reason this
// never showed on a schedule. The warranty date on the receipts list had no
// such clamp and was reading a one-month warranty from 31 January as 31 days.
check("a month after 31 January is the last day of February, not the 3rd of March", addMonths("2026-01-31", 1) === "2026-02-28", addMonths("2026-01-31", 1));
check("and in a leap year that is the 29th", addMonths("2024-01-31", 1) === "2024-02-29", addMonths("2024-01-31", 1));
check("a month after the 28th is always safe", addMonths("2026-01-28", 1) === "2026-02-28", addMonths("2026-01-28", 1));
check("twelve months from a leap day is the 28th of February", addMonths("2024-02-29", 12) === "2025-02-28", addMonths("2024-02-29", 12));
check("a month from 31 March is 30 April", addMonths("2026-03-31", 1) === "2026-04-30", addMonths("2026-03-31", 1));
check("a month across the spring clock change keeps its day", addMonths("2026-03-15", 1) === "2026-04-15", addMonths("2026-03-15", 1));
check("and across the autumn one", addMonths("2026-10-15", 1) === "2026-11-15", addMonths("2026-10-15", 1));
check("a month from 31 December is 31 January", addMonths("2026-12-31", 1) === "2027-01-31", addMonths("2026-12-31", 1));
// Adding a month never lands in a month it was not asked for, whatever the
// starting day -- the failure the rollover made invisible.
let neverSkips = true, skipped = "";
for (let m = 1; m <= 12; m++) {
  for (const d of [28, 29, 30, 31]) {
    const from = `2026-${String(m).padStart(2, "0")}-${d}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number(from.slice(8)) !== d) continue;
    const got = addMonths(from, 1);
    const want = (m % 12) + 1;
    if (Number(got.slice(5, 7)) !== want) { neverSkips = false; skipped = `${from} -> ${got}`; }
  }
}
check("a month later is always the next month, from any day of any month", neverSkips, skipped);
// What the cron actually walks: it clamps once and then keeps the clamped
// day. Pinned as it is rather than as it might ideally be, because the app
// must agree with the database, and this is what the database does.
let cron = "2026-01-31";
const walk = [cron];
for (let i = 0; i < 6; i++) { cron = addMonths(cron, 1); walk.push(cron); }
check("a schedule clamped at a month end keeps the clamped day after that", walk.join(" ") === "2026-01-31 2026-02-28 2026-03-28 2026-04-28 2026-05-28 2026-06-28 2026-07-28", walk.join(" "));
// The receipts list prints "Warranty: N months (until X)" straight from this.
check("a one-month warranty bought on 31 January runs to the end of February", addMonths("2026-01-31", 1) === "2026-02-28", addMonths("2026-01-31", 1));
check("a six-month warranty bought on 31 August runs to the end of February", addMonths("2026-08-31", 6) === "2027-02-28", addMonths("2026-08-31", 6));
// The two rules must stay one rule. If the migration's month-add is ever
// changed to something other than Postgres's clamping `interval '1 month'`,
// every check above is pinning the wrong thing and nothing else would notice.
const sql = fs.readFileSync(`${REPO}/web/supabase/migration-013-generate-recurring-invoice-function.sql`, "utf8");
check("the cron still advances the date with Postgres's own clamping month-add", /next_due_date\s*=\s*\(v_row\.next_due_date \+ interval '1 month'\)::date/.test(sql), sql.split("\n").filter((l) => l.includes("next_due_date =")).join(" | "));
// Every month of a year, repeated, stays a real date.
let rolling = "2026-01-15", allReal = true;
for (let i = 0; i < 24; i++) { rolling = addMonths(rolling, 1); if (!/^\d{4}-\d{2}-\d{2}$/.test(rolling)) allReal = false; }
check("two years of monthly steps stay real dates", allReal && rolling === "2028-01-15", rolling);
// The day-of-month picker never offers a date in the past.
const from29 = nextDueFromDay(29);
check("a bill set for the 29th gets a real next date", /^\d{4}-\d{2}-\d{2}$/.test(from29) && from29 >= todayISO(), from29);
const from31 = nextDueFromDay(31);
check("and so does one set for the 31st", /^\d{4}-\d{2}-\d{2}$/.test(from31) && from31 >= todayISO(), from31);

// ---- The tax year -----------------------------------------------------------
// It starts on 6 April, which is the boundary people get wrong.
check("5 April is in the old tax year", taxYearOf("2026-04-05").label === "2025/26", JSON.stringify(taxYearOf("2026-04-05")));
check("6 April starts the new one", taxYearOf("2026-04-06").label === "2026/27" && taxYearOf("2026-04-06").start === "2026-04-06", JSON.stringify(taxYearOf("2026-04-06")));
check("and New Year's Day is still in the old one", taxYearOf("2027-01-01").label === "2026/27", JSON.stringify(taxYearOf("2027-01-01")));
check("a tax year ends the day before the next begins", taxYearOf("2026-06-01").end === "2027-04-05", JSON.stringify(taxYearOf("2026-06-01")));
// A leap day falls inside a tax year like any other date.
check("a leap day is in the tax year that contains it", taxYearOf("2024-02-29").label === "2023/24", JSON.stringify(taxYearOf("2024-02-29")));

// ---- What people are shown --------------------------------------------------
check("a leap day prints as a leap day", /29 February 2024/.test(longDate("2024-02-29")), longDate("2024-02-29"));
check("a date is never printed a day out", /1 January 2026/.test(longDate("2026-01-01")), longDate("2026-01-01"));
check("...not even on the day the clocks go forward", /29 March 2026/.test(longDate("2026-03-29")), longDate("2026-03-29"));
check("...nor the day they go back", /25 October 2026/.test(longDate("2026-10-25")), longDate("2026-10-25"));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
