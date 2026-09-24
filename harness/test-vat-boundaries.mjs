// Where one VAT quarter ends and the next begins -- on both bases, and in
// London time rather than UTC. A sale that lands in the wrong quarter is
// declared in the wrong return, and the app's whole reason for asking
// Europe/London what day it is was a sale on the first of a quarter falling
// into the previous one for the hour after midnight every summer night.
//
// Straight off the app's own source. No browser: these are the rules, not
// the screen.
import { previousQuarter, quarterLabel, quarterOf, vatFigures } from "./gen/lib/vatReturn.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const near = (a, b) => Math.abs(a - b) < 0.005;
const J = (x) => JSON.stringify(x);

// ── Which quarter a date is in ────────────────────────────────────────
const QUARTERS = [
  [["2026-01-01", "2026-02-14", "2026-03-31"], { from: "2026-01-01", to: "2026-03-31" }],
  [["2026-04-01", "2026-05-20", "2026-06-30"], { from: "2026-04-01", to: "2026-06-30" }],
  [["2026-07-01", "2026-08-09", "2026-09-30"], { from: "2026-07-01", to: "2026-09-30" }],
  [["2026-10-01", "2026-11-30", "2026-12-31"], { from: "2026-10-01", to: "2026-12-31" }],
];
for (const [dates, want] of QUARTERS) {
  const all = dates.map((d) => quarterOf(d));
  check(`${want.from} to ${want.to}: every day in it answers the same quarter`,
    all.every((q) => q.from === want.from && q.to === want.to), J({ dates, all }));
}
// Two quarters end on the 30th and two on the 31st; a quarter that ran to
// the 31st of June would put a whole day's takings in the wrong return.
check("quarter ends are the real last day of the month, 30 or 31",
  quarterOf("2026-05-01").to === "2026-06-30" && quarterOf("2026-08-01").to === "2026-09-30" &&
  quarterOf("2026-02-01").to === "2026-03-31" && quarterOf("2026-11-01").to === "2026-12-31");
check("29 February is in the first quarter of a leap year", J(quarterOf("2024-02-29")) === J({ from: "2024-01-01", to: "2024-03-31" }), J(quarterOf("2024-02-29")));
check("the last second of the year and the first of the next are different quarters",
  quarterOf("2025-12-31").from === "2025-10-01" && quarterOf("2026-01-01").from === "2026-01-01");

// ── The quarter before ────────────────────────────────────────────────
check("the quarter before January is last year's October to December",
  J(previousQuarter("2026-01-15")) === J({ from: "2025-10-01", to: "2025-12-31" }), J(previousQuarter("2026-01-15")));
check("the quarter before the first day of one is the whole of the last",
  J(previousQuarter("2026-04-01")) === J({ from: "2026-01-01", to: "2026-03-31" }), J(previousQuarter("2026-04-01")));
check("and it works off a leap February too",
  J(previousQuarter("2024-02-29")) === J({ from: "2023-10-01", to: "2023-12-31" }), J(previousQuarter("2024-02-29")));
check("the label names both ends", quarterLabel("2026-01-01", "2026-03-31") === "Jan 2026 – Mar 2026", quarterLabel("2026-01-01", "2026-03-31"));

// ── A sale on the boundary, both bases ────────────────────────────────
const Q2 = { from: "2026-04-01", to: "2026-06-30" };
const inv = (id, date) => ({ id, clientId: "c", date, number: id, items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", dueDate: null, paymentTerms: "", status: "sent", tags: [], vatRegistered: true, cisRate: null });
const pay = (id, invoiceId, date) => ({ id, invoiceId, date, amount: 1200, method: "bank", note: "" });
const credit = (id, invoiceId, date, amount = 1200) => ({ id, invoiceId, date, amount, reason: "" });

const onFirst = inv("first", "2026-04-01");
const dayBefore = inv("before", "2026-03-31");
const onLast = inv("last", "2026-06-30");
const dayAfter = inv("after", "2026-07-01");

const basis = (invoices, payments, credits, b) => vatFigures(invoices, credits, payments, [], true, Q2, b);

let f = basis([onFirst], [], [], "invoice");
check("invoice basis: a sale on the first day of the quarter is in it", near(f.box1, 200) && near(f.box6, 1000), J(f));
f = basis([dayBefore], [], [], "invoice");
check("invoice basis: the day before is not", f.box1 === 0 && f.box6 === 0, J(f));
f = basis([onLast], [], [], "invoice");
check("invoice basis: a sale on the last day is in it", near(f.box1, 200), J(f));
f = basis([dayAfter], [], [], "invoice");
check("invoice basis: the day after is not", f.box1 === 0, J(f));

// On the cash basis it is the money that decides, not the invoice.
f = basis([dayBefore], [pay("p", "before", "2026-04-01")], [], "cash");
check("cash basis: last quarter's invoice, paid on the first day, is in this one", near(f.box1, 200), J(f));
f = basis([onFirst], [pay("p", "first", "2026-03-31")], [], "cash");
check("cash basis: paid the day before the quarter is not in it", f.box1 === 0, J(f));
f = basis([onFirst], [pay("p", "first", "2026-06-30")], [], "cash");
check("cash basis: paid on the last day is in it", near(f.box1, 200), J(f));
f = basis([onFirst], [pay("p", "first", "2026-07-01")], [], "cash");
check("cash basis: paid the day after is not", f.box1 === 0, J(f));
f = basis([onFirst], [], [], "cash");
check("cash basis: an unpaid sale in the quarter declares nothing", f.box1 === 0, J(f));

// A credit note is counted in the quarter it was raised, on both bases.
f = basis([onFirst], [pay("p", "first", "2026-04-02")], [credit("c1", "first", "2026-06-30")], "cash");
check("a credit note on the last day of the quarter comes off it", near(f.box1, 0), J({ box1: f.box1, held: f.creditsHeldBack }));
f = basis([onFirst], [pay("p", "first", "2026-04-02")], [credit("c1", "first", "2026-07-01")], "cash");
check("a credit note the day after does not", near(f.box1, 200), J(f.box1));
f = basis([onFirst], [], [credit("c1", "first", "2026-06-30")], "cash");
// creditsHeldBack is a COUNT of notes, not an amount -- it is what the VAT
// page turns into "One credit note is counted only in part here".
check("cash basis: crediting an invoice nobody paid reclaims nothing, and says one note was held back",
  f.box1 === 0 && f.creditsHeldBack === 1, J({ box1: f.box1, held: f.creditsHeldBack }));

// ── A purchase on the boundary ────────────────────────────────────────
const bill = (id, date) => ({ id, date, vendor: "Jewson", amount: 500, vatAmount: 100, documentType: "invoice", paid: true, details: {} });
f = vatFigures([], [], [], [bill("b1", "2026-06-30")], true, Q2, "invoice");
check("a purchase on the last day of the quarter is in it", near(f.box4, 100) && near(f.box7, 500), J(f));
f = vatFigures([], [], [], [bill("b2", "2026-07-01")], true, Q2, "invoice");
check("and the day after is not", f.box4 === 0, J(f));

// ── London time, which is the whole reason todayISO exists ────────────
// Britain is UTC+1 from late March to late October. At 23:30 UTC on 30
// June it is already 1 July in London -- the start of a new VAT quarter.
// Asking UTC what day it is put that sale in the quarter that had just
// ended, in a return that may already have been filed.
const RealDate = Date;
const pin = (iso) => {
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [iso])); }
    static now() { return new RealDate(iso).getTime(); }
  };
};
const { todayISO } = await import("./gen/lib/today.js");
try {
  pin("2026-06-30T23:30:00Z");
  const utcDay = new RealDate("2026-06-30T23:30:00Z").toISOString().slice(0, 10);
  check("summer, half past midnight in London: today is 1 July", todayISO() === "2026-07-01", todayISO());
  check("and that sale is in the new quarter, not the one just ended",
    quarterOf(todayISO()).from === "2026-07-01" && quarterOf(utcDay).from === "2026-04-01",
    J({ london: quarterOf(todayISO()), utc: quarterOf(utcDay) }));

  pin("2026-03-31T23:30:00Z");
  check("summer, the April quarter starts an hour early in London too", todayISO() === "2026-04-01" && quarterOf(todayISO()).from === "2026-04-01", todayISO());

  // In winter London is UTC, so the two agree and nothing moves.
  pin("2025-12-31T23:30:00Z");
  check("winter: London is UTC, so 31 December is still 31 December", todayISO() === "2025-12-31" && quarterOf(todayISO()).from === "2025-10-01", todayISO());
  pin("2026-01-01T00:30:00Z");
  check("winter: half past midnight on 1 January is the new quarter", todayISO() === "2026-01-01" && quarterOf(todayISO()).from === "2026-01-01", todayISO());
} finally {
  globalThis.Date = RealDate;
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
