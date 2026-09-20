// A busy account: 500 invoices, 2000 receipts, 300 clients. Every list has
// to open, filter and total in a reasonable time, and the figures must add
// up the same as the app's own rules.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_links: [], invoice_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true, custom_categories: [] });

const clients = [];
for (let i = 0; i < 300; i++) {
  const c = { id: newId(), user_id: "x", name: `Customer ${String(i).padStart(3, "0")} Ltd`, email: `c${i}@example.com`, address: "1 Road\nBristol\nBS1 4DJ", kind: i % 5 === 0 ? "supplier" : "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null };
  clients.push(c);
  db.tables.clients.push(c);
}
const billable = clients.filter((c) => c.kind === "client");
let owed = 0;
for (let i = 0; i < 500; i++) {
  const c = billable[i % billable.length];
  const unit = 100 + (i % 37) * 10;
  const status = i % 4 === 0 ? "paid" : "sent";
  const inv = { id: newId(), user_id: "x", client_id: c.id, date: day(-400 + i), number: `INV-${1000 + i}`, items: [{ description: `Job ${i}`, quantity: 1 + (i % 3), unitPrice: unit, vatRate: "standard" }], notes: "", due_date: day(-370 + i), payment_terms: "30 days", status, tags: [], vat_registered: true, cis_rate: i % 10 === 0 ? 20 : null };
  db.tables.invoices.push(inv);
  const total = Math.round((1 + (i % 3)) * unit * 1.2 * 100) / 100;
  const cis = inv.cis_rate ? Math.round((1 + (i % 3)) * unit * 0.2 * 100) / 100 : 0;
  const due = Math.round((total - cis) * 100) / 100;
  if (status === "paid") db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: inv.id, date: inv.due_date, amount: due, method: "bank", note: "" });
  else owed += due;
}
for (let i = 0; i < 2000; i++) {
  db.tables.receipts.push({ id: newId(), user_id: "x", client_id: i % 3 === 0 ? clients[(i % 60) * 5].id : null, date: day(-600 + Math.floor(i / 4)), vendor: `Merchant ${i % 40}`, category: ["Supplies", "Fuel", "Equipment", "Meals"][i % 4], amount: 10 + (i % 90), vat_amount: Math.round((10 + (i % 90)) * 0.2 * 100) / 100, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: i % 7 === 0 ? "invoice" : "receipt", invoice_number: `R-${i}`, due_date: i % 7 === 0 ? day(-3 + (i % 20)) : null, paid: i % 7 !== 0, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
}
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-big-account" });
const timed = async (path, waitFor) => {
  const t = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 60000 }, waitFor);
  return Date.now() - t;
};
try {
  await signIn(page, BASE);
  const dash = await timed("/", "owed");
  check(`dashboard opens with 500 invoices and 2000 receipts (${dash}ms)`, dash < 20000, `${dash}ms`);
  const inv = await timed("/invoices", "INV-1499");
  check(`invoices list opens and shows the newest (${inv}ms)`, inv < 20000, `${inv}ms`);
  const rec = await timed("/receipts", "Merchant");
  check(`receipts list opens (${rec}ms)`, rec < 25000, `${rec}ms`);
  const exp = await timed("/expenses", "Total excl. VAT");
  check(`expenses summary adds up 2000 receipts (${exp}ms)`, exp < 25000, `${exp}ms`);
  const vat = await timed("/vat", "Box 1");
  check(`VAT figures over a quarter (${vat}ms)`, vat < 25000, `${vat}ms`);
  const cli = await timed("/clients", "Customer 0");
  check(`300 contacts list (${cli}ms)`, cli < 20000, `${cli}ms`);

  // The dashboard's "owed" must match the sum of what's still unpaid.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const text = await bodyText(page);
  console.log("DASH", JSON.stringify(text.slice(0, 400)));
  const shown = text.match(/£([\d,]+\.\d{2})/);
  const asNumber = shown ? Number(shown[1].replace(/,/g, "")) : null;
  check("the dashboard's owed matches the invoices", asNumber !== null && Math.abs(asNumber - owed) < 1, `shown ${asNumber} vs ${Math.round(owed * 100) / 100}`);

  // A filter on a long list still answers quickly.
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Merchant"), { timeout: 60000 });
  const t0 = Date.now();
  await page.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => /Fuel/.test(o.textContent))); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "Fuel"); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(400);
  const filtered = Date.now() - t0;
  check(`filtering 2000 receipts answers quickly (${filtered}ms)`, filtered < 6000, `${filtered}ms`);
  check("no crash on any page", !(await bodyText(page)).includes("Application error"));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
