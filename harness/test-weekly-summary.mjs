// One push on a Monday: what came in last week, what is overdue, what is
// due this week, whose quote is waiting. Short enough to read on the way to
// a job, which is the whole specification -- a notification nobody finishes
// reading is one nobody reads.
import { weeklySummary, lastWeek } from "./gen/lib/weeklySummary.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const J = (x) => JSON.stringify(x);
const NONE = { paidIn: 0, paidCount: 0, overdueCount: 0, overdueTotal: 0, dueThisWeek: 0, dueThisWeekTotal: 0, billsDue: 0, quotesWaiting: 0 };

check("the week just gone is Monday to Sunday", J(lastWeek("2026-09-28")) === J({ from: "2026-09-21", to: "2026-09-27" }), J(lastWeek("2026-09-28")));

let s = weeklySummary({ ...NONE, paidIn: 1239.67, paidCount: 3 });
check("money that came in is said in whole pounds", /£1,240 came in last week/.test(s.body), J(s));
check("it is not a ledger: no pennies", !/\.\d\d/.test(s.body), J(s));

s = weeklySummary({ ...NONE, overdueCount: 2, overdueTotal: 3400, dueThisWeek: 1, dueThisWeekTotal: 900, billsDue: 3, quotesWaiting: 1 });
check("everything that matters fits one line", /£3,400 overdue/.test(s.body) && /£900 due this week/.test(s.body) && /3 bills to pay/.test(s.body) && /1 quote waiting on an answer/.test(s.body), J(s));
check("and it stays short enough to read on a phone", s.body.length < 120, `${s.body.length} characters: ${s.body}`);
check("one of a thing is singular", /1 quote waiting/.test(s.body) && !/1 quotes/.test(s.body), J(s));

s = weeklySummary({ ...NONE, billsDue: 1 });
check("one bill is a bill, not bills", /1 bill to pay/.test(s.body), J(s));

check("a quiet week sends nothing at all: a push saying nothing happened is one nobody wants on a Monday",
  weeklySummary(NONE) === null, J(weeklySummary(NONE)));

// Money that came in but nothing owed either way is still worth saying.
s = weeklySummary({ ...NONE, paidIn: 500, paidCount: 1 });
check("but money coming in is always worth saying", s !== null && /£500 came in/.test(s.body), J(s));

check("it is titled as a week, not as an alert", weeklySummary({ ...NONE, paidIn: 1, paidCount: 1 }).title === "Your week");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
