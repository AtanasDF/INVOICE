// The other three money paths, attacked the way test-money-invariants
// attacks invoices and deposits: by generating thousands of cases and
// asserting what must be true of EVERY one of them, not of a chosen example.
//
//   - a customer's statement (statement.ts): the document that states the
//     account, so every figure on it must reconcile with every other;
//   - the VAT return (vatReturn.ts): boxes 1/4/5/6/7 on both bases, which
//     must add up, must not depend on what else is lying about in the
//     account, and must agree with each other once all the money is in;
//   - comparing suppliers (quoteCompare.ts): the split order must never cost
//     more than the best single supplier, and must be the cheapest split
//     there is -- checked against a brute force that shares no code with it.
//
// Each section has its own seeded generator, so a failure is reproducible
// from the section, the seed and the case index printed beside it.
import { computeInvoiceTotals, VAT_RATES } from "./gen/lib/vat.js";
import { invoiceCharge, creditOffDue } from "./gen/lib/cis.js";
import { invoiceVat } from "./gen/lib/invoiceBalance.js";
import { buildStatement } from "./gen/lib/statement.js";
import { vatFigures, quarterOf } from "./gen/lib/vatReturn.js";
import { cellFor, deliveryOf, supplierTotal, planFor, compare, isExpired } from "./gen/lib/quoteCompare.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

function generator(start) {
  let seed = start;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const money = (max = 5000) => Math.round(rnd() * max * 100) / 100;
  const qty = () => pick([1, 2, 3, 0.5, 1.5, 0.25, 7, 12, 100, 0.333]);
  const day = (from, span) => new Date(Date.parse(from) + int(0, span) * 86_400_000).toISOString().slice(0, 10);
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = int(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  return { rnd, pick, int, money, qty, day, shuffle };
}

const pence = (n) => Math.round(n * 100);
const whole = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const RATES = Object.keys(VAT_RATES);
const first = (a) => JSON.stringify(a.slice(0, 2));

function makeItems(g, n = g.int(1, 4)) {
  return Array.from({ length: n }, () => ({
    description: "x",
    quantity: g.qty(),
    unitPrice: g.money(g.pick([1, 50, 5000, 50000])),
    vatRate: g.pick(RATES),
    kind: g.pick(["labour", "materials", undefined]),
  }));
}

let uid = 0;
function makeInvoice(g, { date, status, vatRegistered } = {}) {
  return {
    id: `inv${++uid}`,
    clientId: "c1",
    date: date ?? g.day("2025-06-01", 600),
    number: `INV-${uid}`,
    items: makeItems(g),
    notes: "",
    dueDate: null,
    paymentTerms: "",
    status: status ?? g.pick(["draft", "sent", "sent", "partial", "paid"]),
    tags: [],
    vatRegistered: vatRegistered !== undefined ? vatRegistered : g.pick([null, true, false]),
    cisRate: g.pick([null, null, 20, 30]),
  };
}

// ---------------------------------------------------------------------------
// A customer's statement
// ---------------------------------------------------------------------------
// The statement is the one document whose job is to state the account, so
// it is held to exact pennies throughout: every figure on it is built from
// whole pence and nothing on it is a rounding of something else. No
// tolerance anywhere in this section, and none is needed -- a gap of a
// penny here is a bug, not rounding.
{
  const SEED = 20261018;
  const g = generator(SEED);
  const CASES = 2500;
  const TODAY = "2026-10-18";
  const broke = { pence: [], negative: [], both: [], line: [], legacy: [], account: [], sums: [], ageing: [], overdue: [], lateOwing: [], oldest: [], drafts: [], sorted: [], order: [], creditCap: [], ageBucket: [] };

  for (let i = 0; i < CASES; i++) {
    const at = (what, extra) => ({ seed: SEED, case: i, what, ...extra });
    const accountVat = g.pick([true, false]);
    const invoices = Array.from({ length: g.int(0, 6) }, () => {
      const inv = makeInvoice(g);
      // Random due dates almost never land a row exactly on an ageing
      // boundary, which is where an off-by-one lives, so a third are put
      // there on purpose.
      inv.dueDate = g.rnd() < 0.15 ? null : g.rnd() < 0.35 ? new Date(Date.parse(TODAY) - g.pick([0, 1, 30, 31, 60, 61]) * 86_400_000).toISOString().slice(0, 10) : g.day(inv.date, 90);
      return inv;
    });
    const notes = [];
    const payments = [];
    const faceOf = {};
    for (const inv of invoices) {
      const charge = invoiceCharge(inv, invoiceVat(inv, accountVat));
      faceOf[inv.id] = 0;
      for (let k = g.int(0, 2); k > 0; k--) {
        const amount = Math.round(Math.max(0, charge.total) * g.pick([0.1, 0.5, 1, 1.4, g.rnd()]) * 100) / 100;
        faceOf[inv.id] += amount;
        notes.push({ id: `cn${++uid}`, invoiceId: inv.id, date: g.day(inv.date, 60), amount, reason: "" });
      }
      // A "paid" invoice with no payments is the legacy shape: marked paid by
      // hand before payments were recorded (migration-023).
      const n = inv.status === "paid" && g.rnd() < 0.5 ? 0 : g.int(0, 3);
      for (let k = 0; k < n; k++) {
        const amount = Math.round(Math.max(0, charge.due) * g.pick([0.2, 0.5, 1, 1.3, g.rnd()]) * 100) / 100;
        payments.push({ id: `p${++uid}`, invoiceId: inv.id, date: g.day(inv.date, 90), amount, method: null, note: "" });
      }
    }
    // A statement is built for one customer, but the stores hand it every
    // credit note and payment on the account; ones for other invoices must
    // be ignored.
    notes.push({ id: "stray-cn", invoiceId: "elsewhere", date: "2026-01-01", amount: 999.99, reason: "" });
    payments.push({ id: "stray-p", invoiceId: "elsewhere", date: "2026-01-01", amount: 777.77, method: null, note: "" });

    const s = buildStatement(invoices, notes, payments, accountVat, TODAY);
    const issued = invoices.filter((inv) => inv.status !== "draft");
    const paidOn = (id) => payments.filter((p) => p.invoiceId === id).reduce((t, p) => t + p.amount, 0);

    // Drafts never appear; everything issued does, once.
    if (s.lines.length !== issued.length || s.lines.some((l) => !issued.find((inv) => inv.id === l.id))) broke.drafts.push(at("lines", { lines: s.lines.length, issued: issued.length }));

    let legacyNet = 0;
    for (const l of s.lines) {
      const inv = invoices.find((x) => x.id === l.id);
      const figures = [l.charged, l.credited, l.paid, l.balance, l.credit];
      if (!figures.every(whole)) broke.pence.push(at("line not whole pence", { l }));
      if (l.balance < 0 || l.credit < 0 || l.daysLate < 0) broke.negative.push(at("negative", { l }));
      // Owing and in credit at once is two contradictory statements on one
      // line.
      if (l.balance > 0 && l.credit > 0) broke.both.push(at("owing and in credit", { l }));
      // A credit note for no more than the invoice can never take more off
      // than is owed.
      if (faceOf[l.id] <= computeInvoiceTotals(inv.items, invoiceVat(inv, accountVat)).total && pence(l.credited) > pence(l.charged)) broke.creditCap.push(at("credited over charged", { l, face: faceOf[l.id] }));
      const legacy = inv.status === "paid" && paidOn(inv.id) === 0;
      const net = pence(l.charged) - pence(l.credited) - pence(l.paid);
      if (legacy) {
        // Settled years ago: owes nothing and is owed nothing, whatever the
        // credit notes say.
        if (l.balance !== 0 || l.credit !== 0) broke.legacy.push(at("legacy paid", { l }));
        legacyNet += net;
      } else if (net !== pence(l.balance) - pence(l.credit)) {
        // The four cells on the row subtract to the figure beside them.
        broke.line.push(at("row does not subtract", { l, net }));
      }
      if (l.daysLate > 0 && !(l.balance > 0 && l.dueDate && l.dueDate < TODAY)) broke.lateOwing.push(at("late but not owing or not due", { l }));
      if (l.balance > 0 && l.dueDate && l.dueDate < TODAY && l.daysLate !== Math.round((Date.parse(TODAY) - Date.parse(l.dueDate)) / 86_400_000)) broke.lateOwing.push(at("days late miscounted", { l }));
    }

    // The account's totals are exactly the sum of its rows.
    const sum = (f) => s.lines.reduce((t, l) => t + pence(f(l)), 0);
    const totals = [["outstanding", (l) => l.balance], ["inCredit", (l) => l.credit], ["charged", (l) => l.charged], ["paid", (l) => l.paid], ["credited", (l) => l.credited]];
    for (const [k, f] of totals) if (pence(s[k]) !== sum(f) || !whole(s[k]) || s[k] < 0) broke.sums.push(at(k, { stated: s[k], rows: sum(f) / 100 }));

    // And the account reconciles: charged less credited less paid is what is
    // owed less what is owed back -- with the legacy-paid invoices, which
    // owe nothing by rule, set aside.
    if (pence(s.charged) - pence(s.credited) - pence(s.paid) - legacyNet !== pence(s.outstanding) - pence(s.inCredit)) {
      broke.account.push(at("account does not reconcile", { charged: s.charged, credited: s.credited, paid: s.paid, outstanding: s.outstanding, inCredit: s.inCredit, legacyNet }));
    }

    // The ageing boxes are a split of what is owed: they add back up to it,
    // exactly, and none is negative.
    const a = s.ageing;
    if ([a.current, a.d30, a.d60, a.d90].some((v) => v < 0 || !whole(v)) || pence(a.current) + pence(a.d30) + pence(a.d60) + pence(a.d90) !== pence(s.outstanding)) broke.ageing.push(at("ageing", { a, outstanding: s.outstanding }));
    // Each box holds exactly the rows its name says.
    const box = (lo, hi) => s.lines.filter((l) => l.balance > 0 && l.daysLate >= lo && l.daysLate <= hi).reduce((t, l) => t + pence(l.balance), 0);
    if (pence(a.current) !== box(0, 0) || pence(a.d30) !== box(1, 30) || pence(a.d60) !== box(31, 60) || pence(a.d90) !== box(61, Infinity)) broke.ageBucket.push(at("bucket", { a }));
    // "Overdue" is the late boxes, and never more than is owed.
    if (pence(s.overdue) !== pence(a.d30) + pence(a.d60) + pence(a.d90) || s.overdue > s.outstanding) broke.overdue.push(at("overdue", { overdue: s.overdue, a }));

    // The oldest debt is the latest of the late ones, and there is one
    // exactly when something is overdue.
    const late = s.lines.filter((l) => l.daysLate > 0);
    if ((s.oldest === null) !== (s.overdue === 0) || (s.oldest && s.oldest.daysLate !== Math.max(...late.map((l) => l.daysLate)))) broke.oldest.push(at("oldest", { oldest: s.oldest, overdue: s.overdue }));

    for (let k = 1; k < s.lines.length; k++) if (s.lines[k - 1].date > s.lines[k].date) broke.sorted.push(at("not in date order"));

    // The order the database hands rows back in changes nothing.
    const again = buildStatement(g.shuffle(invoices), g.shuffle(notes), g.shuffle(payments), accountVat, TODAY);
    const pick = (x) => JSON.stringify([x.outstanding, x.inCredit, x.charged, x.paid, x.credited, x.overdue, x.ageing, x.oldest?.id ?? null, x.lines.map((l) => l.id).sort()]);
    if (pick(again) !== pick(s)) broke.order.push(at("input order changed the statement"));
  }

  check(`statement: drafts never appear, every issued invoice does (${CASES} accounts)`, broke.drafts.length === 0, first(broke.drafts));
  check("statement: every figure on every row is whole pence", broke.pence.length === 0, first(broke.pence));
  check("statement: nothing on a row is ever negative", broke.negative.length === 0, first(broke.negative));
  check("statement: no row is both owing and in credit", broke.both.length === 0, first(broke.both));
  check("statement: charged less credited less paid is owing less owed back, on every row, exactly", broke.line.length === 0, first(broke.line));
  check("statement: an invoice marked paid before payments existed owes nothing and is owed nothing", broke.legacy.length === 0, first(broke.legacy));
  check("statement: a credit note no bigger than its invoice never takes off more than is charged", broke.creditCap.length === 0, first(broke.creditCap));
  check("statement: every account total is exactly the sum of its rows", broke.sums.length === 0, first(broke.sums));
  check("statement: the account reconciles to the penny", broke.account.length === 0, first(broke.account));
  check("statement: the ageing boxes add up to what is owed, exactly", broke.ageing.length === 0, first(broke.ageing));
  check("statement: each ageing box holds exactly the rows its name says", broke.ageBucket.length === 0, first(broke.ageBucket));
  check("statement: overdue is the late boxes, and never more than is owed", broke.overdue.length === 0, first(broke.overdue));
  check("statement: only an owing row past its due date is late, by the right number of days", broke.lateOwing.length === 0, first(broke.lateOwing));
  check("statement: the oldest debt is the most overdue, and exists exactly when something is overdue", broke.oldest.length === 0, first(broke.oldest));
  check("statement: rows are in date order", broke.sorted.length === 0, first(broke.sorted));
  check("statement: the order rows arrive in changes nothing", broke.order.length === 0, first(broke.order));
}

// ---------------------------------------------------------------------------
// The VAT return, both bases
// ---------------------------------------------------------------------------
// HOW MUCH ROUNDING IS ALLOWED, and where. Most of this section is exact:
// box 5 is box 1 less box 4, the boxes are the sums of the lines beneath
// them, a sale's net and VAT add back to its gross, and on the invoice basis
// four quarters add up to the year -- each invoice is counted whole, once,
// in one period, so there is nothing to round twice.
//
// The cash basis is the exception. It splits each invoice's VAT across the
// quarters its payments land in, and each quarter rounds its share on its
// own, as a real return must. Measured, not assumed (2026-10-18): one-to-
// four-line invoices, unit prices to £50,000, quantities including 0.333,
// all six rates, CIS at none/20/30%, paid in full by one to four payments.
// 80,000 invoices over four seeds with the payments on random days of the
// year, then 250,000 over five more seeds with four payments forced into
// four different quarters. The four quarters' cash-basis box 1 against the
// invoice basis's: 0p on 199,500 of the 250,000, 1p on the rest, never more
// -- and the same 1p for the quarters against the year taken as one period.
// It does not grow with the money, the rates or the number of payments. A
// real error in the split (the CIS scaling dropped, a payment counted twice
// or missed) scales with the invoice and comes out pounds wrong: with the CIS
// scaling removed, the paid-in-full check below came out £828,750 wrong on
// its worst invoice.
const MAX_CASH_SPLIT_PENCE = 1;
// VAT on a sale can never be more than 20% of its net, the highest UK rate,
// give or take the rounding of each rate's VAT on the invoice and of the
// sale's share on the return. Measured over 399,411 sale lines (both bases,
// part-paid, four seeds, the invoices above): the worst a line's VAT came
// above 20% of its net was 0.8p, so a whole penny is allowed and no more.
const MAX_VAT_OVER_RATE_PENCE = 1;
{
  const SEED = 31415926;
  const g = generator(SEED);
  const CASES = 1500;
  const broke = { pence: [], box5: [], lines: [], purchases: [], basesPurchases: [], invoiceGross: [], invoiceVat: [], junk: [], order: [], quartersYear: [], unregistered: [], overRate: [] };
  let worstOverRate = -Infinity;

  const makeAccount = () => {
    const accountVat = g.pick([true, false]);
    const invoices = Array.from({ length: g.int(0, 8) }, () => makeInvoice(g));
    const notes = [];
    const payments = [];
    for (const inv of invoices) {
      const charge = invoiceCharge(inv, invoiceVat(inv, accountVat));
      for (let k = g.int(0, 2); k > 0; k--) notes.push({ id: `cn${++uid}`, invoiceId: inv.id, date: g.day(inv.date, 200), amount: Math.round(Math.max(0, charge.total) * g.pick([0.1, 0.5, 1, g.rnd()]) * 100) / 100, reason: "" });
      for (let k = g.int(0, 3); k > 0; k--) payments.push({ id: `p${++uid}`, invoiceId: inv.id, date: g.day(inv.date, 300), amount: Math.round(Math.max(0, charge.due) * g.pick([0.25, 0.5, 1, g.rnd()]) * 100) / 100, method: null, note: "" });
    }
    const receipts = Array.from({ length: g.int(0, 8) }, () => {
      const amount = g.money(g.pick([20, 2000])) * (g.rnd() < 0.15 ? -1 : 1);
      return { id: `r${++uid}`, clientId: "", date: g.day("2025-06-01", 600), vendor: "v", category: "c", amount, vatAmount: Math.round(amount * g.pick([0, 0, 0.05, 0.2]) * 100) / 100, needsReview: g.rnd() < 0.15 };
    });
    return { accountVat, invoices, notes, payments, receipts };
  };
  const figures = (acc, period, basis) => vatFigures(acc.invoices, acc.notes, acc.payments, acc.receipts, acc.accountVat, period, basis);
  const boxes = (f) => [f.box1, f.box4, f.box5, f.box6, f.box7].map(pence).join(",");
  const year = { from: "2026-01-01", to: "2026-12-31" };
  const quarters = ["2026-02-01", "2026-05-01", "2026-08-01", "2026-11-01"].map(quarterOf);

  for (let i = 0; i < CASES; i++) {
    const at = (what, extra) => ({ seed: SEED, case: i, what, ...extra });
    const acc = makeAccount();
    const period = quarterOf(g.day("2025-07-01", 540));
    const tot = (inv) => computeInvoiceTotals(inv.items, invoiceVat(inv, acc.accountVat));
    const inP = (d) => d >= period.from && d <= period.to;

    for (const basis of ["invoice", "cash"]) {
      const f = figures(acc, period, basis);
      const sum = (rows, k) => rows.reduce((t, r) => t + pence(r[k]), 0);
      if (![f.box1, f.box4, f.box5, f.box6, f.box7].every(whole)) broke.pence.push(at(`${basis}: box not whole pence`, { f }));
      if (pence(f.box5) !== pence(f.box1) - pence(f.box4)) broke.box5.push(at(`${basis}: box 5`, { f }));
      if (pence(f.box1) !== sum(f.sales, "vat") || pence(f.box6) !== sum(f.sales, "net") || pence(f.box4) !== sum(f.purchases, "vat") || pence(f.box7) !== sum(f.purchases, "net")) {
        broke.lines.push(at(`${basis}: boxes are not the sum of their lines`, { f }));
      }
      // Purchases are the receipts in the period that have been looked at,
      // whatever the basis.
      const counted = acc.receipts.filter((r) => !r.needsReview && inP(r.date));
      if (pence(f.box4) !== counted.reduce((t, r) => t + pence(r.vatAmount), 0) || pence(f.box7) !== counted.reduce((t, r) => t + pence(r.amount), 0)) broke.purchases.push(at(`${basis}: purchases`, { f }));

      // VAT on a sale is never more than the top rate allows of its net, and
      // an unregistered sale carries none at all.
      for (const s of f.sales) {
        const inv = acc.invoices.find((x) => x.id === s.id);
        if (!inv) continue;
        if (!invoiceVat(inv, acc.accountVat) && s.vat !== 0) broke.unregistered.push(at(`${basis}: VAT on an unregistered sale`, { s }));
        const over = pence(s.vat) - 0.2 * pence(s.net);
        worstOverRate = Math.max(worstOverRate, over);
        if (s.vat < 0 || over > MAX_VAT_OVER_RATE_PENCE) broke.overRate.push(at(`${basis}: VAT over 20% of net`, { s }));
      }

      // Drafts, receipts still waiting for review, and credit notes or
      // payments against invoices that do not exist change nothing.
      const junk = {
        ...acc,
        invoices: [...acc.invoices, { ...makeInvoice(g, { date: period.from, status: "draft" }), id: "draft-x" }],
        notes: [...acc.notes, { id: "cn-x", invoiceId: "draft-x", date: period.from, amount: 50, reason: "" }, { id: "cn-y", invoiceId: "nowhere", date: period.from, amount: 50, reason: "" }],
        payments: [...acc.payments, { id: "p-x", invoiceId: "draft-x", date: period.from, amount: 100, method: null, note: "" }, { id: "p-y", invoiceId: "nowhere", date: period.from, amount: 100, method: null, note: "" }],
        receipts: [...acc.receipts, { id: "r-x", clientId: "", date: period.from, vendor: "v", category: "c", amount: 100, vatAmount: 20, needsReview: true }],
      };
      if (boxes(figures(junk, period, basis)) !== boxes(f)) broke.junk.push(at(`${basis}: junk changed the boxes`));

      const shuffled = { ...acc, invoices: g.shuffle(acc.invoices), notes: g.shuffle(acc.notes), payments: g.shuffle(acc.payments), receipts: g.shuffle(acc.receipts) };
      if (boxes(figures(shuffled, period, basis)) !== boxes(f)) broke.order.push(at(`${basis}: input order changed the boxes`));
    }

    const inv = figures(acc, period, "invoice");
    const cash = figures(acc, period, "cash");
    if (pence(inv.box4) !== pence(cash.box4) || pence(inv.box7) !== pence(cash.box7)) broke.basesPurchases.push(at("purchases differ between bases"));

    // On the invoice basis the sales boxes together are exactly the gross of
    // the invoices issued in the period less the credit notes raised in it.
    const counted = acc.invoices.filter((x) => x.status !== "draft" && tot(x).total > 0);
    const gross = counted.filter((x) => inP(x.date)).reduce((t, x) => t + pence(tot(x).total), 0)
      - acc.notes.filter((n) => inP(n.date) && n.amount > 0 && counted.find((x) => x.id === n.invoiceId)).reduce((t, n) => t + pence(n.amount), 0);
    if (pence(inv.box1) + pence(inv.box6) !== gross) broke.invoiceGross.push(at("invoice basis gross", { box1: inv.box1, box6: inv.box6, gross: gross / 100 }));
    // ...and with no credit notes in the period, box 1 is exactly the VAT
    // printed on those invoices.
    if (!acc.notes.some((n) => inP(n.date))) {
      const printed = counted.filter((x) => inP(x.date)).reduce((t, x) => t + pence(tot(x).totalVat), 0);
      if (pence(inv.box1) !== printed) broke.invoiceVat.push(at("invoice basis box 1", { box1: inv.box1, printed: printed / 100 }));
    }

    // Four quarters are the year. Exact on the invoice basis; on the cash
    // basis each invoice may round its quarters' shares a penny differently.
    for (const basis of ["invoice", "cash"]) {
      const whole = figures(acc, year, basis);
      const qs = quarters.map((q) => figures(acc, q, basis));
      const tol = basis === "invoice" ? 0 : MAX_CASH_SPLIT_PENCE * acc.invoices.length;
      for (const k of ["box1", "box4", "box6", "box7"]) {
        const gap = Math.abs(qs.reduce((t, q) => t + pence(q[k]), 0) - pence(whole[k]));
        if (gap > (k === "box4" || k === "box7" ? 0 : tol)) broke.quartersYear.push(at(`${basis}: quarters do not add to the year in ${k}`, { gap, tol }));
      }
    }
  }

  check(`VAT: every box is whole pence, both bases (${CASES} accounts)`, broke.pence.length === 0, first(broke.pence));
  check("VAT: box 5 is box 1 less box 4, exactly", broke.box5.length === 0, first(broke.box5));
  check("VAT: boxes 1, 4, 6 and 7 are exactly the sums of the lines listed under them", broke.lines.length === 0, first(broke.lines));
  check("VAT: boxes 4 and 7 are the reviewed receipts in the period, exactly", broke.purchases.length === 0, first(broke.purchases));
  check("VAT: purchases are the same on both bases", broke.basesPurchases.length === 0, first(broke.basesPurchases));
  check("VAT: invoice basis, boxes 1 + 6 are the period's invoices less its credit notes, exactly", broke.invoiceGross.length === 0, first(broke.invoiceGross));
  check("VAT: invoice basis, box 1 is the VAT printed on the period's invoices", broke.invoiceVat.length === 0, first(broke.invoiceVat));
  check("VAT: an unregistered sale carries no VAT", broke.unregistered.length === 0, first(broke.unregistered));
  check(`VAT: no sale's VAT is more than 20% of its net, beyond ${MAX_VAT_OVER_RATE_PENCE}p of rounding`, broke.overRate.length === 0 && worstOverRate <= MAX_VAT_OVER_RATE_PENCE, JSON.stringify({ worstOverRate, cases: broke.overRate.slice(0, 2) }));
  check("VAT: drafts, unreviewed receipts and orphaned notes or payments change nothing", broke.junk.length === 0, first(broke.junk));
  check("VAT: the order rows arrive in changes nothing", broke.order.length === 0, first(broke.order));
  check(`VAT: four quarters add up to the year (exact on invoice basis, ${MAX_CASH_SPLIT_PENCE}p an invoice on cash)`, broke.quartersYear.length === 0, first(broke.quartersYear));
}

// One invoice at a time, so what each basis declares about it can be judged
// on its own: the cash basis must never declare more than the invoice
// carries, never reclaim VAT on money that never arrived, and -- once every
// penny is in -- must have declared the same as the invoice basis did.
{
  const SEED = 27182818;
  const g = generator(SEED);
  const CASES = 3000;
  const ALL_TIME = { from: "2000-01-01", to: "2099-12-31" };
  const quarters = ["2026-02-01", "2026-05-01", "2026-08-01", "2026-11-01"].map(quarterOf);
  const broke = { overDeclared: [], negative: [], unpaid: [], paidMatches: [], heldBack: [], quarters: [] };
  let worstPaid = 0;

  for (let i = 0; i < CASES; i++) {
    const inv = makeInvoice(g, { date: g.day("2026-01-01", 120), status: g.pick(["sent", "partial", "paid"]), vatRegistered: true });
    const charge = invoiceCharge(inv, true);
    const totals = computeInvoiceTotals(inv.items, true);
    if (totals.total <= 0 || charge.due <= 0) continue;
    const at = (what, extra) => ({ seed: SEED, case: i, what, total: totals.total, due: charge.due, cis: inv.cisRate, ...extra });
    // Credit notes no bigger, between them, than the invoice.
    const notes = [];
    let left = pence(totals.total);
    for (let k = g.int(0, 2); k > 0; k--) {
      const a = Math.floor(g.rnd() * left);
      left -= a;
      notes.push({ id: `cn${++uid}`, invoiceId: inv.id, date: g.day(inv.date, 200), amount: a / 100, reason: "" });
    }
    // Payments that together are some, all or none of what is due.
    const share = g.pick([0, 0.3, 1, 1, g.rnd()]);
    let owed = Math.round(pence(charge.due) * share);
    const payments = [];
    const n = owed ? g.int(1, 4) : 0;
    for (let k = 0; k < n; k++) {
      const a = k === n - 1 ? owed : Math.floor(g.rnd() * owed);
      owed -= a;
      payments.push({ id: `p${++uid}`, invoiceId: inv.id, date: quarters[Math.min(3, k + g.int(0, 1))].from, amount: a / 100, method: null, note: "" });
    }
    const paidAll = payments.reduce((t, p) => t + pence(p.amount), 0) === pence(charge.due);

    const cash = vatFigures([inv], notes, payments, [], true, ALL_TIME, "cash");
    const invoice = vatFigures([inv], notes, payments, [], true, ALL_TIME, "invoice");
    // Never more than the invoice's own VAT, and never below nothing: a
    // credit note can reverse what was declared, not more.
    if (pence(cash.box1) > pence(totals.totalVat)) broke.overDeclared.push(at("cash declared more than the invoice", { box1: cash.box1, vat: totals.totalVat }));
    if (cash.box1 < 0 || cash.box6 < 0) broke.negative.push(at("cash went below nothing", { box1: cash.box1, box6: cash.box6 }));
    // Nothing paid: nothing declared, nothing reclaimed, and every credit
    // note says it was held back.
    if (!payments.length) {
      const held = notes.length;
      if (cash.box1 !== 0 || cash.box6 !== 0 || cash.creditsHeldBack !== held) broke.unpaid.push(at("unpaid", { cash, held }));
    }
    if (paidAll) {
      // Every penny in: the two bases have declared the same thing, and no
      // credit note was held back.
      const gap = Math.abs(pence(cash.box1) - pence(invoice.box1)) + Math.abs(pence(cash.box1) + pence(cash.box6) - pence(invoice.box1) - pence(invoice.box6));
      worstPaid = Math.max(worstPaid, gap);
      if (gap > MAX_CASH_SPLIT_PENCE) broke.paidMatches.push(at("paid in full but bases differ", { cash: [cash.box1, cash.box6], invoice: [invoice.box1, invoice.box6] }));
      if (cash.creditsHeldBack !== 0) broke.heldBack.push(at("held back though paid in full", { held: cash.creditsHeldBack }));
      // ...and that stays true when the payments are spread over quarters.
      if (!notes.length) {
        const q = quarters.reduce((t, p) => t + pence(vatFigures([inv], [], payments, [], true, p, "cash").box1), 0);
        if (Math.abs(q - pence(totals.totalVat)) > MAX_CASH_SPLIT_PENCE) broke.quarters.push(at("quarters' cash VAT is not the invoice's", { q: q / 100, vat: totals.totalVat }));
      }
    }
  }

  check(`VAT cash basis: never declares more than the invoice carries (${CASES} invoices)`, broke.overDeclared.length === 0, first(broke.overDeclared));
  check("VAT cash basis: a credit note never reclaims more than was declared", broke.negative.length === 0, first(broke.negative));
  check("VAT cash basis: an unpaid invoice declares nothing and holds back every credit note", broke.unpaid.length === 0, first(broke.unpaid));
  check(`VAT cash basis: paid in full, it declares what the invoice basis did, within ${MAX_CASH_SPLIT_PENCE}p`, broke.paidMatches.length === 0 && worstPaid <= MAX_CASH_SPLIT_PENCE, JSON.stringify({ worstPaid, cases: broke.paidMatches.slice(0, 2) }));
  check("VAT cash basis: paid in full, no credit note is held back", broke.heldBack.length === 0, first(broke.heldBack));
  check("VAT cash basis: payments spread over four quarters still declare the invoice's VAT", broke.quarters.length === 0, first(broke.quarters));
}

// ---------------------------------------------------------------------------
// Comparing suppliers' prices
// ---------------------------------------------------------------------------
// HOW MUCH ROUNDING IS ALLOWED. Everything is compared ex VAT, in whole
// pence, so the split-versus-single question is EXACT on that basis: the
// split is the cheapest of all splits, and never dearer than any single
// supplier. Checked against a brute force over every way of assigning the
// lines, which shares no code with compare().
//
// VAT is where rounding comes in. A supplier who quoted inclusive prices is
// converted to ex VAT, one who quoted ex VAT is grossed up, and each cell
// rounds to the penny. Measured, not assumed (2026-10-18), over 80,000
// generated requests on four seeds (one to five lines, one to five
// suppliers, prices from pennies to £400 a unit, odd quantities, inclusive
// and exclusive suppliers mixed): a cell's inc-VAT figure was never more than
// 1p from 1.2 times its ex-VAT one. So the split, chosen on ex VAT, can come
// out a penny dearer INC VAT than the single supplier it beat ex VAT. Neither
// those 80,000 nor 250,000 more built from near-equal small prices ever did
// it; a targeted search of 400,000 near-ties (every price within 2p of every
// other, inclusive and exclusive suppliers mixed) found it once, 1p dearer
// over three lines, and 150,000 more near-ties over two to eight lines found
// nothing worse. The bound allowed is a penny a line -- rounding is bounded
// by the cells, a wrong split is not.
const MAX_CELL_VAT_PENCE = 1;
const INC_PER_LINE_PENCE = 1;
{
  const SEED = 16180339;
  const g = generator(SEED);
  const CASES = 3000;
  const TODAY = "2026-10-18";
  const broke = { cell: [], column: [], plan: [], uncovered: [], expired: [], covers: [], splitOverSingle: [], recommended: [], saves: [], optimal: [], single: [], fewest: [], inc: [], big: [] };
  let worstCell = 0;

  // Every third request is drawn from a handful of prices, one of each
  // thing, ex VAT and little or no delivery, so splits tie exactly -- otherwise the fewest-suppliers rule is
  // almost never asked anything.
  const makeRequest = (nOffers, ties = g.rnd() < 0.33) => {
    const items = Array.from({ length: g.int(1, 5) }, (_, k) => ({ id: `it${k}`, description: "x", quantity: ties ? 1 : g.qty(), unit: "", note: "" }));
    const offers = Array.from({ length: nOffers ?? g.int(1, 5) }, (_, k) => ({
      id: `o${k}`,
      name: `Supplier ${k}`,
      vatIncluded: !ties && g.rnd() < 0.4,
      validUntil: g.pick([null, null, "2026-10-17", "2026-10-18", "2026-11-30"]),
      delivery: ties ? g.pick([null, 0, 0, 1]) : g.pick([null, 0, g.money(15), g.money(120)]),
      prices: Object.fromEntries(items.flatMap((it) => {
        const r = g.rnd();
        if (r < 0.08) return [];
        if (r < 0.15) return [[it.id, { price: null, unavailable: true, note: "" }]];
        if (r < 0.18) return [[it.id, { price: g.pick([null, -5, NaN]), unavailable: false, note: "" }]];
        return [[it.id, { price: ties ? g.pick([1, 2, 3]) : g.money(g.pick([2, 40, 600])), unavailable: false, note: "" }]];
      })),
    }));
    return { items, offers };
  };

  for (let i = 0; i < CASES; i++) {
    const at = (what, extra) => ({ seed: SEED, case: i, what, ...extra });
    const { items, offers } = makeRequest();

    for (const o of offers) {
      for (const it of items) {
        const c = cellFor(o, it);
        if (c.kind !== "price") continue;
        const gap = Math.abs(c.inc - 1.2 * c.ex);
        worstCell = Math.max(worstCell, gap);
        if (!Number.isInteger(c.ex) || !Number.isInteger(c.inc) || c.ex < 0 || c.inc < c.ex || gap > MAX_CELL_VAT_PENCE + 1e-9) broke.cell.push(at("cell", { c }));
      }
      // A supplier's column: every line is priced, refused or missing, and
      // the total is the lines plus delivery.
      const t = supplierTotal(o, items);
      if (t.priced + t.unavailable + t.missing !== items.length || t.ex !== t.linesEx + t.deliveryEx || t.inc !== t.linesInc + t.deliveryInc || t.ex < 0) broke.column.push(at("column", { t }));
    }

    // Any set of picks at all, including ones pointing at nobody or at a
    // supplier with no price for the line, costs exactly what its cells and
    // deliveries say -- each supplier's delivery once.
    const picks = Object.fromEntries(items.map((it) => [it.id, g.pick([null, "nobody", ...offers.map((o) => o.id)])]));
    const plan = planFor(offers, items, picks);
    {
      const used = new Set();
      let ex = 0;
      let placed = 0;
      for (const it of items) {
        const o = offers.find((x) => x.id === picks[it.id]);
        const c = o ? cellFor(o, it) : null;
        if (c?.kind === "price") { ex += c.ex; used.add(o.id); placed++; if (plan.picks[it.id] !== o.id) broke.plan.push(at("pick dropped")); }
        else if (plan.picks[it.id] !== null) broke.plan.push(at("pick kept without a price"));
      }
      for (const id of used) ex += deliveryOf(offers.find((o) => o.id === id)).ex;
      const inOrders = plan.orders.reduce((t, o) => t + o.items.length, 0);
      if (plan.ex !== ex || inOrders !== placed || inOrders + plan.unpicked.length !== items.length || plan.orders.some((o) => !o.items.length) || plan.ex !== plan.orders.reduce((t, o) => t + o.ex, 0)) {
        broke.plan.push(at("plan does not cost what it holds", { plan: plan.ex, ex }));
      }
    }

    const c = compare(offers, items, TODAY);
    const eligible = offers.filter((o) => !isExpired(o, TODAY) && items.some((it) => cellFor(o, it).kind === "price"));
    const prices = (o, it) => cellFor(o, it).kind === "price";
    const covered = items.filter((it) => eligible.some((o) => prices(o, it)));
    const uncovered = items.filter((it) => !covered.includes(it));
    if (c.uncovered.map((x) => x.id).join() !== uncovered.map((x) => x.id).join()) broke.uncovered.push(at("uncovered", { got: c.uncovered.map((x) => x.id), want: uncovered.map((x) => x.id) }));

    // No expired offer is ever picked, by any plan.
    const usedBy = (p) => (p ? p.orders.map((o) => o.offer) : []);
    if ([c.single, c.split, c.recommended].flatMap(usedBy).some((o) => isExpired(o, TODAY))) broke.expired.push(at("an expired offer was picked"));

    if (!covered.length) {
      if (c.single || c.split || c.recommended || c.splitSaves !== 0) broke.covers.push(at("plans with nothing to buy"));
      continue;
    }
    // The split buys every line anyone eligible can supply, and only those.
    if (!c.split || c.split.unpicked.map((x) => x.id).join() !== uncovered.map((x) => x.id).join()) broke.covers.push(at("split leaves out a line it could buy"));

    // The best single supplier, by brute force: every eligible supplier who
    // prices every covered line, lines plus their delivery.
    const singles = eligible.filter((o) => covered.every((it) => prices(o, it))).map((o) => covered.reduce((t, it) => t + cellFor(o, it).ex, 0) + deliveryOf(o).ex);
    const bestSingle = singles.length ? Math.min(...singles) : null;
    if ((c.single?.ex ?? null) !== bestSingle) broke.single.push(at("single is not the cheapest whole-order supplier", { got: c.single?.ex, want: bestSingle }));

    // The best split, by brute force: every way of giving each covered line
    // to an eligible supplier who prices it, each supplier used paid its
    // delivery once. Then, among the cheapest, the fewest suppliers.
    const options = covered.map((it) => eligible.filter((o) => prices(o, it)));
    let bestCost = Infinity;
    let fewest = Infinity;
    const walk = (k, chosen) => {
      if (k === covered.length) {
        const used = new Set(chosen.map((o) => o.id));
        const cost = covered.reduce((t, it, j) => t + cellFor(chosen[j], it).ex, 0) + [...used].reduce((t, id) => t + deliveryOf(eligible.find((o) => o.id === id)).ex, 0);
        if (cost < bestCost) { bestCost = cost; fewest = used.size; }
        else if (cost === bestCost) fewest = Math.min(fewest, used.size);
        return;
      }
      for (const o of options[k]) walk(k + 1, [...chosen, o]);
    };
    walk(0, []);
    if (c.split.ex !== bestCost) broke.optimal.push(at("split is not the cheapest split", { got: c.split.ex, want: bestCost }));
    else if (c.split.orders.length !== fewest) broke.fewest.push(at("a cheaper-or-equal split with fewer suppliers exists", { got: c.split.orders.length, want: fewest }));

    // The point of the feature: a split never costs more than the best
    // single supplier, the recommendation never more than either, and it
    // only recommends splitting when splitting actually saves.
    if (c.single && c.split.ex > c.single.ex) broke.splitOverSingle.push(at("split dearer than single", { split: c.split.ex, single: c.single.ex }));
    const rec = c.recommended;
    if (!rec || (c.single && rec.ex > c.single.ex) || rec.ex > c.split.ex || (rec === c.split) !== (!c.single || c.split.ex < c.single.ex)) broke.recommended.push(at("recommendation", { rec: rec?.ex, single: c.single?.ex, split: c.split.ex }));
    if (c.splitSaves !== (c.single ? Math.max(0, c.single.ex - c.split.ex) : 0) || c.splitSaves < 0) broke.saves.push(at("splitSaves", { saves: c.splitSaves }));
    if (c.single && rec === c.split && rec !== c.single && rec.inc > c.single.inc + INC_PER_LINE_PENCE * covered.length) broke.inc.push(at("split much dearer inc VAT", { split: rec.inc, single: c.single.inc }));
  }

  // Past twelve eligible offers the split only tries the twelve cheapest
  // looking ones, so it may miss the very best split -- but the
  // recommendation must still never cost more than any single supplier who
  // can do the whole job.
  const BIG = 40;
  for (let i = 0; i < BIG; i++) {
    const { items, offers } = makeRequest(g.int(13, 15));
    const c = compare(offers, items, TODAY);
    const covered = items.filter((it) => !c.uncovered.includes(it));
    if (!covered.length) continue;
    const singles = c.eligible.filter((o) => covered.every((it) => cellFor(o, it).kind === "price")).map((o) => supplierTotal(o, covered).ex);
    if (!c.split || !c.recommended || singles.some((s) => c.recommended.ex > s) || c.recommended.unpicked.length !== c.uncovered.length) broke.big.push({ seed: SEED, case: `big ${i}`, rec: c.recommended?.ex, singles });
  }

  check(`compare: every cell is whole pence, inc >= ex, inc within ${MAX_CELL_VAT_PENCE}p of 1.2 x ex (${CASES} requests)`, broke.cell.length === 0 && worstCell <= MAX_CELL_VAT_PENCE, JSON.stringify({ worstCell, cases: broke.cell.slice(0, 2) }));
  check("compare: a supplier's column is its lines plus delivery, every line accounted for", broke.column.length === 0, first(broke.column));
  check("compare: any set of picks costs exactly its cells plus each used supplier's delivery once", broke.plan.length === 0, first(broke.plan));
  check("compare: the lines nobody can supply are exactly the ones reported uncovered", broke.uncovered.length === 0, first(broke.uncovered));
  check("compare: an expired offer is never picked", broke.expired.length === 0, first(broke.expired));
  check("compare: the split buys every line that can be bought", broke.covers.length === 0, first(broke.covers));
  check("compare: the single supplier offered is the cheapest who can do the whole order", broke.single.length === 0, first(broke.single));
  check("compare: the split is the cheapest of every possible split (brute force)", broke.optimal.length === 0, first(broke.optimal));
  check("compare: ...and among equally cheap splits, uses the fewest suppliers", broke.fewest.length === 0, first(broke.fewest));
  check("compare: a split never costs more than the best single supplier", broke.splitOverSingle.length === 0, first(broke.splitOverSingle));
  check("compare: splitting is recommended exactly when it saves, and never costs more", broke.recommended.length === 0, first(broke.recommended));
  check("compare: the saving stated is the real saving, never negative", broke.saves.length === 0, first(broke.saves));
  check(`compare: a recommended split is never more than ${INC_PER_LINE_PENCE}p a line dearer inc VAT`, broke.inc.length === 0, first(broke.inc));
  check(`compare: past twelve suppliers, the recommendation still beats every whole-order supplier (${BIG} requests)`, broke.big.length === 0, first(broke.big));
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
