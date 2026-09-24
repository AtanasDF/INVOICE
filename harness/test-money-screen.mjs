// One page for everything owed to you and everything you owe, in the order
// it matters: late first, then this week, then the rest. The point is that
// the worst thing is at the top of each list without anybody sorting or
// filtering -- on a phone, in a van, before the first job.
import { moneyScreen } from "./gen/lib/moneyScreen.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const same = (a, b) => Math.round(a * 100) === Math.round(b * 100);
const J = (x) => JSON.stringify(x);
const TODAY = todayISO();

const inv = (o) => ({ id: o.id, clientId: o.clientId ?? "c1", date: day(-30), number: o.id, items: [{ description: "Work", quantity: 1, unitPrice: o.net, vatRate: "standard", kind: "labour" }], notes: "", dueDate: o.dueDate ?? null, paymentTerms: "", status: o.status ?? "sent", tags: [], vatRegistered: true, cisRate: o.cisRate ?? null });
const bill = (o) => ({ id: o.id, clientId: o.clientId ?? null, date: day(-20), vendor: o.vendor ?? "", category: "Supplies", amount: o.net, vatAmount: Math.round(o.net * 0.2 * 100) / 100, imageDataUrl: null, notes: "", starred: false, needsReview: o.needsReview ?? false, warrantyMonths: null, tags: [], lineItems: [], documentType: "invoice", invoiceNumber: o.id, dueDate: o.dueDate ?? null, paid: o.paid ?? false, details: {}, creditOfReceiptId: null, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null });
const names = { c1: "Acme Kitchens Ltd", c2: "Bell Builders", s1: "Jewson" };
const nameOf = (id) => (id ? names[id] ?? "" : "");

const invoices = [
  inv({ id: "VERY-LATE", net: 1000, dueDate: day(-40) }),
  inv({ id: "A-BIT-LATE", net: 500, dueDate: day(-2) }),
  inv({ id: "THIS-WEEK", net: 300, dueDate: day(3) }),
  inv({ id: "LATER", net: 700, dueDate: day(40) }),
  inv({ id: "NO-DATE", net: 200, dueDate: null }),
  inv({ id: "PAID", net: 900, dueDate: day(-50), status: "paid" }),
  inv({ id: "DRAFT", net: 800, dueDate: day(-60), status: "draft" }),
];
const receipts = [
  bill({ id: "BILL-LATE", net: 400, dueDate: day(-5), clientId: "s1" }),
  bill({ id: "BILL-SOON", net: 100, dueDate: day(2), vendor: "Screwfix" }),
  bill({ id: "BILL-PAID", net: 250, dueDate: day(-9), paid: true }),
  bill({ id: "BILL-UNCHECKED", net: 600, dueDate: day(-9), needsReview: true }),
];

let m = moneyScreen(invoices, [], [], receipts, nameOf, true, TODAY);

check("the latest invoice is at the top, then the next latest",
  m.owedToYou.map((o) => o.what).slice(0, 2).join(",") === "VERY-LATE,A-BIT-LATE", J(m.owedToYou.map((o) => o.what)));
check("then this week, then later, then the undated one last",
  m.owedToYou.map((o) => o.what).join(",") === "VERY-LATE,A-BIT-LATE,THIS-WEEK,LATER,NO-DATE", J(m.owedToYou.map((o) => o.what)));
check("a paid invoice is not on it", !m.owedToYou.some((o) => o.what === "PAID"));
check("nor is a draft: it was never sent to anybody", !m.owedToYou.some((o) => o.what === "DRAFT"));
check("each row says who it is, not just a number", m.owedToYou.every((o) => o.who === "Acme Kitchens Ltd"), J(m.owedToYou.map((o) => o.who)));
check("how late is counted in days", m.owedToYou[0].daysLate === 40, String(m.owedToYou[0].daysLate));

check("bills are in the same order, late first", m.youOwe.map((o) => o.what).join(",") === "BILL-LATE,BILL-SOON", J(m.youOwe.map((o) => o.what)));
check("a paid bill is gone", !m.youOwe.some((o) => o.what === "BILL-PAID"));
check("a bill still waiting to be checked is left out: nobody should be chased for a figure nobody has read",
  !m.youOwe.some((o) => o.what === "BILL-UNCHECKED"), J(m.youOwe.map((o) => o.what)));
check("a bill shows the supplier's saved name over the one printed on it", m.youOwe[0].who === "Jewson", m.youOwe[0].who);
check("and falls back to the printed name when no supplier is linked", m.youOwe[1].who === "Screwfix", m.youOwe[1].who);

// 1000+500+300+700+200 = 2700 net, +20% VAT = 3240.
check("owed to you totals the rows", same(m.totalIn, 3240), String(m.totalIn));
check("you owe totals the bills: 400 + 100 plus VAT", same(m.totalOut, 600), String(m.totalOut));
check("the difference is one less the other", same(m.net, 2640), String(m.net));
check("what is late is counted separately on both sides",
  same(m.lateIn, (1000 + 500) * 1.2) && same(m.lateOut, 480), J({ lateIn: m.lateIn, lateOut: m.lateOut }));

// CIS: what the customer owes is the total less the deduction.
m = moneyScreen([inv({ id: "CIS", net: 1000, dueDate: day(-1), cisRate: 20 })], [], [], [], nameOf, true, TODAY);
check("a CIS invoice asks for the total less the deduction, not the total", same(m.owedToYou[0].amount, 1000), String(m.owedToYou[0].amount));

// Part-paid and part-credited, the combination the invoice page gets right.
m = moneyScreen([inv({ id: "P", net: 1000, dueDate: day(-1) })],
  [{ id: "cn", invoiceId: "P", date: day(-1), amount: 200, reason: "" }],
  [{ id: "p", invoiceId: "P", date: day(-1), amount: 400, method: "bank", note: "" }],
  [], nameOf, true, TODAY);
check("a part-paid, part-credited invoice asks for what is actually left", same(m.owedToYou[0].amount, 1200 - 200 - 400), String(m.owedToYou[0].amount));
check("an invoice settled by payments and credits drops off entirely",
  moneyScreen([inv({ id: "S", net: 1000, dueDate: day(-1) })], [], [{ id: "p", invoiceId: "S", date: day(-1), amount: 1200, method: "bank", note: "" }], [], nameOf, true, TODAY).owedToYou.length === 0);

m = moneyScreen([], [], [], [], nameOf, true, TODAY);
check("an empty account is zero on both sides, not blank", same(m.totalIn, 0) && same(m.totalOut, 0) && same(m.net, 0), J(m));

// ── On the screen ──
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId(), S = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.clients.push({ id: S, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.invoices.push({ id: newId(), user_id: "x", client_id: C, date: day(-40), number: "INV-000001", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: day(-30), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
const BILL = newId();
db.tables.receipts.push({ id: BILL, user_id: "x", client_id: S, date: day(-20), vendor: "Jewson", category: "Supplies", amount: 200, vat_amount: 40, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "J-1", due_date: day(-3), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-money-screen" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Owed to you"), { timeout: 20000 });
  const t = await bodyText(page);
  check("the page shows both sides and the difference", /Owed to you/.test(t) && /You owe/.test(t) && /Difference/.test(t), t.replace(/\s+/g, " ").slice(0, 200));
  check("the late invoice says how late it is", /30 days late/.test(t), t.replace(/\s+/g, " ").slice(0, 400));
  check("it fits a phone", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // Marking a bill paid, twice in one tick.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Mark paid");
    b.click(); b.click();
  });
  await sleep(1800);
  // Scoped to the list: the confirmation names the supplier, quite rightly,
  // so the whole page still says "Jewson" after it has gone.
  const owing = await page.evaluate(() => {
    const s = [...document.querySelectorAll("section")].find((x) => /You owe/.test(x.querySelector("h2")?.textContent ?? ""));
    return s ? s.innerText : "";
  });
  check("marking a bill paid takes it off the list", !/Jewson/.test(owing), owing.replace(/\s+/g, " ").slice(0, 200));
  check("and two presses in one tick mark it once, not twice", db.tables.receipts.filter((r) => r.paid).length === 1, J(db.tables.receipts.map((r) => [r.vendor, r.paid])));
  check("it says so out loud", /marked paid/i.test(await page.evaluate(() =>
    [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent).join(" "))), "nothing announced");
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
