// Readings that parse cleanly and are still wrong.
//
// Both rules here come from Atanas's REAL records, read on 2026-09-26 after he
// opened the account for testing — not from anything a suite noticed:
//
//   GO OUTDOORS, £29.00, dated 2012-09-18, added 2026-09-22.
//   Rawlings & Son, £0.00 incl. £0.00 VAT, beside a real £8.50 from the same
//   supplier on the same day.
//
// The first is a misread year. It parses perfectly, so the existing guard --
// which only questions an AMBIGUOUS date like 08/09/26 -- never asked. A
// receipt dated fourteen years ago falls outside every VAT quarter and every
// tax year, so that £29 is gone from his books while looking perfectly fine.
import { misreadYear, noTotalRead } from "./gen/lib/scanSanity.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const TODAY = "2026-09-26";

// ---------------------------------------------------------------------------
// The one that actually happened
// ---------------------------------------------------------------------------
check("the real GO OUTDOORS receipt is questioned",
  misreadYear("2012-09-18", TODAY) === "2026-09-18", String(misreadYear("2012-09-18", TODAY)));
check("...and the date it suggests is the one it almost certainly was",
  misreadYear("2012-09-18", TODAY) === "2026-09-18");

// ---------------------------------------------------------------------------
// And the ordinary cases it must leave alone
// ---------------------------------------------------------------------------
check("today is fine", misreadYear(TODAY, TODAY) === null);
check("last week is fine", misreadYear("2026-09-19", TODAY) === null);
check("last year is fine — catching up on paperwork is normal", misreadYear("2025-11-02", TODAY) === null);
check("eighteen months back is still fine", misreadYear("2025-03-26", TODAY) === null);
// Generous on purpose: nagging somebody scanning a year of old receipts would
// make the confirmation worthless, because it would always be there.
check("just inside two years is left alone", misreadYear("2024-10-01", TODAY) === null);
check("three years back is questioned", misreadYear("2023-05-04", TODAY) === "2026-05-04", String(misreadYear("2023-05-04", TODAY)));

// A future date cannot be right on a document being scanned.
check("a future date is questioned", misreadYear("2027-01-05", TODAY) === "2026-01-05", String(misreadYear("2027-01-05", TODAY)));
// And the suggestion must never itself be in the future.
const suggestion = misreadYear("2015-12-30", TODAY);
check("the suggested date is never in the future", suggestion !== null && suggestion <= TODAY, String(suggestion));
check("...and for a December document that means last year", suggestion === "2025-12-30", String(suggestion));

// Rubbish in, nothing out: never invent a correction for something unparseable.
for (const bad of ["", "not-a-date", "2026-13-45", "26/09/2026"]) {
  check(`"${bad}" is not second-guessed`, misreadYear(bad, TODAY) === null, String(misreadYear(bad, TODAY)));
}
check("an unreadable today is not second-guessed", misreadYear("2012-09-18", "rubbish") === null);

// ---------------------------------------------------------------------------
// A document that cost nothing
// ---------------------------------------------------------------------------
check("the real £0.00 Rawlings row would be flagged", noTotalRead(0, 0));
check("a penny is a total", !noTotalRead(0.01, 0));
check("VAT alone is a total", !noTotalRead(0, 1.70));
check("a real receipt is not flagged", !noTotalRead(8.5, 1.7));
// A credit note is stored negative, and is certainly not "nothing read".
check("a credit note is not flagged", !noTotalRead(-29, -5.8));
// Floating point: 0.001 is not money.
check("a rounding crumb still counts as nothing", noTotalRead(0.001, 0));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
