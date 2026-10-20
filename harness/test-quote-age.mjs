// How long a quote has been with the customer, for the "Waiting on an answer"
// nudge. It used to count from the quote's own date and say "sent", which is
// the day it was drafted as often as the day it went: drafted on the 1st and
// emailed on the 15th, it was nagged about on the 6th, before the customer
// had it. migration-042 keeps the real send; these are the rules for using it,
// imported from the app (src/lib/quoteChase.ts), not copied.
import { QUIET_DAYS, isQuietQuote, quoteAge, quoteAgeText } from "./gen/lib/quoteChase.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const T = "2026-10-20";
const q = (o) => ({ status: "sent", date: "2026-10-01", sentAt: null, validUntil: null, ...o });

check("the nudge waits five days", QUIET_DAYS === 5, String(QUIET_DAYS));

// ---- The real send wins ----------------------------------------------------
const late = q({ date: "2026-10-01", sentAt: "2026-10-18T10:00:00Z" });
check("a send time is counted from, not the quote's date", JSON.stringify(quoteAge(late, T)) === JSON.stringify({ days: 2, since: "sent" }), JSON.stringify(quoteAge(late, T)));
check("drafted 19 days ago but sent two days ago is not nagged about", !isQuietQuote(late, T));
check("...and says sent", quoteAgeText(late, T) === "sent 2 days ago", quoteAgeText(late, T));
const old = q({ date: "2026-10-12", sentAt: "2026-10-14T08:00:00Z" });
check("sent six days ago is raised", isQuietQuote(old, T) && quoteAgeText(old, T) === "sent 6 days ago", quoteAgeText(old, T));
check("exactly five days is raised", isQuietQuote(q({ sentAt: "2026-10-15T12:00:00Z" }), T));
check("four days is not", !isQuietQuote(q({ sentAt: "2026-10-16T12:00:00Z" }), T));

// ---- Without one, it says "dated" -----------------------------------------
const legacy = q({ date: "2026-10-11" });
check("no send time: counted from the quote's date", JSON.stringify(quoteAge(legacy, T)) === JSON.stringify({ days: 9, since: "dated" }), JSON.stringify(quoteAge(legacy, T)));
check("...and never claims a send", quoteAgeText(legacy, T) === "dated 9 days ago", quoteAgeText(legacy, T));
check("...and is still raised once quiet", isQuietQuote(legacy, T));
check("an unreadable send time is treated as none", quoteAgeText(q({ date: "2026-10-11", sentAt: "not a date" }), T) === "dated 9 days ago", quoteAgeText(q({ date: "2026-10-11", sentAt: "not a date" }), T));
check("one day is singular", quoteAgeText(q({ sentAt: "2026-10-19T12:00:00Z" }), T) === "sent 1 day ago", quoteAgeText(q({ sentAt: "2026-10-19T12:00:00Z" }), T));

// ---- The London day ----------------------------------------------------------
// 23:30 UTC on 14 October is 00:30 on the 15th in London. Read as UTC it is a
// day older than it is, and a quote sent four days ago is nagged about.
const midnight = q({ sentAt: "2026-10-14T23:30:00Z" });
check("a send at 00:30 BST counts from the London day", quoteAge(midnight, "2026-10-19").days === 4, JSON.stringify(quoteAge(midnight, "2026-10-19")));
check("...so it is not raised a day early", !isQuietQuote(midnight, "2026-10-19"));

// ---- Only open, still-good quotes -------------------------------------------
for (const status of ["draft", "accepted", "declined", "invoiced"]) {
  check(`${status} is left alone however old`, !isQuietQuote(q({ status, sentAt: "2026-09-01T09:00:00Z" }), T));
}
check("an expired quote is left alone", !isQuietQuote(q({ sentAt: "2026-10-01T09:00:00Z", validUntil: "2026-10-19" }), T));
check("one that holds until today is still raised", isQuietQuote(q({ sentAt: "2026-10-01T09:00:00Z", validUntil: T }), T));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
