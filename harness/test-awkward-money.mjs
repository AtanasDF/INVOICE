// A statement and a VAT quarter with money that does not divide nicely:
// CIS on a part-paid invoice, a credit note on top of that, a 5% rate that
// makes a half-penny, and a customer who has been over-credited and is owed
// money back. Each of these is tested alone elsewhere; on one account at
// once is where a penny goes missing, and a penny missing from a statement
// is an argument with a customer.
//
// Straight off the app's own source. The figures below are worked out by
// hand in the comments so a disagreement names which side is wrong.
import { buildStatement } from "./gen/lib/statement.js";
import { vatFigures } from "./gen/lib/vatReturn.js";
import { invoiceCharge, creditOffDue } from "./gen/lib/cis.js";
import { computeInvoiceTotals } from "./gen/lib/vat.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const p = (n) => Math.round(n * 100) / 100;
const same = (a, b) => Math.round(a * 100) === Math.round(b * 100);
const J = (x) => JSON.stringify(x);

const inv = (o) => ({
  id: o.id, clientId: "c", date: o.date, number: o.id, items: o.items, notes: "", dueDate: o.dueDate ?? null,
  paymentTerms: "", status: o.status ?? "sent", tags: [], vatRegistered: true, cisRate: o.cisRate ?? null,
});
const pay = (id, invoiceId, amount, date) => ({ id, invoiceId, date, amount, method: "bank", note: "" });
const credit = (id, invoiceId, amount, date) => ({ id, invoiceId, date, amount, reason: "" });

// ── The job: CIS, two VAT rates, part-paid, then credited ─────────────
// Labour 2,000 @ 20% VAT = 2,400. Materials 500 @ 5% VAT = 525.
// Total 2,925. CIS at 20% of the 2,000 labour = 400.
// The customer owes 2,925 - 400 = 2,525.
const ITEMS = [
  { description: "Labour", quantity: 1, unitPrice: 2000, vatRate: "standard", kind: "labour" },
  { description: "Insulation", quantity: 1, unitPrice: 500, vatRate: "reduced", kind: "materials" },
];
const A = inv({ id: "A", date: "2026-04-10", dueDate: "2026-05-10", items: ITEMS, cisRate: 20 });
const charge = invoiceCharge(A, true);
check("the job totals 2,925 with VAT at two rates", same(charge.total, 2925), J({ total: charge.total, vat: charge.totalVat }));
check("CIS takes 400 off what the customer pays, never off the VAT", same(charge.cis, 400) && same(charge.due, 2525), J({ cis: charge.cis, due: charge.due }));

// 1,000 paid, then 300 of work credited. The credit comes off what they
// pay in the same share: 300 x 2525/2925 = 258.97.
const offDue = creditOffDue(charge, 300);
check("a 300 credit takes 258.97 off what they pay", same(offDue, 258.97), String(offDue));

let s = buildStatement([A], [credit("c1", "A", 300, "2026-05-01")], [pay("p1", "A", 1000, "2026-04-20")], true, "2026-06-30");
check("the statement's line subtracts to its own balance",
  same(s.lines[0].charged - s.lines[0].credited - s.lines[0].paid, s.lines[0].balance),
  J(s.lines[0]));
check("and that balance is 2,525 less 1,000 paid less 258.97 credited = 1,266.03",
  same(s.lines[0].balance, 1266.03), J({ balance: s.lines[0].balance }));
check("the account owes the same as its one line", same(s.outstanding, 1266.03), J({ outstanding: s.outstanding }));
check("nothing is owed back", same(s.inCredit, 0), String(s.inCredit));

// ── Over-credited: the customer is owed money back ────────────────────
// Paid the lot, then 500 of work credited afterwards.
s = buildStatement([A], [credit("c2", "A", 500, "2026-06-01")], [pay("p2", "A", 2525, "2026-04-20")], true, "2026-06-30");
const line = s.lines[0];
check("over-credited: the line says what is owed BACK, not a clamped zero",
  same(line.balance, 0) && line.credit > 0, J(line));
check("and it is the credit's share of what they were paying, 431.62",
  same(line.credit, p(Math.round(500 * 100 * charge.due / charge.total) / 100)), J({ credit: line.credit }));
check("the account shows it as money owed back, not as a negative debt",
  same(s.outstanding, 0) && same(s.inCredit, line.credit), J({ outstanding: s.outstanding, inCredit: s.inCredit }));
check("the four cells still subtract to the balance beside them",
  same(line.charged - line.credited - line.paid + line.credit, line.balance), J(line));

// ── How late, on the day it falls due and the day after ───────────────
s = buildStatement([A], [], [], true, "2026-05-10");
check("on the day it is due, nothing is late", s.lines[0].daysLate <= 0 && same(s.overdue, 0), J({ daysLate: s.lines[0].daysLate, overdue: s.overdue }));
s = buildStatement([A], [], [], true, "2026-05-11");
check("the day after, it is one day late and the whole balance is overdue",
  s.lines[0].daysLate === 1 && same(s.overdue, 2525), J({ daysLate: s.lines[0].daysLate, overdue: s.overdue }));

// Ageing buckets, on their boundaries.
s = buildStatement([A], [], [], true, "2026-06-09");  // 30 days past due
check("30 days past due is in the 30-day bucket, not the 60", s.ageing.d30 > 0 && s.ageing.d60 === 0, J(s.ageing));
check("the buckets add up to what is outstanding",
  same(s.ageing.current + s.ageing.d30 + s.ageing.d60 + s.ageing.d90, s.outstanding), J({ ageing: s.ageing, outstanding: s.outstanding }));

// ── The same job in a VAT quarter, both bases ─────────────────────────
const Q2 = { from: "2026-04-01", to: "2026-06-30" };
let f = vatFigures([A], [], [], [], true, Q2, "invoice");
check("invoice basis declares the job's whole VAT, whatever was paid", same(f.box1, charge.totalVat), J({ box1: f.box1, vat: charge.totalVat }));
check("and its net as sales", same(f.box6, 2500), String(f.box6));

// Cash basis, 1,000 of the 2,525 balance paid. CIS is scaled back up: the
// consideration is 1,000 x 2925/2525 = 1,158.42, and the VAT is that
// share of the invoice's own VAT proportion.
f = vatFigures([A], [], [pay("p1", "A", 1000, "2026-04-20")], [], true, Q2, "cash");
const share = 1000 * charge.total / charge.due;
check("cash basis scales a CIS payment back to the consideration",
  same(f.box1 + f.box6, p(Math.round(share * 100) / 100)), J({ box1: f.box1, box6: f.box6, expected: p(share) }));
check("box 5 is box 1 less box 4, to the penny", same(f.box5, p(f.box1 - f.box4)), J({ box1: f.box1, box4: f.box4, box5: f.box5 }));

// A half-penny: 5% VAT on 2,000.10 is 100.005.
const half = computeInvoiceTotals([{ description: "Odd", quantity: 1, unitPrice: 2000.10, vatRate: "reduced" }], true);
// 5% of 2,000.10 is 100.005 -- a half penny. Whatever it rounds to, it has
// to round to a WHOLE penny and the total has to agree with it, or the
// customer's copy adds up to something different from the VAT return.
const wholePence = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
check("a half-penny of VAT is rounded to a whole penny, and the total agrees",
  wholePence(half.totalVat) && wholePence(half.total) && same(half.total, p(half.subtotal + half.totalVat)),
  J(half));

// ── Nothing on the account ────────────────────────────────────────────
s = buildStatement([], [], [], true, "2026-06-30");
check("an empty account states zero rather than nothing", same(s.outstanding, 0) && s.lines.length === 0 && !s.oldest, J(s));

// A draft is not a debt.
s = buildStatement([inv({ id: "D", date: "2026-04-10", items: ITEMS, status: "draft" })], [], [], true, "2026-06-30");
check("a draft invoice is not on the statement at all", s.lines.length === 0 && same(s.outstanding, 0), J(s));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
