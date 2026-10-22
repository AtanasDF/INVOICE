// A TOOL, not a suite: iPhone-sized pictures of the launch screens
// (notes/launch-simplify.md) for Atanas to look at before they ship, against a
// made-up account in the mock database. OUT is where they go.
//
//   BASE=http://localhost:3100 OUT=/some/folder node shots-launch.mjs
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO, day } from "./mockdb.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? ".";

const seeded = () => {
  const db = makeDb();
  const C = newId(), I1 = newId(), I2 = newId();
  db.tables.business_profile.push({
    business_name: "Kovac Couriers", address: "1 Depot Way\nCarlisle CA1 1AA", vat_registered: false, show_overdue_reminders: true,
    invoice_prefix: "INV-", invoice_next_number: 44,
    bank_details: "Account name: J Kovac\nSort code: 12-34-56\nAccount number: 12345678",
    payment_link: "https://pay.sumup.com/b2c/KOVAC",
  });
  db.tables.clients.push({ id: C, user_id: "x", name: "Skido Logistics Ltd", email: "accounts@skido.example", kind: "client", archived: false, is_company: true, reminders_enabled: true });
  const inv = (id, number, price, date, due) => ({ id, user_id: "x", client_id: C, date, number, items: [{ description: "Deliveries, week 42", quantity: 1, unitPrice: price, vatRate: "standard" }], notes: null, due_date: due, payment_terms: "14 days", status: "sent", tags: [] });
  db.tables.invoices.push(inv(I1, "INV-0043", 640, day(-6), day(8)), inv(I2, "INV-0042", 615, day(-20), day(-6)));
  db.tables.invoice_payments = []; db.tables.credit_notes = []; db.tables.invoice_reminders_sent = []; db.tables.invoice_links = []; db.tables.quote_links = [];
  db.tables.quotes = []; db.tables.recurring_expenses = []; db.tables.recurring_invoices = []; db.tables.receipt_pages = [];
  db.tables.receipts = [
    { id: newId(), user_id: "x", document_type: "receipt", paid: true, needs_review: false, date: todayISO(), amount: 50, vat_amount: 10, vendor: "Shell", category: "Fuel" },
    { id: newId(), user_id: "x", document_type: "receipt", paid: true, needs_review: true, date: todayISO(), amount: 4.5, vat_amount: 0, vendor: "NCP Parking", category: "Parking" },
  ];
  return { db, I1 };
};

const fresh = () => {
  const db = makeDb();
  Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
  db.tables.business_profile.push({ user_id: "x", business_name: "", vat_registered: null, invoice_prefix: "", invoice_next_number: 1, address: "", bank_details: "", custom_categories: null });
  return db;
};

const snap = async (page, name, full = false) => {
  await sleep(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("saved", name);
};

// A brand new account: Home, with setting up from an invoice.
{
  const { browser, page } = await launchSignedIn(fresh(), { base: BASE, width: 390, profile: "profile-shots-fresh" });
  try {
    await signIn(page, BASE);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Setting up"), { timeout: 20000 });
    await snap(page, "1-home-new-account", true);
  } finally { await browser.close(); }
}

// An account in use.
{
  const { db, I1 } = seeded();
  const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-shots-used" });
  try {
    await signIn(page, BASE);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await sleep(1200);
    await snap(page, "2-home");
    await page.evaluate(() => [...document.querySelectorAll("header summary")].find((s) => s.textContent.trim().startsWith("Menu"))?.click());
    await snap(page, "3-menu");
    await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
    await snap(page, "4-invoices-with-quotes-tab");
    await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
    await snap(page, "5-receipts-with-review-tab");
    await page.goto(`${BASE}/invoices/${I1}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("How to pay"), { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "How to pay")?.scrollIntoView({ block: "center" }));
    await snap(page, "6-invoice-pay-now");
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.getElementById("payment-link")?.scrollIntoView({ block: "center" }));
    await snap(page, "7-settings-payment-link");
  } finally { await browser.close(); }
}
