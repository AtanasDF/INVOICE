// Letting old photographs go (notes/ageing-photos-design.md) -- the one place
// in this project where something is removed, so it is the one place that has
// to be argued with hardest.
//
// The rules are recompiled from src/lib/photoAgeing.ts every run, so what is
// checked here is what the nightly job actually does, not a copy of it. The
// route's own two locks (PHOTO_AGEING, PHOTO_AGEING_DELETE) and the rule that
// nothing goes before an email is accepted are checked in test-route-guards
// and read from the route.
import { sortOut, forOwner, cutoffFor, emailBody, emailSubject, agedAlready } from "./gen/lib/photoAgeing.js";
import { readFileSync } from "node:fs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const row = (o) => ({ id: o.id, user_id: o.user ?? "u1", date: o.date, image_data_url: o.photo === undefined ? "storage:u1/a/1.jpg" : o.photo, details: o.details ?? null, needs_review: o.review ?? false });

// --- how old is old enough ---
check("92 days back from a date is worked out on the date, not the clock", cutoffFor("2026-09-23", 92) === "2026-06-23", cutoffFor("2026-09-23", 92));
check("...and it crosses a year end without drama", cutoffFor("2026-01-10", 92) === "2025-10-10", cutoffFor("2026-01-10", 92));

// --- what may go, and what may not ---
const CUT = "2026-06-23";
const rows = [
  row({ id: "old", date: "2026-01-05" }),
  row({ id: "older", date: "2025-11-30" }),
  row({ id: "recent", date: "2026-09-01" }),
  row({ id: "on-the-day", date: CUT }),
  row({ id: "no-photo", date: "2026-01-05", photo: null }),
  row({ id: "done", date: "2026-01-05", details: { photoAgedAt: "2026-05-01" } }),
  row({ id: "unchecked", date: "2026-01-05", review: true }),
  row({ id: "no-date", date: "" }),
];
const { candidates, skipped } = sortOut(rows, CUT);
const ids = candidates.map((r) => r.id);
const why = (id) => (skipped.find((s) => s.id === id) ?? {}).reason;

check("an old photograph may go", ids.includes("old"));
check("a recent one is kept", !ids.includes("recent") && /not old enough/.test(why("recent")), why("recent"));
check("one exactly on the cutoff is kept -- the boundary favours keeping", !ids.includes("on-the-day") && /not old enough/.test(why("on-the-day")), why("on-the-day"));
check("a receipt with no photograph is nothing to do", !ids.includes("no-photo") && /no photograph/.test(why("no-photo")), why("no-photo"));
check("one already emailed and cleared is not done twice", !ids.includes("done") && /already emailed/.test(why("done")), why("done"));
check("a receipt still waiting to be checked is left alone", !ids.includes("unchecked") && /waiting to be checked/.test(why("unchecked")), why("unchecked"));
check("a receipt with no date at all is kept, not guessed at", !ids.includes("no-date") && /not old enough/.test(why("no-date")), why("no-date"));
check("every row is either a candidate or has a reason it was kept", candidates.length + skipped.length === rows.length, `${candidates.length}+${skipped.length}`);
check("nothing is a candidate without a photograph", candidates.every((r) => !!r.image_data_url));
check("nothing is a candidate that was already done", !candidates.some(agedAlready));

// --- oldest first, so a half-finished run does the least harm ---
check("the oldest goes first", ids[0] === "older" && ids[1] === "old", JSON.stringify(ids));
const shuffled = sortOut([row({ id: "b", date: "2026-02-02" }), row({ id: "a", date: "2026-01-01" }), row({ id: "c", date: "2026-03-03" })], CUT).candidates.map((r) => r.id);
check("...whatever order they came back in", JSON.stringify(shuffled) === '["a","b","c"]', JSON.stringify(shuffled));
const sameDay = sortOut([row({ id: "z", date: "2026-01-01" }), row({ id: "a", date: "2026-01-01" })], CUT).candidates.map((r) => r.id);
check("two on the same day come out in a settled order, so two runs agree", JSON.stringify(sameDay) === '["a","z"]', JSON.stringify(sameDay));

// --- whose they are ---
const mixed = sortOut([row({ id: "m1", user: "mine", date: "2026-01-01" }), row({ id: "y1", user: "yours", date: "2026-01-02" })], CUT).candidates;
check("one person's run never touches another person's photographs", forOwner(mixed, "mine", new Set(), 50).every((r) => r.user_id === "mine"));
check("anyone paying keeps every one of theirs", forOwner(mixed, "mine", new Set(["mine"]), 50).length === 0);
check("...and paying does not protect somebody else", forOwner(mixed, "yours", new Set(["mine"]), 50).length === 1);

const many = sortOut(Array.from({ length: 500 }, (_, i) => row({ id: `r${i}`, date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` })), CUT).candidates;
check("a run takes a bite, not a year at once", forOwner(many, "u1", new Set(), 200).length === 200);
check("...the oldest bite", forOwner(many, "u1", new Set(), 200)[0].date === "2026-01-01");

// --- what the person is told ---
const body = emailBody(12, "2025-11-30", "2026-01-05");
check("the email says how many and from when", /12 receipt photographs/.test(body) && /2025-11-30 to 2026-01-05/.test(body), body);
check("it says to keep it, because it is the only copy", /Keep this email/.test(body), body);
check("it says the record itself is untouched", /still in your records/.test(body) && /the supplier, the date, the amount and the VAT/.test(body), body);
check("it says the VAT return is unaffected -- the first thing anyone would fear", /VAT return (is|are) unaffected/.test(body), body);
check("it names the one thing that has gone", /Only the photograph has gone/.test(body), body);
check("it does not say deleted, removed or lost", !/\b(deleted|removed|lost|purged|expired)\b/i.test(body), body);
check("it blames nobody and demands nothing", !/\b(you must|you failed|exceeded|upgrade now)\b/i.test(body), body);
check("one photograph reads as English, not as a template", /Here is 1 receipt photograph,/.test(emailBody(1, "2026-01-01", "2026-01-01")), emailBody(1, "2026-01-01", "2026-01-01"));
check("the subject says what it is without alarming anyone", /^Your receipt photographs from /.test(emailSubject("a", "b")) && !/delet|remov|warning|action required/i.test(emailSubject("a", "b")), emailSubject("a", "b"));

// --- the two locks, read from the route itself ---
const route = readFileSync("../web/src/app/api/photos/age/route.ts", "utf8");
check("the job does nothing at all unless PHOTO_AGEING is on", /PHOTO_AGEING === "on"/.test(route) && /if \(!ON\)/.test(route));
check("a second switch guards the removal itself", /PHOTO_AGEING_DELETE === "on"/.test(route) && /if \(!DELETING\)/.test(route));
check("with no email key it removes nothing rather than pressing on", /if \(!resendApiKey\) return NextResponse\.json\(\{ skipped/.test(route));
check("a failed send keeps the photographs", /send failed[^\n]*photographs kept/.test(route));
check("the removal happens only after a successful send", route.indexOf("if (!res || !res.ok)") < route.indexOf("storage.from(\"receipts\").remove"));
check("a photograph that could not even be read is not removed on a guess", /cannot be fetched is left exactly where it is/.test(route));
check("it is a cron route, not something a stranger can set off", /CRON_SECRET/.test(route) && /401/.test(route));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
