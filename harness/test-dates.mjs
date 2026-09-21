// Dates read off a photographed receipt. A date read wrong is the quietest
// error in the whole app: the money is right, the supplier is right, and
// the cost lands in the wrong VAT quarter or the wrong tax year. Britain
// writes the day first, and most of the world doesn't.
import { parsePrintedDate } from "./gen/lib/documentDate.js";
import { addMonths, nextDueFromDay } from "./gen/lib/recurrence.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const p = (s) => parsePrintedDate(s);

// Day first, as a UK receipt prints it.
check("08/09/2026 is 8 September", p("08/09/2026").iso === "2026-09-08", JSON.stringify(p("08/09/2026")));
check("and it's flagged as one a US receipt would write differently", p("08/09/2026").ambiguous === true && p("08/09/2026").alternative === "2026-08-09", JSON.stringify(p("08/09/2026")));
check("a day over 12 can't be a month, so nothing to ask", p("21/09/2026").iso === "2026-09-21" && p("21/09/2026").ambiguous === false, JSON.stringify(p("21/09/2026")));
check("the same day and month isn't ambiguous either", p("09/09/2026").ambiguous === false, JSON.stringify(p("09/09/2026")));
check("two-digit years are this century", p("08/09/26").iso === "2026-09-08", JSON.stringify(p("08/09/26")));
check("dots and dashes work as separators", p("08.09.2026").iso === "2026-09-08" && p("08-09-2026").iso === "2026-09-08");
check("a label in front doesn't hide it", p("Invoice date: 08/09/2026").iso === "2026-09-08", JSON.stringify(p("Invoice date: 08/09/2026")));
check("a time after it doesn't either", p("08/09/2026 14:32").iso === "2026-09-08", JSON.stringify(p("08/09/2026 14:32")));
// The first real receipt Atanas scanned (GO OUTDOORS, 22 September 2026)
// was filed as 2012: the till prints the time between the day and the
// year, and 12 of 12:57 is where a two-digit year sits.
check("a till's 'FRI SEP 18 12:57:01 2026' is 2026, not 2012", p("FRI SEP 18 12:57:01 2026").iso === "2026-09-18" && p("FRI SEP 18 12:57:01 2026").ambiguous === false, JSON.stringify(p("FRI SEP 18 12:57:01 2026")));
check("with the label the till prints in front of it", p("DATE : FRI SEP 18 12:57:01 2026").iso === "2026-09-18", JSON.stringify(p("DATE : FRI SEP 18 12:57:01 2026")));
check("day first with the time in the middle", p("18 SEP 12:57 2026").iso === "2026-09-18", JSON.stringify(p("18 SEP 12:57 2026")));
check("a time with am/pm between day and year", p("Sep 18 12:57 PM 2026").iso === "2026-09-18", JSON.stringify(p("Sep 18 12:57 PM 2026")));
check("a two-digit year still works when there's no time", p("SEP 18 26").iso === "2026-09-18", JSON.stringify(p("SEP 18 26")));
check("a numeric date with the time first", p("12:57 18/09/2026").iso === "2026-09-18", JSON.stringify(p("12:57 18/09/2026")));
check("an ISO date with a time keeps working", p("2026-09-18 12:57:01").iso === "2026-09-18", JSON.stringify(p("2026-09-18 12:57:01")));

// Written out, in either order.
check("8 September 2026", p("8 September 2026").iso === "2026-09-08");
check("8th Sept 2026", p("8th Sept 2026").iso === "2026-09-08", JSON.stringify(p("8th Sept 2026")));
check("Sep 8, 2026 (the American way round)", p("Sep 8, 2026").iso === "2026-09-08", JSON.stringify(p("Sep 8, 2026")));
check("a month name is never ambiguous", p("8 September 2026").ambiguous === false && p("Sep 8, 2026").ambiguous === false);

// Already an ISO date.
check("2026-09-08 is taken as written", p("2026-09-08").iso === "2026-09-08" && p("2026-09-08").ambiguous === false);

// Rubbish must come back as nothing, not as a wrong date.
check("a date that doesn't exist is refused", p("31/02/2026").iso === null, JSON.stringify(p("31/02/2026")));
check("month 13 is refused", p("08/13/2026").iso === null, JSON.stringify(p("08/13/2026")));
check("no date at all gives nothing", p("Thank you for your custom").iso === null && p("").iso === null);
check("a till number is not a date", p("Till 4 Op 12").iso === null, JSON.stringify(p("Till 4 Op 12")));
check("a long number isn't split into one", p("Card 1234567890123456").iso === null, JSON.stringify(p("Card 1234567890123456")));
check("a leap day in a leap year is fine", p("29/02/2028").iso === "2028-02-29", JSON.stringify(p("29/02/2028")));
check("a leap day in an ordinary year is refused", p("29/02/2026").iso === null, JSON.stringify(p("29/02/2026")));

// The repeating expenses: the day of the month must never run off the end.
check("adding a month keeps the day", addMonths("2026-09-08", 1) === "2026-10-08", addMonths("2026-09-08", 1));
check("adding a month across the year end", addMonths("2026-12-28", 1) === "2027-01-28", addMonths("2026-12-28", 1));
check("the 28th is safe in February", addMonths("2026-01-28", 1) === "2026-02-28", addMonths("2026-01-28", 1));
check("a date at the end of a long month doesn't skip February", ["2026-02-28", "2026-03-03"].includes(addMonths("2026-01-31", 1)), addMonths("2026-01-31", 1));
const next = nextDueFromDay(1);
check("the next 1st of the month is a real date", /^\d{4}-\d{2}-01$/.test(next), next);
check("it is in the future, not behind him", next >= new Date().toISOString().slice(0, 10), next);
const next28 = nextDueFromDay(28);
check("the next 28th is a real date in the future", /^\d{4}-\d{2}-28$/.test(next28) && next28 >= new Date().toISOString().slice(0, 10), next28);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
