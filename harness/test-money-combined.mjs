// CIS, VAT, credit notes and deposits ON THE SAME JOB, to the penny. Each
// of these is tested on its own elsewhere; a builder's real invoice has all
// four at once, and that combination has never been checked. Straight off
// the app's own source, so it cannot drift from what the screens do.
//
// The job: a £4,000 kitchen, quoted with a 30% deposit, VAT-registered at
// two rates, invoiced under CIS at 20%, part-paid, then part-credited.
import { computeInvoiceTotals } from "./gen/lib/vat.js";
import { cisDeduction, creditOffDue, invoiceCharge, labourNet } from "./gen/lib/cis.js";
import { invoiceBalance, statusFromPayments, syncedStatus } from "./gen/lib/invoiceBalance.js";
import { depositDeductions, depositGross, depositLines } from "./gen/lib/quoteDeposit.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const p = (n) => Math.round(n * 100) / 100;
// Every figure below is compared at the penny: a float comparison that
// passes by luck is the thing these checks exist to catch.
const pennies = (n) => Math.round(n * 100);
const same = (a, b) => pennies(a) === pennies(b);

// ── The quote ─────────────────────────────────────────────────────────
const items = [
  { description: "Fitting labour", quantity: 40, unitPrice: 45, vatRate: "standard", kind: "labour" },   // 1800
  { description: "Units and worktop", quantity: 1, unitPrice: 2000, vatRate: "standard", kind: "materials" },
  { description: "Insulation board", quantity: 1, unitPrice: 200, vatRate: "reduced", kind: "materials" },
];
const quote = { number: "Q-0007", items, deposit: { kind: "percent", value: 30 } };
const totals = computeInvoiceTotals(items, true);

check("the quote totals to the penny", same(totals.subtotal, 4000) && same(totals.totalVat, 1800 * 0.2 + 2000 * 0.2 + 200 * 0.05), JSON.stringify(totals));
check("VAT is worked out per rate, not on the lump", totals.vatByRate.length === 2 && same(totals.vatByRate.find((r) => r.kind === "reduced").vat, 10), JSON.stringify(totals.vatByRate));

// ── The deposit invoice ───────────────────────────────────────────────
const gross = depositGross(quote, true);
check("the deposit is 30% of the gross quote", same(gross, p(totals.total * 0.3)), JSON.stringify({ gross, total: totals.total }));

const depLines = depositLines(quote, true);
const depTotals = computeInvoiceTotals(depLines, true);
check("the deposit invoice is split one line per VAT rate", depLines.length === 2, JSON.stringify(depLines));
check("and its own total is the deposit, within a penny", Math.abs(pennies(depTotals.total) - pennies(gross)) <= 1, JSON.stringify({ charged: depTotals.total, gross }));
check("its prices are whole pence", depLines.every((l) => pennies(l.unitPrice) === Math.round(pennies(l.unitPrice))), JSON.stringify(depLines.map((l) => l.unitPrice)));

// ── The final invoice: deposit off, under CIS ─────────────────────────
const depositInvoice = { items: depLines, number: "INV-000101", status: "sent" };
const finalItems = [...items, ...depositDeductions(depositInvoice, 0, true)];
const finalTotals = computeInvoiceTotals(finalItems, true);
check("the final invoice charges the job less the deposit already invoiced",
  Math.abs(pennies(finalTotals.total) - (pennies(totals.total) - pennies(depTotals.total))) <= 1,
  JSON.stringify({ final: finalTotals.total, job: totals.total, deposit: depTotals.total }));
check("the two invoices together are the job, to the penny",
  Math.abs((pennies(finalTotals.total) + pennies(depTotals.total)) - pennies(totals.total)) <= 1,
  JSON.stringify({ sum: finalTotals.total + depTotals.total, job: totals.total }));
check("VAT on the two together is the job's VAT",
  Math.abs((pennies(finalTotals.totalVat) + pennies(depTotals.totalVat)) - pennies(totals.totalVat)) <= 1,
  JSON.stringify({ sum: finalTotals.totalVat + depTotals.totalVat, job: totals.totalVat }));

// CIS comes off the LABOUR only, and off the net, never the VAT.
const invoice = { items: finalItems, cisRate: 20 };
const charge = invoiceCharge(invoice, true);
check("CIS is 20% of the labour net alone", same(cisDeduction(finalItems, 20), p(labourNet(finalItems) * 0.2)), JSON.stringify({ cis: charge.cis, labour: labourNet(finalItems) }));
check("the deposit deduction carries its own kind, so it reduces the labour it came from",
  depositDeductions(depositInvoice, 0, true).every((l) => "kind" in l), JSON.stringify(depositDeductions(depositInvoice, 0, true)));
check("CIS never touches the VAT", same(charge.total - charge.due, charge.cis), JSON.stringify(charge));
check("what the customer owes is the total less CIS", same(charge.due, p(charge.total - charge.cis)), JSON.stringify(charge));

// ── Part-paid, then credited ──────────────────────────────────────────
const due = charge.due;
const part = p(due / 3);
check("part-paid: the balance is what is left of `due`, not of the total",
  same(invoiceBalance({ total: due, credited: 0, paid: part, status: "partial" }), p(due - part)),
  JSON.stringify({ due, part }));
check("part-paid: the status follows the money", statusFromPayments({ total: due, credited: 0, paid: part }) === "partial");

// A credit note is the value of the WORK credited, before CIS. On a CIS
// invoice the customer was never paying the whole of that work -- the
// contractor keeps 20% of the labour back -- so what they pay drops by the
// same share of the credit, not by the whole of it. Crediting £300 of work
// off a job where the customer pays £3,219 of £3,540 takes off £272.80, and
// the remaining £27.20 is 20% of the labour in that credit, which was never
// theirs to pay. This is the combination nothing else checks.
const credited = 300;
const offDue = creditOffDue(charge, credited);
check("a credit on a CIS invoice comes off in the same share the customer pays",
  same(offDue, p(Math.round((credited * 100 * charge.due) / charge.total) / 100)) && offDue < credited,
  JSON.stringify({ credited, offDue, due: charge.due, total: charge.total }));
check("on a plain invoice the whole credit comes off",
  same(creditOffDue({ total: 1000, due: 1000 }, 300), 300));
check("paid then credited: nothing is owed and the status says paid",
  same(invoiceBalance({ total: due, credited: offDue, paid: p(due - offDue), status: "partial" }), 0) &&
  statusFromPayments({ total: due, credited: offDue, paid: p(due - offDue) }) === "paid",
  JSON.stringify({ due, offDue }));

// The other way round: credited first, then paid the rest.
check("credited then paid: the same answer, in the other order",
  same(invoiceBalance({ total: due, credited: offDue, paid: p(due - offDue), status: "sent" }), 0),
  JSON.stringify({ due, offDue }));
check("credited in full is paid, with no money received at all",
  statusFromPayments({ total: due, credited: due, paid: 0 }) === "paid", String(due));
check("over-credited never owes a negative amount",
  same(invoiceBalance({ total: due, credited: due + 500, paid: 0, status: "sent" }), 0));
check("over-paid never owes a negative amount",
  same(invoiceBalance({ total: due, credited: 0, paid: due + 500, status: "partial" }), 0));

// A status set by hand before payments existed is not overwritten...
check("an invoice marked paid by hand keeps its status when nothing was recorded",
  syncedStatus("paid", { total: due, credited: 0, paid: 0 }, 0) === null);
// ...unless it has since been credited in full, which really is paid.
check("but crediting it in full does move it",
  syncedStatus("sent", { total: due, credited: due, paid: 0 }, 0) === "paid");

// ── A fully credited deposit ──────────────────────────────────────────
check("a deposit credited in full takes nothing off the final invoice",
  depositDeductions(depositInvoice, depTotals.total, true).length === 0,
  JSON.stringify(depositDeductions(depositInvoice, depTotals.total, true)));
const half = depositDeductions(depositInvoice, p(depTotals.total / 2), true);
check("a half-credited deposit takes off half",
  Math.abs(pennies(computeInvoiceTotals(half, true).total) + Math.round(pennies(depTotals.total) / 2)) <= 1,
  JSON.stringify({ taken: computeInvoiceTotals(half, true).total, deposit: depTotals.total }));
check("and it says so on the line, so the customer can see why",
  half.every((l) => /less its credit/.test(l.description)), JSON.stringify(half.map((l) => l.description)));

// ── Not VAT-registered, same job ──────────────────────────────────────
const plain = computeInvoiceTotals(items, false);
check("not VAT-registered: no VAT anywhere, and the total is the net", same(plain.totalVat, 0) && same(plain.total, 4000) && plain.vatByRate.length === 0, JSON.stringify(plain));
const plainDeposit = depositGross(quote, false);
check("not VAT-registered: the deposit is 30% of the net", same(plainDeposit, 1200), String(plainDeposit));
check("not VAT-registered: one deposit line, not one per rate", depositLines(quote, false).length === 1, JSON.stringify(depositLines(quote, false)));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
