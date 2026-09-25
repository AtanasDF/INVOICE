// Keeping HMRC's answer about a VAT number.
//
// HMRC's "Check a UK VAT number" API returns a consultation number when you
// give it your own VAT number alongside the one you are checking. That
// reference is the evidence HMRC ask for if they ever query the VAT you
// reclaimed against a supplier who turns out not to have been registered:
// it says this number was checked, on this date, and HMRC said it belonged
// to this business.
//
// The app showed it under the box and then lost it the moment the page
// changed, which made it a curiosity rather than a record. migration-038
// gave it somewhere to live; these are the rules about what gets kept.
//
// The rules are imported, not copied: src/lib/vatCheckRules.ts is the only
// place they exist, so this suite cannot drift from the app.
import { alreadyKeptToday, keptFor, sameVatNumber, vatCheckKey } from "./gen/lib/vatCheckRules.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---------------------------------------------------------------------------
// One number, however it was typed
// ---------------------------------------------------------------------------
// The evidence for a supplier must not split across two spellings of their
// number, leaving neither pile looking complete.
const SPELLINGS = ["GB123456789", "gb123456789", "123456789", "123 4567 89", "GB 123 4567 89", "GB-123-456-789"];
const keys = SPELLINGS.map(vatCheckKey);
check("every spelling of one number gives one key", new Set(keys).size === 1, JSON.stringify(keys));
check("the key is what HMRC hold: no GB, no punctuation", keys[0] === "123456789", keys[0]);
check("an XI number loses its prefix too", vatCheckKey("XI123456789") === "123456789", vatCheckKey("XI123456789"));
// A branch number is 12 digits; the extra three are part of the number.
check("a branch number keeps all twelve digits", vatCheckKey("GB123456789012") === "123456789012", vatCheckKey("GB123456789012"));
check("nothing typed gives no key", vatCheckKey("") === "" && vatCheckKey("   ") === "", "blank should not key");
check("punctuation alone gives no key", vatCheckKey("- / .") === "", vatCheckKey("- / ."));

// sameVatNumber is what stops a reference being kept against a number the
// contact no longer carries.
check("the same number typed two ways is the same number", sameVatNumber("GB 123 4567 89", "123456789"));
check("two different numbers are not", !sameVatNumber("123456789", "987654321"));
// This is the one that matters: nothing matches nothing would keep a
// reference for a supplier whose VAT box has been emptied.
check("blank never matches blank", !sameVatNumber("", ""), "two empties must not count as a match");
check("blank never matches a number", !sameVatNumber("", "123456789") && !sameVatNumber("123456789", ""));

// ---------------------------------------------------------------------------
// Only a check that proves something counts
// ---------------------------------------------------------------------------
const kept = (over) => ({ vatNumber: "123456789", consultationNumber: "ABC-123", checkedAt: "2026-09-25T10:00:00Z", ...over });

check("a check with HMRC's reference is kept", keptFor([kept()], "123456789").length === 1);
// A plain lookup says what HMRC's database held but proves nothing later,
// so showing it as evidence would overstate what the person actually has.
check("a check without a reference is not evidence", keptFor([kept({ consultationNumber: null })], "123456789").length === 0);
check("another supplier's checks are not mine", keptFor([kept({ vatNumber: "987654321" })], "123456789").length === 0);
check("checks are found by the typed spelling too", keptFor([kept()], "GB 123 4567 89").length === 1);
check("no number asked, nothing returned", keptFor([kept()], "").length === 0);
check("nothing kept, nothing returned", keptFor([], "123456789").length === 0);

// ---------------------------------------------------------------------------
// One reference a day, and the day is London's
// ---------------------------------------------------------------------------
// HMRC issue a consultation number per request, so without this rule every
// save of the same contact writes another row proving the same thing.
check("a second reference the same day is not kept",
  alreadyKeptToday([kept({ checkedAt: "2026-09-25T09:00:00Z" })], "123456789", "2026-09-25T16:00:00Z"));
check("the next day is kept",
  !alreadyKeptToday([kept({ checkedAt: "2026-09-25T09:00:00Z" })], "123456789", "2026-09-26T09:00:00Z"));
check("a different supplier the same day is kept",
  !alreadyKeptToday([kept({ vatNumber: "987654321" })], "123456789", "2026-09-25T16:00:00Z"));
// A plain lookup earlier today must not block the first real reference:
// otherwise the day a person sets their own VAT number is the one day they
// cannot get evidence.
check("an unproven check earlier today does not block a real one",
  !alreadyKeptToday([kept({ consultationNumber: null })], "123456789", "2026-09-25T16:00:00Z"));
check("nothing kept yet, so today's is kept", !alreadyKeptToday([], "123456789", "2026-09-25T10:00:00Z"));

// The whole reason this app has todayISO(): Britain is UTC+1 from late
// March to late October, so slicing an ISO string asks UTC what day it is.
// At 00:30 BST on a July night UTC still says yesterday.
//
// 2026-07-10T23:30:00Z is 00:30 on the 11th in London.
// 2026-07-11T22:00:00Z is 23:00 on the 11th in London. Same London day.
check("two moments on the same London summer day count as one day",
  alreadyKeptToday([kept({ checkedAt: "2026-07-10T23:30:00Z" })], "123456789", "2026-07-11T22:00:00Z"),
  "UTC calls these the 10th and the 11th; London calls both the 11th");
// And the reverse: 22:00Z on the 11th is the 11th in London; 23:30Z on the
// 11th is the 12th. UTC calls both the 11th, London calls them different
// days -- so a reference IS due.
check("a moment past London midnight is a new day even though UTC disagrees",
  !alreadyKeptToday([kept({ checkedAt: "2026-07-11T22:00:00Z" })], "123456789", "2026-07-11T23:30:00Z"),
  "UTC calls both the 11th; London calls the second one the 12th");
// In winter London is UTC, so the two agree.
check("in winter London and UTC agree",
  alreadyKeptToday([kept({ checkedAt: "2026-01-15T23:30:00Z" })], "123456789", "2026-01-15T01:00:00Z"));

// A timestamp nobody can parse must not be silently treated as "today" and
// swallow a real reference.
check("an unparseable date does not pass for today",
  !alreadyKeptToday([kept()], "123456789", "not a date"), "a bad timestamp must not block a keep");
check("an unparseable kept date does not match today",
  !alreadyKeptToday([kept({ checkedAt: "rubbish" })], "123456789", "2026-09-25T10:00:00Z"));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
