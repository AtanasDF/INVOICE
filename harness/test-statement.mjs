// A customer's statement: every issued invoice, what came off it, what's
// owed and how old it is.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_links: [], invoice_links: [] });
const C = newId();
const OTHER = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "1 Mill Lane\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "" });
db.tables.clients.push({ id: OTHER, user_id: "x", name: "Someone Else", email: "", address: "", kind: "client", archived: false, is_company: false, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "" });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", address: "2 Trade Park\nBristol", vat_number: "GB123", vat_registered: true, bank_details: "Sort 12-34-56 Acc 12345678" });
const inv = (o) => ({ id: newId(), user_id: "x", client_id: C, date: day(-40), number: "INV-1", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: day(-10), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null, ...o });
// 100 days late, part paid; 5 days late, unpaid; not yet due; fully paid; a
// draft (never on a statement); another customer's (never on this one).
const A = inv({ number: "INV-100", date: day(-130), due_date: day(-100) });
const B = inv({ number: "INV-101", date: day(-35), due_date: day(-5) });
const D = inv({ number: "INV-102", date: day(-2), due_date: day(28) });
const E = inv({ number: "INV-103", date: day(-60), due_date: day(-30), status: "paid" });
const DRAFT = inv({ number: "DRAFT-1", status: "draft" });
const OTHERS = inv({ number: "INV-999", client_id: OTHER });
db.tables.invoices.push(A, B, D, E, DRAFT, OTHERS);
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: A.id, date: day(-90), amount: 200, method: "bank", note: "" });
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: E.id, date: day(-25), amount: 1200, method: "bank", note: "" });
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: B.id, date: day(-20), amount: 120, reason: "Overcharged" });
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-statement" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await sleep(800);
  check("a customer with invoices has a Statement link", (await bodyText(page)).includes("Statement"));
  await page.goto(`${BASE}/clients/${C.id ?? C}/statement`, { waitUntil: "networkidle0" }).catch(() => {});
  await page.goto(`${BASE}/clients/${C}/statement`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Statement of account"), { timeout: 15000 });
  const t = await bodyText(page);
  // £1200 inc VAT each. A: 1200 − 200 = 1000 owing. B: 1200 − 120 credit = 1080.
  // D: 1200 owing, not yet late. E: paid. Total 3280.
  check("only this customer's issued invoices are listed", t.includes("INV-100") && t.includes("INV-101") && t.includes("INV-102") && t.includes("INV-103") && !t.includes("DRAFT-1") && !t.includes("INV-999"), t.slice(0, 400));
  check("the total owing is right", t.includes("£3,280.00"), t.slice(t.indexOf("Owing as at"), t.indexOf("Owing as at") + 120));
  check("payments and credit notes come off", t.includes("£200.00") && t.includes("−£120.00"), t.slice(t.indexOf("Charged"), t.indexOf("Charged") + 300));
  check("what's late, and the oldest, is called out", /£2,080\.00 of that is late/.test(t) && /oldest by 10\d days \(INV-100\)/.test(t), t.slice(t.indexOf("of that is late") - 40, t.indexOf("of that is late") + 80));
  check("ageing buckets add up", t.includes("Not yet late") && t.includes("90+ days") && t.includes("£1,200.00") && t.includes("£1,080.00"), t.slice(t.indexOf("How old it is"), t.indexOf("How old it is") + 200));
  check("who it's from and for, and how to pay", t.includes("Harness Plastering Ltd") && t.includes("Acme Kitchens Ltd") && t.includes("Sort 12-34-56"), t.slice(0, 200));
  check("share, PDF, print and copy are all offered", t.includes("Share (WhatsApp") && t.includes("Download PDF") && t.includes("Print") && t.includes("Copy the figures"));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  // A customer with nothing owing.
  db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: A.id, date: day(-1), amount: 1000, method: "bank", note: "" });
  db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: B.id, date: day(-1), amount: 1080, method: "bank", note: "" });
  db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: D.id, date: day(-1), amount: 1200, method: "bank", note: "" });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Statement of account"), { timeout: 15000 });
  const t2 = await bodyText(page);
  check("all paid says so, with no ageing", t2.includes("Nothing outstanding") && !t2.includes("How old it is") && t2.includes("£0.00"), t2.slice(t2.indexOf("Owing as at"), t2.indexOf("Owing as at") + 150));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
