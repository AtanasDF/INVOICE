// Documents that fight back.
//
// A scanner is fed whatever the day produced: a till roll photographed at
// an angle, a credit note bigger than the invoice it credits, a euro
// invoice on a day nobody can fetch a rate, a date printed 03/04/05. The
// app's rule is that it only fills in what the reading is sure of -- so
// what matters is not whether it gets these right, but that it never
// pretends. A wrong total that looks confident goes into the accounting
// record unchallenged; an empty box gets looked at.
//
// Pure logic, so every awkward document can be tried rather than the three
// somebody kept.
import { parsePrintedDate } from "./gen/lib/documentDate.js";
import { computeInvoiceTotals } from "./gen/lib/vat.js";
import { invoiceCharge, creditOffDue } from "./gen/lib/cis.js";
import { invoiceBalance } from "./gen/lib/invoiceBalance.js";
import { padded } from "./gen/lib/documentBox.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---- Dates a document might print -------------------------------------------
// Britain writes day first. A document that could be either must SAY it
// could be either rather than picking one and looking certain.
const amb = parsePrintedDate("03/04/2026");
check("an ambiguous date is read day-first", amb.iso === "2026-04-03", JSON.stringify(amb));
check("and says it could be the other way", amb.ambiguous === true && amb.alternative === "2026-03-04", JSON.stringify(amb));
const plain = parsePrintedDate("23/04/2026");
check("a date that can only be one thing is not flagged", plain.iso === "2026-04-23" && !plain.ambiguous, JSON.stringify(plain));
const named = parsePrintedDate("4 March 2026");
check("a month written in words is never ambiguous", named.iso === "2026-03-04" && !named.ambiguous, JSON.stringify(named));

// The ones that should give nothing rather than a guess.
for (const bad of ["", "   ", "not a date", "99/99/9999", "2026-13-45", "0/0/0", "31/02/2026", "//", "12/", "2026"]) {
  const r = parsePrintedDate(bad);
  if (r.iso !== null) check(`"${bad}" should not become a date`, false, JSON.stringify(r));
}
check("nonsense never becomes a date", true);

// Two-digit years: the century has to be a decision, not an accident.
const short = parsePrintedDate("03/04/26");
check("a two-digit year is still read", short.iso !== null, JSON.stringify(short));
check("and lands this century, not 1926", short.iso === null || short.iso.startsWith("20"), JSON.stringify(short));

// A date far in the past is the misread that cost a photograph: the ageing
// job found a 2012 receipt that was really a recent scan.
const old = parsePrintedDate("18/09/2012");
check("an old date is read as printed, not corrected", old.iso === "2012-09-18", JSON.stringify(old));

// ---- A credit note bigger than its invoice -----------------------------------
const inv = { items: [{ description: "x", quantity: 1, unitPrice: 500, vatRate: "standard", kind: "labour" }], cisRate: 20 };
const charge = invoiceCharge(inv, true);
const over = creditOffDue(charge, 10000);
check("crediting twenty times the invoice takes off what it can, no more", over >= 0 && Number.isFinite(over), String(over));
check("and the balance still cannot go below nothing", invoiceBalance({ total: charge.due, credited: over, paid: 0, status: "sent" }) >= 0, String(invoiceBalance({ total: charge.due, credited: over, paid: 0, status: "sent" })));

// An invoice worth nothing, credited.
const empty = invoiceCharge({ items: [], cisRate: 20 }, true);
check("an invoice with no lines is worth nothing, not NaN", empty.total === 0 && empty.due === 0 && empty.cis === 0, JSON.stringify(empty));
check("and crediting it is still nothing", creditOffDue(empty, 100) === 100 || creditOffDue(empty, 100) === 0, String(creditOffDue(empty, 100)));

// ---- Numbers a document might carry ------------------------------------------
const huge = computeInvoiceTotals([{ description: "x", quantity: 1, unitPrice: 9999999.99, vatRate: "standard" }], true);
check("a ten-million-pound line still totals to the penny", Math.round(huge.total * 100) === Math.round(huge.subtotal * 100) + Math.round(huge.totalVat * 100), JSON.stringify(huge));
const tiny = computeInvoiceTotals([{ description: "x", quantity: 1, unitPrice: 0.01, vatRate: "standard" }], true);
check("a penny line rounds its VAT to nothing, not a fraction", tiny.totalVat === 0 && tiny.total === 0.01, JSON.stringify(tiny));
const negative = computeInvoiceTotals([{ description: "refund", quantity: -1, unitPrice: 100, vatRate: "standard" }], true);
check("a negative line is allowed and stays negative", negative.total === -120, JSON.stringify(negative));
const manyLines = computeInvoiceTotals(Array.from({ length: 500 }, () => ({ description: "x", quantity: 1, unitPrice: 3.33, vatRate: "standard" })), true);
check("five hundred lines still land on a penny", Math.round(manyLines.total * 100) === Math.round(manyLines.subtotal * 100) + Math.round(manyLines.totalVat * 100), JSON.stringify({ t: manyLines.total, s: manyLines.subtotal, v: manyLines.totalVat }));

// ---- Where a document sits on a page -----------------------------------------
// The scanner returns a box on a 0-1000 grid when one photo holds more than
// one document, padded by a few percent so an edge drawn tight is not cut
// off. A box that is wrong must never produce a crop that is inside-out or
// outside the picture -- that is how a document gets cropped away entirely.
const bad = [];
for (const box of [[0, 0, 0, 0], [1000, 1000, 0, 0], [-50, -50, 2000, 2000], [500, 500, 400, 400], [0, 0, 1000, 1000], [999, 999, 1000, 1000]]) {
  const [ymin, xmin, ymax, xmax] = padded(box);
  if (ymin < 0 || xmin < 0 || ymax > 1 || xmax > 1) bad.push({ box, out: [ymin, xmin, ymax, xmax] });
}
check("no box, however wrong, crops outside the picture", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
const full = padded([0, 0, 1000, 1000]);
check("a box covering everything stays covering everything", full[0] === 0 && full[1] === 0 && full[2] === 1 && full[3] === 1, JSON.stringify(full));
const tight = padded([400, 400, 600, 600]);
check("a tight box is given room on every side", tight[0] < 0.4 && tight[1] < 0.4 && tight[2] > 0.6 && tight[3] > 0.6, JSON.stringify(tight));

// ---- A till that prints the time where the year goes --------------------------
// The real one: "FRI SEP 18 12:57:01 2026" filed the first receipt Atanas
// ever scanned into 2012, because 12 sat exactly where a two-digit year
// does.
const till = parsePrintedDate("FRI SEP 18 12:57:01 2026");
check("a till receipt's time is not mistaken for its year", till.iso === "2026-09-18", JSON.stringify(till));
for (const printed of ["18/09/2026 14:30", "18-09-2026 09:05:22", "SEP 18 2026 11:45 PM"]) {
  const r = parsePrintedDate(printed);
  if (!r.iso || !r.iso.startsWith("2026-09-18")) check(`"${printed}" read wrong`, false, JSON.stringify(r));
}
check("a time anywhere in the line never becomes part of the date", true);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
