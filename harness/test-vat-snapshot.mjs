import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3800";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const C = newId(), OLD = newId(), NEW = newId(), DRAFT = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, vat_number: "GB999", show_overdue_reminders: false });
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Ltd", email: "a@example.com", kind: "client", archived: false, is_company: true, reminders_enabled: true });
const inv = (id, number, status, vat) => ({ id, user_id: "x", client_id: C, date: "2026-08-01", number, items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: null, due_date: "2026-12-01", payment_terms: "30 days", status, tags: [], vat_registered: vat });
db.tables.invoices.push(inv(OLD, "INV-OLD", "sent", false), inv(NEW, "INV-NEW", "sent", true), inv(DRAFT, "DRAFT-x", "draft", null));
db.tables.invoice_payments = []; db.tables.credit_notes = []; db.tables.invoice_reminders_sent = []; db.tables.receipts = []; db.tables.recurring_expenses = [];
const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${OLD}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Amount due"), { timeout: 30000 });
  let t = await bodyText(page);
  check("issued before VAT registration: no VAT, £1,000 due", t.includes("Amount due: £1,000.00") && !t.includes("VAT: GB999") && !t.includes("Standard (20%)"), t.match(/Amount due: £[\d.,]+/)?.[0]);
  await page.goto(`${BASE}/invoices/${NEW}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Amount due"), { timeout: 30000 });
  t = await bodyText(page);
  check("issued while registered: VAT shown, £1,200 due", t.includes("Amount due: £1,200.00") && t.includes("VAT: GB999"), t.match(/Amount due: £[\d.,]+/)?.[0]);
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("INV-OLD"), { timeout: 30000 });
  t = await bodyText(page);
  const row = (n) => t.split("\n").find((l) => l.includes("2026-08-01") && t.indexOf(l) > t.indexOf(n)) ?? "";
  check("list: old £1000, new £1200", t.includes("£1,000.00") && t.includes("£1,200.00"), t.slice(t.indexOf("INV-OLD") - 50, t.indexOf("INV-OLD") + 200));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Awaiting payment"), { timeout: 30000 });
  t = await bodyText(page);
  check("dashboard owed = £1,000 + £1,200", t.includes("£2,200.00") || t.includes("£2,200.00"), t.match(/£[\d,]+\.\d\d/g)?.slice(0, 6));
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
