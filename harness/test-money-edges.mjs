// The awkward ends of the money rules, straight off the app's own source:
// crediting more than the invoice, paying more than is owed, several
// payments on the same day, taking the last one back, and CIS at both
// rates on a mixed labour-and-materials job.
import { cisDeduction, creditOffDue, invoiceCharge, labourNet, withKinds } from "./gen/lib/cis.js";
import { invoiceBalance, invoiceVat, statusFromPayments, syncedStatus } from "./gen/lib/invoiceBalance.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const p = (n) => Math.round(n * 100) / 100;

const job = (cisRate) => ({
  cisRate,
  items: [
    { description: "Labour", quantity: 10, unitPrice: 50, vatRate: "standard", kind: "labour" },     // 500
    { description: "Materials", quantity: 1, unitPrice: 300, vatRate: "standard", kind: "materials" }, // 300
  ],
});

// CIS comes off the labour only, at the rate the contractor is registered for.
check("labour is picked out of a mixed job", labourNet(job(20).items) === 500, String(labourNet(job(20).items)));
check("CIS at 20% is a fifth of the labour", cisDeduction(job(20).items, 20) === 100, String(cisDeduction(job(20).items, 20)));
check("CIS at 30% is applied to the labour too", cisDeduction(job(30).items, 30) === 150, String(cisDeduction(job(30).items, 30)));
check("no CIS rate means no deduction", cisDeduction(job(null).items, null) === 0);
check("materials are never deducted from", cisDeduction([{ description: "Materials", quantity: 1, unitPrice: 300, vatRate: "standard", kind: "materials" }], 20) === 0);
check("an unmarked line counts as labour", labourNet([{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }]) === 100);
check("marking a job CIS marks its lines", withKinds([{ description: "x", quantity: 1, unitPrice: 1, vatRate: "standard" }], 20).every((i) => i.kind), JSON.stringify(withKinds([{ description: "x", quantity: 1, unitPrice: 1, vatRate: "standard" }], 20)));

const charge = invoiceCharge(job(20), true);
check("the total is net plus VAT", p(charge.total) === 960, JSON.stringify(charge));
check("what the customer pays is the total less the CIS", p(charge.due) === 860, String(charge.due));
check("the CIS is on the invoice", p(charge.cis) === 100, String(charge.cis));

// Crediting more than the invoice is worth must not turn into money owed
// back through the CIS maths.
check("a credit for the whole invoice takes the whole balance", p(creditOffDue(charge, 960)) === 860, String(creditOffDue(charge, 960)));
check("a credit bigger than the invoice can't exceed what's owed", invoiceBalance({ total: charge.due, credited: creditOffDue(charge, 2000), paid: 0, status: "sent" }) >= -0.005, String(invoiceBalance({ total: charge.due, credited: creditOffDue(charge, 2000), paid: 0, status: "sent" })));
check("a credit on an invoice with no CIS comes off pound for pound", creditOffDue({ total: 1000, due: 1000 }, 250) === 250);

// Payments.
const due = charge.due; // 860
check("part payment leaves the rest owed", p(invoiceBalance({ total: due, credited: 0, paid: 300, status: "partial" })) === 560, String(invoiceBalance({ total: due, credited: 0, paid: 300, status: "partial" })));
check("two payments on the same day both count", p(invoiceBalance({ total: due, credited: 0, paid: 300 + 260, status: "partial" })) === 300);
check("paying it all leaves nothing owed", invoiceBalance({ total: due, credited: 0, paid: due, status: "paid" }) === 0);
check("an over-payment never shows as a negative balance", invoiceBalance({ total: due, credited: 0, paid: due + 100, status: "paid" }) >= 0, String(invoiceBalance({ total: due, credited: 0, paid: due + 100, status: "paid" })));
check("credit and payment together clear it", invoiceBalance({ total: due, credited: 400, paid: 460, status: "paid" }) === 0);

// Status follows the figures.
check("nothing paid is 'sent'", statusFromPayments({ total: due, credited: 0, paid: 0 }) === "sent");
check("something paid is 'partial'", statusFromPayments({ total: due, credited: 0, paid: 1 }) === "partial", statusFromPayments({ total: due, credited: 0, paid: 1 }));
check("all paid is 'paid'", statusFromPayments({ total: due, credited: 0, paid: due }) === "paid");
check("credited in full counts as paid", statusFromPayments({ total: due, credited: due, paid: 0 }) === "paid", statusFromPayments({ total: due, credited: due, paid: 0 }));
check("a penny short is not paid", statusFromPayments({ total: due, credited: 0, paid: due - 0.01 }) === "partial");

// syncedStatus(current, figures, paymentCount, fromPayments) answers with
// the new status, or null for "leave it alone". Taking the last payment
// back un-pays the invoice; an invoice someone marked paid by hand, before
// payments were ever recorded against it, keeps what he set.
check("removing the last payment un-pays the invoice", syncedStatus("paid", { total: due, credited: 0, paid: 0 }, 0, true) === "sent", String(syncedStatus("paid", { total: due, credited: 0, paid: 0 }, 0, true)));
check("an invoice marked paid by hand keeps what he set", syncedStatus("paid", { total: due, credited: 0, paid: 0 }, 0, false) === null, String(syncedStatus("paid", { total: due, credited: 0, paid: 0 }, 0, false)));
check("a part payment moves it to part-paid on its own", syncedStatus("sent", { total: due, credited: 0, paid: 100 }, 1, true) === "partial", String(syncedStatus("sent", { total: due, credited: 0, paid: 100 }, 1, true)));
check("paying the balance marks it paid on its own", syncedStatus("partial", { total: due, credited: 0, paid: due }, 2, true) === "paid", String(syncedStatus("partial", { total: due, credited: 0, paid: due }, 2, true)));
check("a credit note that clears it marks it paid without a payment", syncedStatus("sent", { total: due, credited: due, paid: 0 }, 0, false) === "paid", String(syncedStatus("sent", { total: due, credited: due, paid: 0 }, 0, false)));
check("nothing changed means nothing is written", syncedStatus("sent", { total: due, credited: 0, paid: 0 }, 0, true) === null, String(syncedStatus("sent", { total: due, credited: 0, paid: 0 }, 0, true)));
check("a draft is never given a status by the figures", syncedStatus("draft", { total: due, credited: 0, paid: due }, 1, true) === null);

// An issued invoice keeps the VAT setting it was issued under.
check("an issued invoice keeps its own VAT setting", invoiceVat({ status: "sent", vatRegistered: true }, false) === true);
check("a draft follows the account's setting", invoiceVat({ status: "draft", vatRegistered: null }, true) === true);
check("an old invoice with no setting falls back to the account", invoiceVat({ status: "sent", vatRegistered: null }, false) === false);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
