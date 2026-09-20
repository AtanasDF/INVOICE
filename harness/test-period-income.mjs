// The income figure on /expenses, and the two things it used to get wrong.
//
// It counted DRAFTS -- invoices written up in advance, sent to nobody, with
// no number -- so a quiet month could be made to look profitable by typing
// up next month's work, and the "Net" card showed money that did not exist.
//
// And it ignored CREDIT NOTES entirely. Invoice a customer £2,000, credit
// the whole lot back the same week, and the month still read £2,000.
//
// Every check below fails against the old `inv.items.reduce(...)` over
// every invoice.
import { incomeOf } from "./gen/lib/periodIncome.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const near = (a, b) => Math.abs(a - b) < 0.005;

const march = (d) => d >= "2026-03-01" && d <= "2026-03-31";
const anyDate = () => true;

const inv = (id, date, status, items, extra = {}) => ({
  id, clientId: "c", date, number: id, items, notes: "", dueDate: null,
  paymentTerms: "", status, tags: [], vatRegistered: null, cisRate: null, ...extra,
});
const line = (unitPrice, quantity = 1, vatRate = "standard", kind = undefined) => ({ quantity, unitPrice, vatRate, kind });
const credit = (id, invoiceId, date, amount) => ({ id, invoiceId, date, amount, reason: "" });

// --- drafts ------------------------------------------------------------
{
  const sent = inv("A", "2026-03-04", "sent", [line(1000)]);
  const draft = inv("B", "2026-03-05", "draft", [line(4000)]);
  check("a draft is not income", near(incomeOf([sent, draft], [], false, march), 1000), String(incomeOf([sent, draft], [], false, march)));
  check("a month of nothing but drafts is £0", near(incomeOf([draft], [], false, march), 0), String(incomeOf([draft], [], false, march)));
  check("a paid invoice still counts -- income is when it was issued, not when it was paid",
    near(incomeOf([inv("C", "2026-03-06", "paid", [line(700)])], [], false, march), 700));
}

// --- credit notes ------------------------------------------------------
{
  const a = inv("A", "2026-03-04", "sent", [line(2000)]);
  check("a credit note takes its value off", near(incomeOf([a], [credit("x", "A", "2026-03-06", 500)], false, march), 1500),
    String(incomeOf([a], [credit("x", "A", "2026-03-06", 500)], false, march)));
  check("credited in full leaves nothing", near(incomeOf([a], [credit("x", "A", "2026-03-06", 2000)], false, march), 0));
  check("a credit note bigger than the invoice can't make income negative",
    near(incomeOf([a], [credit("x", "A", "2026-03-06", 9000)], false, march), 0),
    String(incomeOf([a], [credit("x", "A", "2026-03-06", 9000)], false, march)));
  check("two credit notes that together exceed the invoice still only cancel it once",
    near(incomeOf([a], [credit("x", "A", "2026-03-06", 1500), credit("y", "A", "2026-03-09", 1500)], false, march), 0));
  check("a credit note against a draft is ignored, like the draft itself",
    near(incomeOf([inv("D", "2026-03-04", "draft", [line(800)])], [credit("x", "D", "2026-03-05", 800)], false, march), 0));
  check("a credit note against an invoice that isn't there is ignored, not a crash",
    near(incomeOf([a], [credit("x", "GONE", "2026-03-06", 500)], false, march), 2000));
}

// --- periods -----------------------------------------------------------
{
  const feb = inv("A", "2026-02-20", "sent", [line(1000)]);
  const creditedInMarch = credit("x", "A", "2026-03-02", 1000);
  check("a credit note in this month comes off this month, even for last month's invoice",
    near(incomeOf([feb], [creditedInMarch], false, march), -1000),
    String(incomeOf([feb], [creditedInMarch], false, march)));

  // The reason the cap is accumulated over EVERY note and not just the
  // ones in view: capping per period would let each month believe it was
  // the first to credit the invoice.
  const a = inv("A", "2026-01-10", "sent", [line(1000)]);
  const notes = [credit("x", "A", "2026-02-01", 1000), credit("y", "A", "2026-03-01", 1000)];
  check("an invoice credited in full twice, in two months, only comes off once",
    near(incomeOf([a], notes, false, march), 0), String(incomeOf([a], notes, false, march)));
  check("...and it was the FIRST note that used the invoice up",
    near(incomeOf([a], notes, false, (d) => d >= "2026-02-01" && d <= "2026-02-28"), -1000));
}

// --- VAT and CIS -------------------------------------------------------
{
  const vatInv = inv("A", "2026-03-04", "sent", [line(1000)], { vatRegistered: true });
  check("income is the net, not the £1,200 the customer paid", near(incomeOf([vatInv], [], true, march), 1000),
    String(incomeOf([vatInv], [], true, march)));
  check("£600 credited off a £1,200 gross invoice is half the work, so £500 of income",
    near(incomeOf([vatInv], [credit("x", "A", "2026-03-06", 600)], true, march), 500),
    String(incomeOf([vatInv], [credit("x", "A", "2026-03-06", 600)], true, march)));

  // An invoice remembers what it was issued under (migration-024), so
  // registering for VAT doesn't rewrite last year's income.
  const oldInv = inv("B", "2026-03-04", "sent", [line(1000)], { vatRegistered: false });
  check("an invoice issued before registering keeps its own VAT setting",
    near(incomeOf([oldInv], [], true, march), 1000));

  // CIS is tax the contractor pays on his behalf, not a discount: turnover
  // is the total, the deduction shows up on the tax card instead.
  const cisInv = inv("C", "2026-03-04", "sent", [line(1000, 1, "standard", "labour")], { cisRate: 20, vatRegistered: false });
  check("CIS kept back doesn't reduce turnover", near(incomeOf([cisInv], [], false, march), 1000),
    String(incomeOf([cisInv], [], false, march)));
  // A credit note's amount is the value of the work credited, before CIS
  // (see creditOffDue in cis.ts), so £400 off a £1,000 invoice is 40% of
  // the work -- NOT 40% of the £800 the contractor actually pays.
  check("a credit note on a CIS invoice is a share of the work, not of what was paid",
    near(incomeOf([cisInv], [credit("x", "C", "2026-03-06", 400)], false, march), 600),
    String(incomeOf([cisInv], [credit("x", "C", "2026-03-06", 400)], false, march)));
}

// --- nothing at all ----------------------------------------------------
check("no invoices is £0, not NaN", incomeOf([], [], false, anyDate) === 0, String(incomeOf([], [], false, anyDate)));
check("a £0 invoice doesn't divide by zero", near(incomeOf([inv("Z", "2026-03-01", "sent", [line(0)])], [credit("x", "Z", "2026-03-02", 0)], false, march), 0));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
