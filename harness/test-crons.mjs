// The scheduled jobs, and whether each one is actually scheduled. A cron
// that is written but never listed does nothing for ever and says nothing
// about it; one listed at a path that no longer exists 404s at 7am every
// day into a log nobody reads. Neither fails a test suite anywhere else,
// because neither is a bug in any file -- it is a disagreement between two.
import fs from "fs";
import path from "path";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const WEB = "/Users/nasko/Desktop/INVOICE/web";
const API = path.join(WEB, "src/app/api");

const crons = JSON.parse(fs.readFileSync(path.join(WEB, "vercel.json"), "utf8")).crons ?? [];

// Every route file that guards itself with CRON_SECRET is a job that has to
// be on the schedule, or it never runs at all.
const wantsCron = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (entry.name !== "route.ts") continue;
    const text = fs.readFileSync(full, "utf8");
    if (!/CRON_SECRET/.test(text)) continue;
    wantsCron.push("/" + path.relative(path.join(WEB, "src/app"), path.dirname(full)).replace(/\\/g, "/"));
  }
})(API);

check("there is at least one scheduled job, so this suite is looking at something", crons.length > 0 && wantsCron.length > 0, JSON.stringify({ crons: crons.length, routes: wantsCron.length }));

// Left off the schedule on purpose, with the reason. A job that is written
// and not scheduled does nothing for ever and says nothing about it, so the
// only safe way to have one is to write down that it is meant to be that
// way.
const DELIBERATELY_OFF = {
  "/api/photos/age":
    "the only thing in this project that removes anything. Built, tested and NOT armed: it needs PHOTO_AGEING=on to report what it would do, and PHOTO_AGEING_DELETE=on before a single file can go. Scheduling it would arm the first of those by the back door.",
};

const scheduled = new Set(crons.map((c) => c.path));
const unscheduled = wantsCron.filter((p) => !scheduled.has(p) && !DELIBERATELY_OFF[p]);
check("every job that expects the cron secret is on the schedule, or says why not", unscheduled.length === 0, JSON.stringify(unscheduled));

// And the other way: one that IS scheduled while listed as deliberately off
// is the mistake this list exists to catch.
const armed = Object.keys(DELIBERATELY_OFF).filter((p) => scheduled.has(p));
check("nothing on the do-not-schedule list has quietly been scheduled", armed.length === 0, JSON.stringify(armed));
check("every exception still exists as a route", Object.keys(DELIBERATELY_OFF).every((p) => wantsCron.includes(p)), JSON.stringify(Object.keys(DELIBERATELY_OFF).filter((p) => !wantsCron.includes(p))));

const missing = crons.filter((c) => !fs.existsSync(path.join(WEB, "src/app", c.path, "route.ts")));
check("every scheduled path is a route that exists", missing.length === 0, JSON.stringify(missing.map((c) => c.path)));

// A schedule is five fields; a typo here is not caught by anything else,
// and Vercel accepts the file either way.
const badSchedule = crons.filter((c) => (c.schedule ?? "").trim().split(/\s+/).length !== 5);
check("every schedule is a five-field cron expression", badSchedule.length === 0, JSON.stringify(badSchedule));

// The weekly summary is a summary of the week just gone, so it only means
// anything on the day the week turns over.
const weekly = crons.find((c) => c.path === "/api/notifications/weekly");
check("the Monday summary is scheduled on a Monday", !!weekly && weekly.schedule.trim().split(/\s+/)[4] === "1", JSON.stringify(weekly));
check("...and the route checks the day itself rather than trusting the schedule",
  /getUTCDay\(\)\s*===\s*1/.test(fs.readFileSync(path.join(WEB, "src/app/api/notifications/weekly/route.ts"), "utf8")),
  "nothing in the route checks what day it is");

// Two jobs at the same minute on the same day would both wake the same
// database at once for no reason.
const clashes = Object.entries(
  crons.reduce((acc, c) => { acc[c.schedule] = [...(acc[c.schedule] ?? []), c.path]; return acc; }, {})
).filter(([, paths]) => paths.length > 1);
check("no two jobs are set to the same minute", clashes.length === 0, JSON.stringify(clashes));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
