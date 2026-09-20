// The tax figures, against HMRC's own rules for 2026/27 worked out by
// hand. This is the number he'll set money aside on, so every band, the
// £100k taper, the 60% trap, Class 4 and a loss all have to come out right.
import { class4, estimateTax, incomeTax, nextSelfAssessmentDate, selfAssessmentNotice, taxYearOf, yearBillDue } from "./gen/lib/taxEstimate.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const near = (a, b) => Math.abs(a - b) < 0.5;

// Income tax: 12,570 free, 20% to 50,270, 40% to 125,140, 45% above.
check("no tax on nothing, and none on a loss", incomeTax(0) === 0 && incomeTax(-5000) === 0);
check("no tax up to the personal allowance", incomeTax(12570) === 0);
check("£20,000 profit is £1,486", near(incomeTax(20000), 1486), String(incomeTax(20000)));
check("£50,270 profit is £7,540 — the whole basic band", near(incomeTax(50270), 7540), String(incomeTax(50270)));
check("£60,000 profit is £11,432", near(incomeTax(60000), 11432), String(incomeTax(60000)));
check("£125,140 profit is £42,516, with the allowance fully tapered", near(incomeTax(125140), 42516), String(incomeTax(125140)));
check("£150,000 profit is £53,703, including 45% on the top", near(incomeTax(150000), 53703), String(incomeTax(150000)));

// The taper between £100k and £125,140 costs 60p in the pound.
const extra = incomeTax(110100) - incomeTax(110000);
check("every £100 over £100,000 costs £60 until the allowance is gone", near(extra, 60), String(Math.round(extra * 100) / 100));
check("the allowance is exactly half-gone at £112,570", near(incomeTax(112570) - incomeTax(112470), 60), String(incomeTax(112570)));

// Class 4 National Insurance: 6% between 12,570 and 50,270, 2% above.
check("no Class 4 under the threshold", class4(12570) === 0 && class4(5000) === 0);
check("£20,000 profit is £445.80 of Class 4", near(class4(20000), 445.8), String(class4(20000)));
check("£50,270 profit is £2,262", near(class4(50270), 2262), String(class4(50270)));
check("£60,000 profit is £2,456.60 — 2% on the top slice", near(class4(60000), 2456.6), String(class4(60000)));

// The tax year runs 6 April to 5 April.
check("5 April is still the old tax year", taxYearOf("2026-04-05").label === "2025/26", taxYearOf("2026-04-05").label);
check("6 April starts the new one", taxYearOf("2026-04-06").label === "2026/27", taxYearOf("2026-04-06").label);
check("the year's dates are right", taxYearOf("2026-09-20").start === "2026-04-06" && taxYearOf("2026-09-20").end === "2027-04-05");
check("the bill lands on 31 January after the year ends", yearBillDue(taxYearOf("2026-09-20")) === "2028-01-31", yearBillDue(taxYearOf("2026-09-20")));

// Self Assessment dates.
check("in September the next date is 31 January", nextSelfAssessmentDate("2026-09-20").date === "2027-01-31", nextSelfAssessmentDate("2026-09-20").date);
check("on 31 January it is still that day", nextSelfAssessmentDate("2026-01-31").date === "2026-01-31");
check("in February the next date is 31 July", nextSelfAssessmentDate("2026-02-01").date === "2026-07-31");
check("it says which year's return is due", /2024\/25 return/.test(nextSelfAssessmentDate("2026-01-31").what), nextSelfAssessmentDate("2026-01-31").what);
check("the warning comes exactly 14 days before", !!selfAssessmentNotice("2026-01-17") && !selfAssessmentNotice("2026-01-16") && !selfAssessmentNotice("2026-01-18"));

// The whole estimate, from invoices and receipts.
const inv = (o) => ({ id: o.id, clientId: "c", date: o.date, number: o.number ?? "INV-1", items: o.items, notes: "", dueDate: null, paymentTerms: "", status: o.status ?? "sent", tags: [], vatRegistered: true, cisRate: o.cisRate ?? null });
const rec = (o) => ({ id: o.id, clientId: null, date: o.date, vendor: "Supplier", category: "Supplies", amount: o.amount, vatAmount: o.vat ?? 0, imageDataUrl: null, notes: "", starred: false, needsReview: o.needsReview ?? false, warrantyMonths: null, tags: [], lineItems: [], documentType: "receipt", invoiceNumber: null, dueDate: null, paid: true, details: {}, creditOfReceiptId: null, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null });
const line = (net) => [{ description: "Work", quantity: 1, unitPrice: net, vatRate: "standard" }];

const base = { creditNotes: [], vatRegistered: true, today: "2026-09-20" };
const simple = estimateTax({ ...base, invoices: [inv({ id: "1", date: "2026-05-01", items: line(40000) })], receipts: [rec({ id: "r1", date: "2026-05-02", amount: 10000 })] });
check("income is the net of issued invoices", near(simple.income, 40000), String(simple.income));
check("expenses are the net of checked receipts", near(simple.expenses, 10000), String(simple.expenses));
check("profit is income less expenses", near(simple.profit, 30000), String(simple.profit));
// Deliberately not incomeTax(profit so far): the year's allowance and bands
// belong to the whole year, so the figure is the share of the year's tax
// built up so far, the year taken to carry on at this rate. Tax on the
// profit so far with a full year's allowance would understate it badly, and
// would make CIS look like a refund every spring.
const days = Math.round((Date.parse("2026-09-20") - Date.parse("2026-04-06")) / 86400000) + 1;
const share = days / 365;
check("the tax so far is the year's tax at this rate, times the year gone", near(simple.incomeTax, incomeTax(30000 / share) * share) && near(simple.class4, class4(30000 / share) * share), JSON.stringify({ shown: simple.incomeTax, expected: Math.round(incomeTax(30000 / share) * share * 100) / 100 }));
check("and that is more than a full year's allowance would suggest", simple.incomeTax > incomeTax(30000) * share, `${simple.incomeTax} vs ${Math.round(incomeTax(30000) * share * 100) / 100}`);
check("the projection is the whole year at this rate", near(simple.projected.profit, 30000 / share) && near(simple.projected.total, incomeTax(30000 / share) + class4(30000 / share)), JSON.stringify(simple.projected));

const draftIgnored = estimateTax({ ...base, invoices: [inv({ id: "1", date: "2026-05-01", items: line(40000), status: "draft" })], receipts: [] });
check("a draft invoice is not income", draftIgnored.income === 0 && draftIgnored.invoicesCounted === 0);
const lastYear = estimateTax({ ...base, invoices: [inv({ id: "1", date: "2026-04-05", items: line(40000) })], receipts: [] });
check("an invoice from the last tax year is left out", lastYear.income === 0, String(lastYear.income));
const unchecked = estimateTax({ ...base, invoices: [], receipts: [rec({ id: "r1", date: "2026-05-02", amount: 500, needsReview: true })] });
check("a receipt still waiting to be checked doesn't count yet", unchecked.expenses === 0, String(unchecked.expenses));

// A loss: no tax, nothing to set aside, and never a negative bill.
const loss = estimateTax({ ...base, invoices: [inv({ id: "1", date: "2026-05-01", items: line(5000) })], receipts: [rec({ id: "r1", date: "2026-05-02", amount: 9000 })] });
check("a loss means no tax", loss.incomeTax === 0 && loss.class4 === 0 && loss.total === 0, JSON.stringify({ profit: loss.profit, total: loss.total }));
check("a loss is shown as a loss, not as zero profit", loss.profit < 0, String(loss.profit));

// CIS already kept back is tax paid: it comes off what's left to set aside.
const cis = estimateTax({ ...base, invoices: [inv({ id: "1", date: "2026-05-01", items: [{ description: "Labour", quantity: 1, unitPrice: 40000, vatRate: "standard", kind: "labour" }], cisRate: 20 })], receipts: [] });
check("CIS kept back is counted as tax already paid", near(cis.cisDeducted, 8000), String(cis.cisDeducted));
check("what's left to set aside is the bill less the CIS", near(cis.setAside, cis.total - cis.cisDeducted), JSON.stringify({ total: cis.total, cis: cis.cisDeducted, setAside: cis.setAside }));

// The first month of a tax year has nothing to project from.
const firstMonth = estimateTax({ ...base, today: "2026-04-20", invoices: [inv({ id: "1", date: "2026-04-10", items: line(5000) })], receipts: [] });
check("no projection in the first month — it would be noise", firstMonth.projected === null);
const midYear = estimateTax({ ...base, invoices: [inv({ id: "1", date: "2026-05-01", items: line(40000) })], receipts: [] });
check("mid-year there is a projection, and it's bigger than the year so far", midYear.projected !== null && midYear.projected.profit > midYear.profit, JSON.stringify(midYear.projected));

// Early in a tax year, annualising a few days' work makes the headline
// meaningless -- one £5,000 invoice on 6 April used to ask him to set aside
// £2,316 when the real tax on £5,000 a year is nothing.
const early = estimateTax({ ...base, today: "2026-04-08", invoices: [inv({ id: "1", date: "2026-04-06", items: line(5000) })], receipts: [] });
check("the first days of the year are marked too early to estimate", early.tooEarly === true, JSON.stringify({ tooEarly: early.tooEarly, setAside: early.setAside }));
check("but the real figures are still there", near(early.income, 5000) && near(early.profit, 5000), JSON.stringify({ income: early.income, profit: early.profit }));
const later = estimateTax({ ...base, today: "2026-06-06", invoices: [inv({ id: "1", date: "2026-04-06", items: line(5000) })], receipts: [] });
check("a couple of months in, it estimates again", later.tooEarly === false, String(later.tooEarly));
check("and the estimate is sane by then", later.total < 5000 && later.total >= 0, String(later.total));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
