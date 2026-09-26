// Letting old photographs go (notes/ageing-photos-design.md) -- the one place
// in this project where something is removed, so it is the one place that has
// to be argued with hardest.
//
// The rules are recompiled from src/lib/photoAgeing.ts every run, so what is
// checked here is what the nightly job actually does, not a copy of it. The
// route's own two locks (PHOTO_AGEING, PHOTO_AGEING_DELETE) and the rule that
// nothing goes before an email is accepted are checked in test-route-guards
// and read from the route.
import { sortOut, forOwner, cutoffFor, emailBody, emailSubject, agedAlready, canEmail, EMAILABLE_TYPES } from "./gen/lib/photoAgeing.js";
import { readFileSync } from "node:fs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// `added` defaults to long ago, so a test that says nothing about it is asking
// about the printed date alone.
const row = (o) => ({ id: o.id, user_id: o.user ?? "u1", date: o.date, created_at: o.added === undefined ? "2020-01-01T09:00:00Z" : o.added, image_data_url: o.photo === undefined ? "storage:u1/a/1.jpg" : o.photo, details: o.details ?? null, needs_review: o.review ?? false });

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

// --- two dates, both old (found by the first dry run against the real rows,
// where the only thing old enough to go was a receipt a scan had dated 2012) ---
const misread = sortOut([row({ id: "misread", date: "2012-09-18", added: "2026-09-22T10:00:00Z" })], CUT);
check("a receipt the scanner dated 2012 but which arrived last week is kept", misread.candidates.length === 0 && /added recently/.test(misread.skipped[0].reason), JSON.stringify(misread.skipped));
const catchup = sortOut([row({ id: "catchup", date: "2025-04-01", added: "2026-09-01T10:00:00Z" })], CUT);
check("a year of old paperwork uploaded in one evening is kept too", catchup.candidates.length === 0, JSON.stringify(catchup.skipped));
const bothOld = sortOut([row({ id: "both", date: "2026-01-05", added: "2026-01-06T10:00:00Z" })], CUT);
check("old on the document and old on the account: that one may go", bothOld.candidates.length === 1);
const noAdded = sortOut([row({ id: "unknown", date: "2026-01-05", added: null })], CUT);
check("no record of when it arrived means it is kept, not assumed old", noAdded.candidates.length === 0 && /no record of when it was added/.test(noAdded.skipped[0].reason), JSON.stringify(noAdded.skipped));

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

// --- when it arrived, in London ---
//
// created_at is a timestamptz, and slicing it took the UTC date: a receipt
// added at 00:30 on a summer night read as having arrived YESTERDAY, a day
// older than it is, which could let its photograph go a day early.
{
  // 00:30 BST on 1 July is 23:30 UTC on 30 June. Cut off at the 30th: added
  // on the 1st, so it must be KEPT.
  const justAfterMidnight = row({ id: "x", date: "2020-01-01", added: "2026-06-30T23:30:00Z" });
  const out = sortOut([justAfterMidnight], "2026-06-30");
  check("a receipt added just after midnight BST counts as arriving that day, not the day before", out.candidates.length === 0 && /added/.test(out.skipped[0]?.reason ?? ""), JSON.stringify(out));
  // 23:30 BST on the 30th is the 30th in London and 22:30 UTC, so it is still
  // ON the cutoff -- and the boundary favours keeping, exactly as it does for
  // the printed date.
  const onTheDay = sortOut([row({ id: "y", date: "2020-01-01", added: "2026-06-30T22:30:00Z" })], "2026-06-30");
  check("...one added late on the cutoff day itself is kept, as the boundary always does", onTheDay.candidates.length === 0, JSON.stringify(onTheDay));
  // A day earlier in London really is past it.
  const before = sortOut([row({ id: "z", date: "2020-01-01", added: "2026-06-29T22:30:00Z" })], "2026-06-30");
  check("...and one added the evening before that may go", before.candidates.length === 1, JSON.stringify(before));
}

// --- the two locks, read from the route itself ---
const route = readFileSync("../web/src/app/api/photos/age/route.ts", "utf8");
check("the job does nothing at all unless PHOTO_AGEING is on", /PHOTO_AGEING === "on"/.test(route) && /if \(!ON\)/.test(route));
check("a second switch guards the removal itself", /PHOTO_AGEING_DELETE === "on"/.test(route) && /if \(!DELETING\)/.test(route));
check("with no email key it removes nothing rather than pressing on", /if \(!resendApiKey\) return NextResponse\.json\(\{ skipped/.test(route));
check("a failed send keeps the photographs", /send failed[^\n]*photographs kept/.test(route));
check("the removal happens only after a successful send", route.indexOf("if (!res || !res.ok)") < route.indexOf("storage.from(\"receipts\").remove"));
check("a photograph that could not even be read is not removed on a guess", /cannot be fetched, or cannot go into the PDF at[\s\S]{0,24}all, is left exactly where it is/.test(route));
check("...and the route asks canEmail before it counts one in", /if \(page && canEmail\(page\.mediaType\)\)/.test(route));

// --- what can go in the PDF at all ---
//
// pdf-lib embeds PNG and JPEG and nothing else, and a webp or gif reached it
// and threw "SOI not found in JPEG" out of the middle of the run. Nothing
// caught it: the handler answered 500, that owner was abandoned and so was
// every owner after them, every day, because nothing about the row changes.
// It killed the DRY RUN too -- the report that has to be read and agreed
// before deletion is ever switched on. Reachable through the email import,
// which accepts both types.
check("a jpeg and a png can be emailed", canEmail("image/jpeg") && canEmail("image/png"));
check("a PDF can be emailed, since its pages are copied rather than embedded", canEmail("application/pdf"));
check("a webp is NOT emailed, so its photograph stays", !canEmail("image/webp"));
check("nor is a gif", !canEmail("image/gif"));
check("nor anything the reader never accepted in the first place", !canEmail("image/heic") && !canEmail("text/html") && !canEmail(""));
check("a content type with parameters on it is still recognised", canEmail("image/jpeg; charset=binary") && canEmail("IMAGE/PNG"));
// The list is the rule, so it must not quietly grow to something pdf-lib
// cannot take.
check("the emailable list is exactly what can be put in a PDF", JSON.stringify([...EMAILABLE_TYPES].sort()) === JSON.stringify(["application/pdf", "image/jpeg", "image/png"]), JSON.stringify(EMAILABLE_TYPES));
const pdfLib = readFileSync("../web/src/lib/documentPdf.ts", "utf8");
check("...and documentPdf still only knows those three ways to add a page", /embedPng/.test(pdfLib) && /embedJpg/.test(pdfLib) && /PDFDocument\.load/.test(pdfLib) && !/embedWebp|embedGif/.test(pdfLib));

// --- the row before the file ---
//
// The other way round, a failed row update left the receipt pointing at a file
// that was already gone: a dead image and no "Emailed to you", which reads as
// a lost receipt -- the exact thing this job exists to avoid. This way the
// worst case is a file nobody references, which is counted and reported.
check("the row is cleared before the file is removed", route.indexOf("image_data_url: null, details") < route.indexOf('storage.from("receipts").remove'));
check("...a failed row update removes nothing", /if \(upError\) continue;/.test(route));
check("...and a file left behind is counted, not guessed at", /filesLeft/.test(route) && /filesLeft \+= 1/.test(route));
check("it is a cron route, not something a stranger can set off", /CRON_SECRET/.test(route) && /401/.test(route));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
