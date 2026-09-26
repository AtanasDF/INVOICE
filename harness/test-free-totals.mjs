// The Free-invoice page's own totals, which had no suite at all.
//
// That absence is the whole story of the bug this pins. The page kept its own
// copy of the CIS sum, and the copy was missing the clamp the app's cis.ts
// carries with the comment explaining exactly why: "a deposit or discount
// taken off as labour can outweigh the labour lines; there's never a negative
// deduction." So CIS at 20% with a "Less deposit paid" line of -500 marked
// labour, against 300 of labour, gave a deduction of MINUS 40 -- and
// "Net payment due" printed 840 on an 800 invoice. SendByEmail uses that same
// figure as the amount due, so the customer was asked for 40 pounds more than
// the invoice total, on an invoice the app itself would have totalled
// correctly. A negative line is not exotic: quoteDeposit generates negated
// labour lines elsewhere in the app, and the number box on the free page
// accepts a leading minus.
//
// So the checks here are mostly one question asked twice: does the free page
// agree with the app? Anywhere it answers on its own is where the next one of
// these will come from.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
import fs from "node:fs";
import { REPO } from "./repo.mjs";
const { defaultDraft, computeDraftTotals } = await import("./gen/lib/freeInvoiceDraft.js");
const { cisDeduction, invoiceCharge } = await import("./gen/lib/cis.js");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const line = (description, quantity, unitPrice, kind, vatRate = "zero") => ({ description, quantity, unitPrice, vatRate, kind });
const draft = (lines, over = {}) => ({ ...defaultDraft(), lines, ...over });
const cisOn = (rate = 20) => ({ cis: { enabled: true, rate } });

// ---- The one that was wrong -------------------------------------------------
const DEPOSIT_LINES = [line("Timber and fixings", 1, 1000, "materials"), line("Fitting", 1, 300, "labour"), line("Less deposit paid", 1, -500, "labour")];
const deposit = computeDraftTotals(draft(DEPOSIT_LINES, cisOn()));
check("a deposit line bigger than the labour never makes a negative deduction", deposit.cisDeduction === 0, JSON.stringify({ cis: deposit.cisDeduction, due: deposit.netPaymentDue }));
check("...so net payment due is the total, not more than it", deposit.netPaymentDue === deposit.total && deposit.total === 800, JSON.stringify({ due: deposit.netPaymentDue, total: deposit.total }));
// The app, given the same lines, has always got this right. That is the check
// that would have caught it: the two must answer the same.
check("...and the app, on the same lines, agrees", deposit.cisDeduction === cisDeduction(DEPOSIT_LINES, 20), `${deposit.cisDeduction} vs ${cisDeduction(DEPOSIT_LINES, 20)}`);

// ---- Ordinary CIS, which must not have changed ------------------------------
const PLAIN = [line("Materials", 1, 1000, "materials"), line("Labour", 1, 500, "labour")];
const plain = computeDraftTotals(draft(PLAIN, cisOn()));
check("20% is kept back from the labour and nothing else", plain.cisDeduction === 100, String(plain.cisDeduction));
check("...leaving the total less the deduction", plain.netPaymentDue === 1400 && plain.total === 1500, JSON.stringify({ due: plain.netPaymentDue, total: plain.total }));
const plain30 = computeDraftTotals(draft(PLAIN, cisOn(30)));
check("30% for an unregistered subcontractor", plain30.cisDeduction === 150, String(plain30.cisDeduction));
check("the free page and the app agree on an ordinary CIS invoice", plain.cisDeduction === cisDeduction(PLAIN, 20) && plain.netPaymentDue === invoiceCharge({ items: PLAIN, cisRate: 20 }, false).due, JSON.stringify({ page: plain.netPaymentDue, app: invoiceCharge({ items: PLAIN, cisRate: 20 }, false).due }));

// ---- The third kind of line, which the app's type did not have --------------
const OTHER = [line("Labour", 1, 400, "labour"), line("Congestion charge", 1, 100, "other")];
const other = computeDraftTotals(draft(OTHER, cisOn()));
check("an 'other' line is not labour and is not deducted from", other.cisDeduction === 80, String(other.cisDeduction));
check("...and the app agrees about it too", other.cisDeduction === cisDeduction(OTHER, 20), `${other.cisDeduction} vs ${cisDeduction(OTHER, 20)}`);

// ---- Pennies ----------------------------------------------------------------
const ODD = [line("Labour", 3, 11.11, "labour")];
const odd = computeDraftTotals(draft(ODD, cisOn()));
check("a deduction off an odd labour total is penny-exact", odd.cisDeduction === 6.67 && odd.cisDeduction === cisDeduction(ODD, 20), JSON.stringify({ cis: odd.cisDeduction, app: cisDeduction(ODD, 20) }));

// ---- A quote is not an invoice ---------------------------------------------
const quote = computeDraftTotals(draft(PLAIN, { ...cisOn(), docType: "quote" }));
check("a quote never deducts CIS, however the switch is set", quote.cisDeduction === 0 && quote.netPaymentDue === quote.total, JSON.stringify({ cis: quote.cisDeduction }));

// ---- No second copy of the rule --------------------------------------------
// The bug was a duplicate, so the absence of the duplicate is what to hold.
const src = fs.readFileSync(`${REPO}/web/src/lib/freeInvoiceDraft.ts`, "utf8");
check("the free page calls the app's deduction rather than doing its own sum", /cisDeductionOf\(lines, d\.cis\.rate\)/.test(src), "it has its own again");
check("...and does not compute a rate against labour anywhere itself", !/labourNet \* d\.cis\.rate/.test(src), "the old sum is back");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
