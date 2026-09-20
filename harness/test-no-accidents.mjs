// Nothing in someone's accounting record should go on one tap. Every
// Remove must ask first, saying what goes, and saying No must leave the
// record exactly as it was.
import { makeDb, launchSignedIn, signIn, sleep, clickText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.allowDelete = ["invoices", "receipts", "clients", "invoice_payments", "credit_notes", "recurring_expenses", "recurring_invoices"];
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: "x", client_id: C, date: today, number: "INV-9", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: today, payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(INV);
const PAY = { id: newId(), user_id: "x", invoice_id: INV.id, date: today, amount: 200, method: "bank", note: "" };
db.tables.invoice_payments.push(PAY);
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: INV.id, date: today, amount: 120, reason: "Overcharged" });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: today, vendor: "Travis Perkins", category: "Supplies", amount: 50, vat_amount: 10, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", description: "Van insurance", category: "Other", amount: 40, vat_amount: 8, supplier_id: null, day_of_month: 1, next_due_date: today, active: true });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: C, items: [{ description: "Monthly retainer", quantity: 1, unitPrice: 300, vatRate: "standard" }], payment_terms: "", notes: "", day_of_month: 1, next_due_date: today, active: true });

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-accidents" });
let asked = null;
let answer = false;
page.on("dialog", async (d) => { asked = d.message(); await (answer ? d.accept() : d.dismiss()); });

const count = (table) => db.tables[table].length;

async function removeOn(path, table, label, waitFor) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await page.waitForFunction((w) => document.body.innerText.includes(w), { timeout: 20000 }, waitFor);
  const before = count(table);
  // Say no.
  asked = null; answer = false;
  await clickText(page, label);
  await sleep(900);
  check(`${path}: Remove asks before deleting`, !!asked, String(asked));
  check(`${path}: saying no keeps the record`, count(table) === before, `${count(table)} vs ${before}`);
  check(`${path}: the question says what goes`, !!asked && asked.length > 25 && /remove|discard/i.test(asked), String(asked));
  // Say yes.
  asked = null; answer = true;
  await clickText(page, label);
  await sleep(1400);
  check(`${path}: saying yes removes it`, count(table) === before - 1, `${count(table)} vs ${before}`);
}

try {
  await signIn(page, BASE);
  // Money first, on the invoice's own page: a payment and a credit note
  // both move what the customer owes.
  await removeOn(`/invoices/${INV.id}`, "invoice_payments", "Remove", "Payments");
  await removeOn(`/invoices/${INV.id}`, "credit_notes", "Remove", "Credit notes");
  await removeOn("/recurring/invoices", "recurring_invoices", "Remove", "Recurring");
  await removeOn("/recurring", "recurring_expenses", "Remove", "Van insurance");
  await removeOn("/receipts", "receipts", "Remove", "Travis Perkins");
  await removeOn("/invoices", "invoices", "Remove", "INV-9");
  await removeOn("/clients", "clients", "Remove", "Acme Kitchens Ltd");
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
