// The cash-accounting VAT figures, which are the ones copied into HMRC's
// own form. Two bugs lived here: a CIS invoice under-declared its VAT for
// ever, and a credit note against an invoice that was never paid reclaimed
// VAT that had never been accounted for. Every figure below is worked out
// by hand in the comments.
import { vatFigures } from "./gen/lib/vatReturn.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const near = (a, b) => Math.abs(a - b) < 0.005;

const PERIOD = { from: "2026-01-01", to: "2026-03-31" };
const inv = (o) => ({
  id: o.id, clientId: "c", date: o.date ?? "2026-01-10", number: o.number ?? o.id,
  items: o.items, notes: "", dueDate: null, paymentTerms: "", status: o.status ?? "sent",
  tags: [], vatRegistered: true, cisRate: o.cisRate ?? null,
});
const pay = (id, invoiceId, amount, date = "2026-02-10") => ({ id, invoiceId, date, amount, method: "bank", note: "" });
const credit = (id, invoiceId, amount, date = "2026-02-20") => ({ id, invoiceId, date, amount, reason: "" });
const labour = (net) => [{ description: "Labour", quantity: 1, unitPrice: net, vatRate: "standard", kind: "labour" }];

// A CIS invoice: £1,000 labour + £200 VAT = £1,200. CIS at 20% takes £200
// off the labour, so the contractor pays £1,000 and hands £200 to HMRC.
// The consideration for VAT is still the whole £1,200.
const CIS = inv({ id: "cis", items: labour(1000), cisRate: 20 });

let f = vatFigures([CIS], [], [pay("p1", "cis", 1000)], [], true, PERIOD, "cash");
check("a settled CIS invoice declares the whole £200 of VAT", near(f.box1, 200), String(f.box1));
check("and £1,000 of sales, not £833.33", near(f.box6, 1000), String(f.box6));

const onInvoiceBasis = vatFigures([CIS], [], [pay("p1", "cis", 1000)], [], true, PERIOD, "invoice");
check("the two bases agree once it is settled", near(f.box1, onInvoiceBasis.box1) && near(f.box6, onInvoiceBasis.box6), JSON.stringify({ cash: f.box1, invoice: onInvoiceBasis.box1 }));

// Half the balance paid: half the consideration.
f = vatFigures([CIS], [], [pay("p1", "cis", 500)], [], true, PERIOD, "cash");
check("half the balance declares half the VAT", near(f.box1, 100), String(f.box1));
check("and half the sales", near(f.box6, 500), String(f.box6));

// Nothing paid: nothing declared.
f = vatFigures([CIS], [], [], [], true, PERIOD, "cash");
check("an unpaid CIS invoice declares nothing yet", f.box1 === 0 && f.box6 === 0, JSON.stringify(f));

// A plain invoice with no CIS is untouched by any of this.
const PLAIN = inv({ id: "plain", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }] });
f = vatFigures([PLAIN], [], [pay("p2", "plain", 1200)], [], true, PERIOD, "cash");
check("a plain invoice paid in full is £200 and £1,000", near(f.box1, 200) && near(f.box6, 1000), JSON.stringify({ box1: f.box1, box6: f.box6 }));

// A credit note against an invoice nobody ever paid. On the cash basis no
// VAT was ever declared on it, so there is nothing to take back.
f = vatFigures([PLAIN], [credit("c1", "plain", 1200)], [], [], true, PERIOD, "cash");
check("cancelling an unpaid invoice doesn't reclaim VAT that was never paid", f.box1 === 0, String(f.box1));
check("and doesn't push sales negative", f.box6 === 0, String(f.box6));
check("the page is told a credit was held back", f.creditsHeldBack === 1, String(f.creditsHeldBack));

// The dangerous version: other work in the quarter, so the wrong figure
// hides inside a positive total instead of showing as a negative.
f = vatFigures([PLAIN, inv({ id: "other", items: [{ description: "Work", quantity: 1, unitPrice: 2000, vatRate: "standard" }] })],
  [credit("c1", "plain", 1200)], [pay("p3", "other", 2400)], [], true, PERIOD, "cash");
check("it doesn't quietly eat output tax that is genuinely due", near(f.box1, 400), String(f.box1));
check("sales stay right too", near(f.box6, 2000), String(f.box6));

// Paid then credited (a real refund): the full credit still comes off.
f = vatFigures([PLAIN], [credit("c1", "plain", 1200)], [pay("p2", "plain", 1200)], [], true, PERIOD, "cash");
check("an invoice paid then refunded cancels out", f.box1 === 0 && f.box6 === 0, JSON.stringify({ box1: f.box1, box6: f.box6 }));
check("and nothing is reported as held back", f.creditsHeldBack === 0, String(f.creditsHeldBack));

// Half paid, then credited in full: half comes off.
f = vatFigures([PLAIN], [credit("c1", "plain", 1200)], [pay("p2", "plain", 600)], [], true, PERIOD, "cash");
check("half paid then credited takes half off", near(f.box1, 0) && near(f.box6, 0), JSON.stringify({ box1: f.box1, box6: f.box6 }));
check("and says so", f.creditsHeldBack === 1, String(f.creditsHeldBack));

// The invoice basis is unchanged by all of this.
f = vatFigures([PLAIN], [credit("c1", "plain", 1200)], [], [], true, PERIOD, "invoice");
check("on the invoice basis a credit still comes off in full", near(f.box1, 0) && near(f.box6, 0), JSON.stringify({ box1: f.box1, box6: f.box6 }));
check("and nothing is held back there", f.creditsHeldBack === 0, String(f.creditsHeldBack));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
