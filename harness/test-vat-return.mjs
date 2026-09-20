// The VAT figures for a quarter, on both bases.
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
// Work inside one fixed quarter so the figures don't move with the clock.
const now = new Date();
const q = Math.floor(now.getUTCMonth() / 3);
const prevQ = (q + 3) % 4;
const year = q === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
const m = (i) => String(prevQ * 3 + i).padStart(2, "0");
const inQ = (d) => `${year}-${m(1)}-${String(d).padStart(2, "0")}`;
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_links: [], invoice_links: [] });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Ltd", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "" });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true, custom_categories: [] });
const inv = (o) => ({ id: newId(), user_id: "x", client_id: C, date: inQ(10), number: "INV-1", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: inQ(20), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null, ...o });
// In the quarter: £1000 + £200 VAT, paid inside it. Another £2000 + £400
// VAT, unpaid. A CIS one (CIS never changes VAT). A draft. One before the
// quarter. A credit note of £600 gross inside the quarter.
const A = inv({ number: "INV-100", date: inQ(5) });
const B = inv({ number: "INV-101", date: inQ(12), items: [{ description: "Work", quantity: 1, unitPrice: 2000, vatRate: "standard" }] });
const CIS = inv({ number: "INV-102", date: inQ(15), cis_rate: 20, items: [{ description: "Labour", quantity: 1, unitPrice: 500, vatRate: "standard", kind: "labour" }] });
const OLD = inv({ number: "INV-090", date: `${year}-${m(1)}-01`.replace(m(1), String(prevQ * 3).padStart(2, "0") || "01") });
const DRAFT = inv({ number: "DRAFT-1", status: "draft", date: inQ(9) });
db.tables.invoices.push(A, B, CIS, DRAFT);
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: A.id, date: inQ(20), amount: 1200, method: "bank", note: "" });
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: B.id, date: inQ(25), amount: 600, reason: "Less work" });
const receipt = (o) => ({ id: newId(), user_id: "x", client_id: null, date: inQ(8), vendor: "Screwfix", category: "Supplies", amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null, ...o });
db.tables.receipts.push(receipt({}), receipt({ vendor: "Toolstation", amount: 50, vat_amount: 10, date: inQ(18) }), receipt({ vendor: "Refund", amount: -30, vat_amount: -6, date: inQ(19) }), receipt({ vendor: "Unreviewed", amount: 999, vat_amount: 199.8, needs_review: true, date: inQ(11) }));
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-vat-return" });
const boxes = () => page.evaluate(() => { const out = {}; for (const d of document.querySelectorAll("dl > div")) { const dt = d.querySelector("dt"), dd = d.querySelector("dd"); const mm = dt && dt.innerText.match(/Box ([0-9])/); if (mm && dd) out[mm[1]] = `${dt.innerText} = ${dd.innerText}`; } return out; });
const row = async (n) => (await boxes())[String(n)] ?? "";
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("Expenses links to VAT", (await bodyText(page)).includes("VAT →"));
  await page.goto(`${BASE}/vat`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Box 1"), { timeout: 15000 });
  let t = await bodyText(page);
  // Invoice basis: VAT on 1000 + 2000 + 500 = 700, less 100 credit = 600.
  // Sales ex VAT 3500 − 500 = 3000. Purchases 100 + 50 − 30 = 120, VAT 24.
  check("box 1 counts every issued invoice, less credit notes", t.includes("£600.00"), await row(1));
  check("box 6 is sales ex VAT", (await row(6)).includes("£3,000.00"), await row(6));
  check("box 4 is the VAT on purchases, refunds netted off", (await row(4)).includes("£24.00"), await row(4));
  check("box 7 is purchases ex VAT", (await row(7)).includes("£120.00"), await row(7));
  check("box 5 is the difference, to pay", (await row(5)).includes("£576.00") && (await row(5)).includes("to pay"), await row(5));
  check("a draft is never in it", !t.includes("DRAFT-1"));
  check("unreviewed documents are left out", !t.includes("Unreviewed"), t.slice(0, 200));

  // Cash basis: only the £1200 that actually came in, less the credit note.
  await clickText(page, "When money moved");
  await sleep(400);
  check("cash basis counts money in, not invoices", (await row(1)).includes("£100.00") && (await row(6)).includes("£500.00"), `${await row(1)} | ${await row(6)}`);
  check("it explains what each basis means", (await bodyText(page)).includes("Cash accounting: sales count when the money came in"));

  await clickText(page, "By invoice date");
  await sleep(300);
  await clickText(page, "What's in it");
  await sleep(300);
  t = await bodyText(page);
  check("the lines behind the figures are listed", t.includes("INV-100") && t.includes("INV-101") && t.includes("Credit against INV-101") && t.includes("Screwfix"), t.slice(t.indexOf("Sales ("), t.indexOf("Sales (") + 200));
  check("it says it isn't a filing", t.includes("not a filing"));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
