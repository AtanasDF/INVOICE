// Money, attacked by generating it rather than by picking examples.
//
// Every other money suite here checks cases somebody thought of. This one
// builds thousands of invoices at random -- CIS on and off, five VAT rates,
// credit notes, part-payments, deposits, odd quantities and prices that do
// not divide by anything -- and asserts the things that must be true of ALL
// of them. The value is entirely in the cases nobody would think to write
// down: a credit note larger than its invoice, a 30% CIS rate on a half-
// hour of labour at £33.33, a payment for a penny more than is owed.
//
// Deterministic on purpose: a seeded generator, so a failure can be
// reproduced from the seed printed beside it rather than being a ghost.
import { computeInvoiceTotals, VAT_RATES } from "./gen/lib/vat.js";
import { invoiceCharge, cisDeduction, labourNet, creditOffDue } from "./gen/lib/cis.js";
import { invoiceBalance } from "./gen/lib/invoiceBalance.js";
import { reverseChargeVat, isReverseCharge } from "./gen/lib/reverseCharge.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// A small deterministic generator, so every run tests the same 4000 cases
// and a failure is reproducible from its index.
let seed = 20260925;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const money = () => Math.round(rnd() * 500000) / 100;      // 0 .. 5000.00
const qty = () => pick([1, 2, 3, 0.5, 1.5, 0.25, 7, 12, 100]);
const RATES = Object.keys(VAT_RATES);

const pence = (n) => Math.round(n * 100);
const CASES = 4000;

function makeInvoice() {
  const n = 1 + Math.floor(rnd() * 5);
  const items = Array.from({ length: n }, () => ({
    description: "x",
    quantity: qty(),
    unitPrice: money(),
    vatRate: pick(RATES),
    kind: pick(["labour", "materials", undefined]),
  }));
  return { items, cisRate: pick([null, 20, 30]), vatRegistered: pick([true, false]) };
}

const broke = { penny: [], negativeDue: [], cisOverLabour: [], vatOnZero: [], reverseCharged: [], balance: [], creditRefund: [], overpaid: [] };

for (let i = 0; i < CASES; i++) {
  const inv = makeInvoice();
  const totals = computeInvoiceTotals(inv.items, inv.vatRegistered);
  const charge = invoiceCharge(inv, inv.vatRegistered);

  // 1. Every total is a whole number of pence. A third of a penny anywhere
  //    is how a screen and a PDF come to disagree.
  const wholePence = [totals.subtotal, totals.totalVat, totals.total, charge.cis, charge.due]
    .every((v) => Math.abs(pence(v) - v * 100) < 1e-6);
  if (!wholePence) broke.penny.push(i);

  // 2. The parts add up to the whole, exactly.
  if (pence(totals.subtotal) + pence(totals.totalVat) !== pence(totals.total)) broke.balance.push(i);

  // 3. CIS is never more than the labour it is taken from, and never
  //    negative -- a discount booked as labour can outweigh the labour.
  const labour = labourNet(inv.items);
  const cis = cisDeduction(inv.items, inv.cisRate);
  if (cis < 0 || (labour > 0 && pence(cis) > pence(labour)) || (labour <= 0 && cis !== 0)) broke.cisOverLabour.push(i);

  // 4. What the customer owes is never negative because of CIS.
  if (charge.due < 0 && totals.total >= 0) broke.negativeDue.push(i);

  // 5. A rate that charges nothing charges nothing. Zero-rated, exempt and
  //    both reverse-charge kinds are legally different and all £0.
  const zeroOnly = inv.items.every((it) => VAT_RATES[it.vatRate] === 0);
  if (zeroOnly && totals.totalVat !== 0) broke.vatOnZero.push(i);

  // 6. Reverse-charged VAT is never charged to the customer, and is never
  //    counted in the invoice's own VAT.
  const rc = inv.items.filter((it) => isReverseCharge(it.vatRate));
  if (rc.length && inv.vatRegistered) {
    const shifted = reverseChargeVat(inv.items);
    const chargedOnRc = totals.vatByRate.filter((v) => isReverseCharge(v.kind)).reduce((s, v) => s + v.vat, 0);
    if (chargedOnRc !== 0 || shifted < 0) broke.reverseCharged.push(i);
  }

  // 7. Credit notes never make a refund out of thin air: crediting more
  //    than the invoice cannot take more off than was ever owed.
  const credited = Math.round(rnd() * pence(totals.total) * 1.4) / 100;
  const off = creditOffDue(charge, credited);
  if (off < 0 || (charge.due > 0 && pence(off) > pence(credited) + 1)) broke.creditRefund.push(i);

  // 8. The balance never goes below zero, however much is paid or credited.
  const paid = Math.round(rnd() * pence(charge.due) * 1.3) / 100;
  const bal = invoiceBalance({ total: charge.due, credited: off, paid, status: "sent" });
  if (bal < -0.001) broke.overpaid.push(i);
}

check(`every total is whole pence (${CASES} invoices)`, broke.penny.length === 0, JSON.stringify(broke.penny.slice(0, 3)));
check("net plus VAT is the total, exactly", broke.balance.length === 0, JSON.stringify(broke.balance.slice(0, 3)));
check("CIS never exceeds the labour, and is never negative", broke.cisOverLabour.length === 0, JSON.stringify(broke.cisOverLabour.slice(0, 3)));
check("CIS never makes what is owed negative", broke.negativeDue.length === 0, JSON.stringify(broke.negativeDue.slice(0, 3)));
check("a rate that charges nothing charges nothing", broke.vatOnZero.length === 0, JSON.stringify(broke.vatOnZero.slice(0, 3)));
check("reverse-charged VAT is never charged to the customer", broke.reverseCharged.length === 0, JSON.stringify(broke.reverseCharged.slice(0, 3)));
check("a credit note never refunds more than it credits", broke.creditRefund.length === 0, JSON.stringify(broke.creditRefund.slice(0, 3)));
check("no amount of paying or crediting drives the balance below zero", broke.overpaid.length === 0, JSON.stringify(broke.overpaid.slice(0, 3)));

// ---- The specific shapes worth naming ---------------------------------------
// Each of these was chosen because it is where rounding usually goes wrong,
// not because it is likely.
const third = computeInvoiceTotals([{ description: "x", quantity: 3, unitPrice: 33.333, vatRate: "standard" }], true);
check("a price with a third of a penny in it still lands on a penny", pence(third.total) === pence(third.subtotal) + pence(third.totalVat), JSON.stringify(third));

const halfPenny = computeInvoiceTotals([{ description: "x", quantity: 1, unitPrice: 0.1, vatRate: "reduced" }], true);
check("5% of 10p rounds once, not twice", halfPenny.totalVat === 0.01 || halfPenny.totalVat === 0, JSON.stringify(halfPenny));

const allLabour = { items: [{ description: "x", quantity: 1, unitPrice: 1000, vatRate: "standard", kind: "labour" }], cisRate: 30 };
const c30 = invoiceCharge(allLabour, true);
check("30% CIS on £1,000 labour leaves £900 due of £1,200", c30.cis === 300 && c30.due === 900 && c30.total === 1200, JSON.stringify(c30));

// A discount line booked as labour, bigger than the labour itself.
const negLabour = { items: [{ description: "work", quantity: 1, unitPrice: 200, vatRate: "standard", kind: "labour" }, { description: "goodwill", quantity: 1, unitPrice: -300, vatRate: "standard", kind: "labour" }], cisRate: 20 };
check("a discount bigger than the labour deducts nothing, not a negative", cisDeduction(negLabour.items, 20) === 0, String(cisDeduction(negLabour.items, 20)));

// Crediting the whole invoice leaves nothing owed, not a refund.
const whole = { items: [{ description: "x", quantity: 1, unitPrice: 500, vatRate: "standard", kind: "labour" }], cisRate: 20 };
const wc = invoiceCharge(whole, true);
check("crediting the whole invoice leaves exactly nothing owed", invoiceBalance({ total: wc.due, credited: creditOffDue(wc, wc.total), paid: 0, status: "sent" }) === 0, JSON.stringify({ wc, off: creditOffDue(wc, wc.total) }));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
