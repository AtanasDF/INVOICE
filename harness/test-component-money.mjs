// Money and dates that used to be worked out inside a page, one check per
// finding in section 7 of notes/audit-components.md. Each had its own copy of
// the maths in a component, so no logic suite could reach it; the maths now
// lives in src/lib and is tested here, and the source checks at the foot make
// sure the pages go on calling it rather than growing their own copy again.
import fs from "node:fs";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const { amountOrNull, roundMoney } = await import("./gen/lib/money.js");
const { gbpFigures, receiptGbp, rateAfterReview } = await import("./gen/lib/receiptAmounts.js");
const { weekOf, spendByCategory } = await import("./gen/lib/expensePeriod.js");
const { dayOf, shortDate } = await import("./gen/lib/dates.js");
const { longDate } = await import("./gen/lib/companyReport.js");

const pennies = (n) => Number.isInteger(Math.round(n * 1e6) / 1e4);

// --- what a receipt costs in pounds --------------------------------------
const gbp = receiptGbp("19.99", "3.33", "GBP", "");
check("£19.99 with £3.33 VAT is stored as 16.66, not 16.659999999999997", gbp.netGbp === 16.66 && gbp.vatGbp === 3.33, JSON.stringify(gbp));
check("a GBP receipt keeps no original figures", gbp.originalAmount === null && gbp.fxRate === null);
const typed = receiptGbp("1,200.00", "200.00", "GBP", "");
check('"1,200.00" typed in the total is 1200, not 1', typed.netGbp === 1000 && typed.vatGbp === 200, JSON.stringify(typed));
check('a decimal comma "12,50" is 12.50', receiptGbp("12,50", "", "GBP", "").netGbp === 12.5);
check("a £ sign in the box is ignored", receiptGbp("£24.00", "£4.00", "GBP", "").netGbp === 20);

const eur = receiptGbp("19.99", "3.33", "EUR", "0.8567");
check("EUR 19.99 at 0.8567 is whole pennies", pennies(eur.netGbp) && pennies(eur.vatGbp), JSON.stringify(eur));
check("converted net plus VAT is exactly the converted total", Math.round((eur.netGbp + eur.vatGbp) * 100) === Math.round(19.99 * 0.8567 * 100), JSON.stringify(eur));
check("the original figures and rate are kept beside it", eur.originalAmount === 19.99 && eur.originalVatAmount === 3.33 && eur.originalCurrency === "EUR" && eur.fxRate === 0.8567);

const credit = receiptGbp("12.00", "2.00", "GBP", "", true);
check("a credit note is stored negative", credit.netGbp === -10 && credit.vatGbp === -2, JSON.stringify(credit));
check("VAT above the total never makes a negative expense", receiptGbp("5", "6", "GBP", "").netGbp === 0);

const many = Array.from({ length: 200 }, (_, i) => gbpFigures(1 + i * 0.37, (1 + i * 0.37) / 6, 0.8571));
check("200 awkward conversions are all whole pennies", many.every((g) => pennies(g.netGbp) && pennies(g.vatGbp)));

// --- review queue correction ---------------------------------------------
const stored = { amount: 71.67, vatAmount: 14.33, fxRate: 0.86 };
check("approving the converted pounds unchanged keeps the rate", rateAfterReview(stored, { netGbp: 71.67, vatGbp: 14.33 }) === 0.86);
check("correcting the pounds drops the rate, so a later Edit can't put the old conversion back", rateAfterReview(stored, { netGbp: 75, vatGbp: 15 }) === null);
check("a row that never had a rate stays without one", rateAfterReview({ amount: 1, vatAmount: 0, fxRate: null }, { netGbp: 1, vatGbp: 0 }) === null);
check("float noise in the stored figure is not a correction", rateAfterReview({ amount: 16.659999999999997, vatAmount: 3.33, fxRate: 0.9 }, { netGbp: 16.66, vatGbp: 3.33 }) === 0.9);

// --- a line on the scan page ---------------------------------------------
check("0.5 x £0.35 is £0.18, as the document says", roundMoney(0.5 * 0.35) === 0.18, String(roundMoney(0.5 * 0.35)));
check("1.005 rounds to 1.01", roundMoney(1.005) === 1.01);
check("amountOrNull refuses words", amountOrNull("12.50 per length") === null && amountOrNull("") === null);

// --- the Expenses week ----------------------------------------------------
check("a Wednesday's week runs Monday to Sunday", JSON.stringify(weekOf("2026-10-14", "2026-01-01")) === JSON.stringify({ start: "2026-10-12", end: "2026-10-18" }));
check("a Sunday belongs to the week before it", weekOf("2026-10-18", "2026-01-01").start === "2026-10-12");
let threw = null;
try { weekOf("", "2026-10-19"); } catch (e) { threw = e; }
check("a cleared date box does not throw (it took the whole page down)", threw === null, String(threw));
check("a cleared date box shows this week", weekOf("", "2026-10-19").start === "2026-10-19" && weekOf("", "2026-10-19").end === "2026-10-25");
check("a nonsense day shows this week too", weekOf("2026-13-45", "2026-10-21").start === "2026-10-19");

// --- spend split by category ---------------------------------------------
const three = { amount: 10, vatAmount: 2, category: "Other", lineItems: [
  { quantity: 1, unitPrice: 1, category: "Fuel" }, { quantity: 1, unitPrice: 1, category: "Tools" }, { quantity: 1, unitPrice: 1, category: "Food" }] };
const split = spendByCategory([three]);
const sumOf = (rows, k) => Math.round(rows.reduce((s, [, v]) => s + v[k] * 100, 0));
check("£10.00 in three equal lines adds back to £10.00, not £9.99", sumOf(split, "total") === 1000, JSON.stringify(split));
check("and its £2.00 VAT adds back to £2.00", sumOf(split, "vat") === 200, JSON.stringify(split));
check("every share is whole pennies", split.every(([, v]) => pennies(v.total) && pennies(v.vat)));
check("the shares are 3.34, 3.33, 3.33", JSON.stringify(split.map(([, v]) => v.total).sort()) === JSON.stringify([3.33, 3.33, 3.34]));
const mixed = spendByCategory([three, { amount: 5, vatAmount: 1, category: "Fuel", lineItems: [] },
  { amount: -4, vatAmount: -0.8, category: "Tools", lineItems: [] },
  { amount: 7.77, vatAmount: 1.55, category: "Other", lineItems: [{ quantity: 3, unitPrice: 1.11, category: null }, { quantity: 1, unitPrice: 4.44, category: "Fuel" }] }]);
check("several receipts, a credit and an unlined one still add back exactly", sumOf(mixed, "total") === 1000 + 500 - 400 + 777 && sumOf(mixed, "vat") === 200 + 100 - 80 + 155, JSON.stringify(mixed));
check("an uncategorised line falls to the receipt's category", mixed.some(([c]) => c === "Other"));
check("largest first", mixed.every(([, v], i) => i === 0 || mixed[i - 1][1].total >= v.total));

// --- a moment is a London day --------------------------------------------
check("a plain date is left alone", dayOf("2026-07-01") === "2026-07-01");
check("00:30 BST on 1 July (23:30 UTC on 30 June) is 1 July", dayOf("2026-06-30T23:30:00.000Z") === "2026-07-01");
check("a quote request asked at 00:30 BST says it was asked that day", shortDate("2026-06-30T23:30:00+00:00") === "1 Jul 2026", shortDate("2026-06-30T23:30:00+00:00"));
check("in winter London is UTC", shortDate("2026-12-31T23:30:00Z") === "31 Dec 2026");
check("a company check at 00:30 BST is read that day", longDate("2026-06-30T23:30:00.000Z") === "1 July 2026", longDate("2026-06-30T23:30:00.000Z"));
check("a register date is still the date it says", longDate("2001-03-04") === "4 March 2001");
check("an empty one is empty", longDate(null) === "" && longDate("") === "");

// --- a CIS invoice after a credit note (worst one 4) ----------------------
const { cisAfterCredit, creditOffDue } = await import("./gen/lib/cis.js");
const charge = { total: 100, cis: 10, due: 90 };
const shownCis = cisAfterCredit(charge, 4.25);
const dueAfter = Math.round((charge.due - creditOffDue(charge, 4.25)) * 100);
check("£100, £10 CIS, £4.25 credit: Total - CIS - credit is the amount due (it was a penny out)", Math.round((100 - shownCis - 4.25) * 100) === dueAfter, `${shownCis} ${dueAfter}`);
check("no credit, the whole CIS", cisAfterCredit(charge, 0) === 10);
check("credited in full, no CIS left", cisAfterCredit(charge, 100) === 0);
check("over-credited never prints a negative CIS", cisAfterCredit(charge, 150) === 0);
let worst = 0;
for (let c = 1; c < 10000; c += 7) {
  const cr = c / 100;
  const left = Math.round((100 - cisAfterCredit(charge, cr) - cr) * 100) - Math.round((charge.due - creditOffDue(charge, cr)) * 100);
  if (cr < 100) worst = Math.max(worst, Math.abs(left));
}
check("every credit from 1p to £99.99 adds up to the penny", worst === 0, String(worst));
check("the invoice sheet takes its CIS line from cisAfterCredit", /const cisShown = cisAfterCredit\(totals, creditNoteTotal\)/.test(fs.readFileSync(`${REPO}/web/src/components/invoice/IssuedInvoice.tsx`, "utf8")));

// --- the pages call the lib, not a copy of their own ---------------------
const src = (f) => fs.readFileSync(`${REPO}/web/src/${f}`, "utf8").replace(/\/\/[^\n]*/g, "");
for (const f of ["app/receipts/page.tsx", "app/receipts/new/page.tsx", "app/scan/page.tsx", "app/receipts/review/page.tsx", "app/recurring/page.tsx"]) {
  const s = src(f);
  check(`${f} reads typed money without parseFloat`, !/parseFloat\(\s*(draft\.|f\.|form\.)?(totalAmount|vatAmount)/.test(s), (s.match(/parseFloat\([^)]*\)/g) ?? []).join(", "));
  check(`${f} goes through receiptGbp`, /receiptGbp\(/.test(s));
}
check("the review queue decides the rate through rateAfterReview", /fxRate:\s*rateAfterReview\(/.test(src("app/receipts/review/page.tsx")));
const ingest = src("app/api/inbox/ingest/route.ts");
check("the email import has no conversion of its own", !/function convertToGbp/.test(ingest) && /gbpFigures\(/.test(ingest) && !/Math\.max\(0,\s*total - vat\)/.test(ingest));
const expenses = src("app/expenses/page.tsx");
check("Expenses works out weeks and splits in lib", /weekOf\(/.test(expenses) && /spendByCategory\(/.test(expenses) && !/new Date\(dateStr\)/.test(expenses) && !/\* share/.test(expenses));
const lines = src("components/scan/LineItemsTable.tsx");
check("a scan line total is rounded to the penny before it is shown", /roundMoney\(/.test(lines) && !/parseFloat/.test(lines));
check("the scan page saves its lines through amountOrNull", !/parseFloat/.test(src("app/scan/page.tsx")));
check("shortDate turns a timestamp into its London day", /ukDate/.test(src("lib/dates.ts")));
const quotes = src("app/quotes/page.tsx");
check("the quotes list no longer claims to know when a quote was sent", !/sent \{days\(/.test(quotes) && /dated \{days\(/.test(quotes));

check("quotes print money through the app's one formatter (it printed \"£-50.00\")", /import \{ money \} from "@\/lib\/money"/.test(src("components/quote/QuoteDocument.tsx")) && !/export const money =/.test(src("components/quote/QuoteDocument.tsx")));

const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
