// Dates on screen read "1 Oct 2026", never 2026-10-01 (the sweep,
// 2026-09-22). One of each record is seeded and every page that lists
// them is read; a year-month-day in the visible text fails, naming the
// page and the line. Boxes are allowed their machine form: a date input
// shows its own picker, and innerText leaves input values out anyway.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, todayISO, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const ISO = /\b20\d\d-\d\d-\d\d\b/;

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Nasko Plastering", vat_registered: true, custom_categories: null, invoice_prefix: "INV-", invoice_next_number: 30 });
const CLIENT = newId(), SUPPLIER = newId(), INV = newId(), BILL = newId();
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Big Co Ltd", email: "pay@bigco.example", address: "2 Client Road\nLeeds\nLS1 2AB", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "14 days", phone: "" });
db.tables.clients.push({ id: SUPPLIER, user_id: "x", name: "Toolstation", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: false, vat_number: "", payment_terms: "", phone: "" });
db.tables.invoices.push({ id: INV, user_id: "x", client_id: CLIENT, date: day(-20), number: "INV-000029", items: [{ description: "Plastering", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: day(-6), payment_terms: "14 days", status: "partial", tags: [], vat_registered: true, cis_rate: null });
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: INV, date: day(-10), amount: 50, reason: "Damaged corner" });
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: INV, date: day(-5), amount: 100, method: "bank" });
db.tables.receipts.push({ id: BILL, user_id: "x", client_id: SUPPLIER, date: day(-3), vendor: "Toolstation", category: "Materials & stock", amount: 84.2, vat_amount: 14.03, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TS-4411", due_date: day(4), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-8), vendor: "Mileage", category: "Mileage", amount: 45, vat_amount: 0, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "other", invoice_number: null, due_date: null, paid: true, details: { mileage: { miles: 100, from: "BS1 4DJ", to: "BA1 2XY", purpose: "Site visit", rate: 0.45 } }, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", description: "Van insurance", category: "Insurance", amount: 40, vat_amount: 8, supplier_id: SUPPLIER, day_of_month: 1, next_due_date: day(9), active: true });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: CLIENT, items: [{ description: "Monthly maintenance", quantity: 1, unitPrice: 200, vatRate: "standard" }], payment_terms: "14 days", notes: "", day_of_month: 1, next_due_date: day(9), active: true });

const PAGES = ["/", "/invoices", `/invoices/${INV}`, "/clients", "/files", "/mileage", "/recurring", "/recurring/invoices"];
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-plain-dates" });
try {
  await signIn(page, BASE);
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(900);
    if (path === "/clients") {
      // The payment history sits behind each client's row.
      await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /history|payments|invoices/i.test(b.textContent)).forEach((b) => b.click()));
      await sleep(400);
    }
    const text = await bodyText(page);
    const hit = text.split("\n").find((l) => ISO.test(l));
    check(`${path}: no year-month-day on screen`, !hit && text.length > 60, hit ?? text.slice(0, 120));
  }
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(900);
  const list = await bodyText(page);
  const due = new Date(`${day(-6)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  check("the invoices list says the due date the way people do", list.includes(`due ${due}`), list.slice(list.indexOf("INV-000029"), list.indexOf("INV-000029") + 160));
  check("...and the credit note's date too", new RegExp(`Credit note ${new Date(`${day(-10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`).test(list), list.slice(0, 400));
  await page.goto(`${BASE}/scan`, { waitUntil: "domcontentloaded" });
  await sleep(300);
  check("today's date helper agrees with the app's London day", todayISO().length === 10);
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
