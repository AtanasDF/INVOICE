// Two records for the same business: offer to merge, move everything over,
// archive the duplicate (never delete).
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quotes: [], recurring_invoices: [], recurring_expenses: [] });
const client = (o) => ({ id: newId(), user_id: "x", name: "", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", ...o });
const FULL = client({ name: "Acme Kitchens Ltd", email: "acme@example.com", phone: "07700 900123", address: "1 Mill Lane", vat_number: "GB1" });
const THIN = client({ name: "ACME KITCHENS LIMITED" });
const BYEMAIL = client({ name: "Totally Different Name", email: "acme@example.com" });
const SUPPLIER = client({ name: "Acme Kitchens Ltd", kind: "supplier" });
const ALONE = client({ name: "Someone Else" });
db.tables.clients.push(FULL, THIN, BYEMAIL, SUPPLIER, ALONE);
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true });
const inv = (client_id, number) => ({ id: newId(), user_id: "x", client_id, date: todayISO(), number, items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: todayISO(), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
db.tables.invoices.push(inv(THIN.id, "INV-THIN-1"), inv(THIN.id, "INV-THIN-2"), inv(FULL.id, "INV-FULL-1"));
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: THIN.id, date: todayISO(), vendor: "Acme", category: "Supplies", amount: 10, vat_amount: 2, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-merge-contacts" });
page.on("dialog", (d) => d.accept());
try {
  await signIn(page, BASE);
  await page.evaluate(() => localStorage.removeItem("clients-not-duplicates"));
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await sleep(900);
  let t = await bodyText(page);
  check("the same name is spotted", t.includes("look like the same client: the same name"), t.slice(t.indexOf("look like"), t.indexOf("look like") + 120));
  check("the same email is spotted too", t.includes("the same email address"));
  check("a client and a supplier with one name are left alone", !t.includes("Acme Kitchens Ltd and Acme Kitchens Ltd"));
  check("the fuller record is the one kept", t.includes("Merge into Acme Kitchens Ltd"), t.slice(t.indexOf("Merge into"), t.indexOf("Merge into") + 60));

  await clickText(page, "Merge into Acme Kitchens Ltd");
  await page.waitForFunction(() => document.body.innerText.includes("Merged into"), { timeout: 15000 });
  const moved = db.tables.invoices.filter((i) => i.client_id === FULL.id).length;
  check("invoices moved to the kept record", moved === 3, String(moved));
  check("receipts moved too", db.tables.receipts.every((r) => r.client_id === FULL.id));
  check("the duplicate is archived, not deleted", db.tables.clients.some((c) => c.id === THIN.id && c.archived === true) && db.tables.clients.length === 5);
  t = await bodyText(page);
  check("it says what moved", /Merged into Acme Kitchens Ltd: \d+ records? moved/.test(t), t.slice(t.indexOf("Merged into"), t.indexOf("Merged into") + 100));

  // "They're different" puts a pair aside for good on this device.
  await clickText(page, "They're different");
  await sleep(300);
  check("put aside straight away", !(await bodyText(page)).includes("the same email address"));
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(900);
  check("still aside after a reload", !(await bodyText(page)).includes("the same email address"));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
