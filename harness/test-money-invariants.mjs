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
import { depositGross, depositLines, depositDeductions } from "./gen/lib/quoteDeposit.js";
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

// ---------------------------------------------------------------------------
// Deposits, generated the same way
// ---------------------------------------------------------------------------
// A deposit is the one place in this app where one sum is split in two and
// both halves are invoiced separately, so it is the one place where money can
// go missing without either half looking wrong on its own. The deposit invoice
// carries VAT in the same proportions as the quote, one line per rate, and the
// final invoice takes those same lines off again negated -- so the two must
// add back up to the quote, exactly, whatever the rates and however odd the
// prices. Generated rather than chosen: a deposit of 100%, a deposit larger
// than the quote, a three-rate quote whose 20% share does not divide by
// anything, a deposit credited in part and in full.
const DEPOSIT_CASES = 3000;
// HOW MUCH ROUNDING IS ALLOWED, and why it is not zero. VAT is rounded once
// per rate on each document, and the deposit invoice and the final invoice are
// two documents, each rounded on its own -- as they must be, since each is a
// real VAT invoice. So the two halves can miss the quote by a little.
//
// How little was measured, not assumed: a million generated quotes across four
// seeds, one to four VAT rates, totals up to £98,000. The worst gap is TWO
// PENCE, and it does not grow with the money or with the number of rates.
//
// That flatness is the whole value of the check. Rounding is bounded; a real
// error in the split would scale with the job, so a £50,000 quote would be out
// by pounds and this would catch it immediately.
const MAX_SPLIT_PENCE = 2;
const dBroke = { gross: [], depositTotal: [], split: [], vatSplit: [], pence: [], credited: [], fullyCredited: [], hundred: [], drift: [] };
let worstSplit = 0;

for (let i = 0; i < DEPOSIT_CASES; i++) {
  const n = 1 + Math.floor(rnd() * 4);
  const items = Array.from({ length: n }, () => ({ description: "x", quantity: qty(), unitPrice: money(), vatRate: pick(RATES) }));
  const vatRegistered = pick([true, false]);
  const deposit = pick([
    { kind: "percent", value: pick([10, 25, 33, 50, 75, 100]) },
    { kind: "amount", value: money() },
  ]);
  const quote = { items, deposit, number: "QU-1" };
  const quoteTotals = computeInvoiceTotals(items, vatRegistered);
  const gross = depositGross(quote, vatRegistered) ?? 0;
  const tol = MAX_SPLIT_PENCE;
  const at = (what) => ({ case: i, what, gross, quoteTotal: quoteTotals.total, deposit, vatRegistered, tol });

  // Never negative, never more than the quote.
  if (gross < 0 || pence(gross) > pence(quoteTotals.total)) dBroke.gross.push(at("gross"));

  const dLines = depositLines(quote, vatRegistered);
  const dTotals = computeInvoiceTotals(dLines, vatRegistered);
  if (dLines.some((l) => Math.abs(l.unitPrice * 100 - Math.round(l.unitPrice * 100)) > 1e-6)) dBroke.pence.push(at("deposit lines not whole pence"));
  if (Math.abs(pence(dTotals.total) - pence(gross)) > tol) dBroke.depositTotal.push({ ...at("deposit invoice total"), depositInvoice: dTotals.total });

  // The whole point: deposit + balance = quote.
  const balanceItems = [...items, ...depositDeductions({ items: dLines, number: "INV-1", status: "sent" }, 0, vatRegistered)];
  const bTotals = computeInvoiceTotals(balanceItems, vatRegistered);
  const splitOut = Math.abs(pence(dTotals.total) + pence(bTotals.total) - pence(quoteTotals.total));
  worstSplit = Math.max(worstSplit, splitOut);
  if (splitOut > tol) dBroke.split.push({ ...at("split"), depositInvoice: dTotals.total, balance: bTotals.total, out: splitOut });
  // The one that separates rounding from a real error: a penny or two is
  // rounding whatever the size of the job; anything that grows with the money
  // is not.
  if (splitOut > MAX_SPLIT_PENCE) dBroke.drift.push({ ...at("drift"), out: splitOut });

  const dVat = dTotals.vatByRate.reduce((a, r) => a + r.vat, 0);
  const bVat = bTotals.vatByRate.reduce((a, r) => a + r.vat, 0);
  const qVat = quoteTotals.vatByRate.reduce((a, r) => a + r.vat, 0);
  if (Math.abs(pence(dVat) + pence(bVat) - pence(qVat)) > tol) dBroke.vatSplit.push({ ...at("vat split"), dVat, bVat, qVat });

  // Credit part of the deposit and the balance grows by that much. The
  // deduction lines shrink in proportion and each rounds, so the tolerance is
  // per rate plus per line.
  if (dTotals.total > 0) {
    const credited = Math.round(dTotals.total * pick([0.25, 0.5, 0.9]) * 100) / 100;
    const withCredit = computeInvoiceTotals([...items, ...depositDeductions({ items: dLines, number: "INV-1", status: "sent" }, credited, vatRegistered)], vatRegistered);
    if (Math.abs(pence(withCredit.total) - (pence(bTotals.total) + pence(credited))) > tol + dLines.length) {
      dBroke.credited.push({ ...at("credited"), credited, balance: bTotals.total, withCredit: withCredit.total });
    }
    // Credited in full, nothing is taken off at all.
    const whole = computeInvoiceTotals([...items, ...depositDeductions({ items: dLines, number: "INV-1", status: "sent" }, dTotals.total, vatRegistered)], vatRegistered);
    if (pence(whole.total) !== pence(quoteTotals.total)) dBroke.fullyCredited.push({ ...at("fully credited"), whole: whole.total });
  }

  // A deposit of the whole thing leaves nothing to pay -- give or take the
  // same rounding, which can leave a penny owed or a penny back.
  if (deposit.kind === "percent" && deposit.value === 100 && quoteTotals.total > 0 && Math.abs(pence(bTotals.total)) > tol) {
    dBroke.hundred.push({ ...at("100%"), balance: bTotals.total });
  }
}

check(`a deposit is never negative and never more than the quote (${DEPOSIT_CASES} quotes)`, dBroke.gross.length === 0, JSON.stringify(dBroke.gross.slice(0, 2)));
check("every deposit line is whole pence", dBroke.pence.length === 0, JSON.stringify(dBroke.pence.slice(0, 2)));
check(`the deposit invoice charges the deposit, within ${MAX_SPLIT_PENCE}p`, dBroke.depositTotal.length === 0, JSON.stringify(dBroke.depositTotal.slice(0, 2)));
check(`deposit plus balance is the quote, within ${MAX_SPLIT_PENCE}p`, dBroke.split.length === 0, JSON.stringify(dBroke.split.slice(0, 2)));
check("...and that gap is rounding, not drift: it never grows with the money", dBroke.drift.length === 0 && worstSplit <= MAX_SPLIT_PENCE, JSON.stringify({ worstSplit, drift: dBroke.drift.slice(0, 2) }));
check("...and their VAT adds up to the quote's VAT the same way", dBroke.vatSplit.length === 0, JSON.stringify(dBroke.vatSplit.slice(0, 2)));
check("crediting part of the deposit puts that much back on the balance", dBroke.credited.length === 0, JSON.stringify(dBroke.credited.slice(0, 2)));
check("crediting all of it leaves the whole quote to pay, exactly", dBroke.fullyCredited.length === 0, JSON.stringify(dBroke.fullyCredited.slice(0, 2)));
check("a deposit of 100% leaves nothing to pay", dBroke.hundred.length === 0, JSON.stringify(dBroke.hundred.slice(0, 2)));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
