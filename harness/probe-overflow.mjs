import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const LONGER = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch Joinery & Shopfitting Co-operative Limited";
const today = new Date().toISOString().slice(0, 10);
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Worcestershire & Herefordshire Building Contractors Limited", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 400, address: "Unit 14\nKidderminster\nDY10 1HS", bank_details: "Sort: 12-34-56", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: LONGER, email: "accounts.payable.department@herefordshire-building-contractors.co.uk", address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "GB123456789", payment_terms: "30 days", default_currency: "", contact_person: "Mr Jonathan Fitzwilliam-Hetherington", phone: "01562 123456", company_number: "01234567" });
const BIG = { id: newId(), user_id: "x", client_id: C, date: today, number: "INV-000400", items: [{ description: "Structural steelwork across phase two", quantity: 1, unitPrice: 1029639.91, vatRate: "standard" }], notes: "", due_date: today, payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(BIG);
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: today, vendor: "Travis Perkins Trading Company Limited (Kidderminster Branch)", category: "Supplies", amount: 987654.32, vat_amount: 197530.86, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-overflow" });
try {
  await signIn(page, BASE);
  for (const path of ["/", "/invoices", `/invoices/${BIG.id}`, "/clients", `/clients/${C}/statement`]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1100);
    const over = await page.evaluate(() => {
      const w = window.innerWidth;
      return [...document.querySelectorAll("*")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.right > w + 1 && r.width > 0)
        .slice(0, 8)
        .map(({ el, r }) => `${el.tagName}.${(el.className || "").toString().slice(0, 60)} right=${Math.round(r.right)} w=${Math.round(r.width)} :: ${(el.textContent || "").trim().slice(0, 45)}`);
    });
    console.log("==", path);
    for (const o of over) console.log("   ", o);
  }
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
