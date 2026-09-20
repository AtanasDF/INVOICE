import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const today = new Date().toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const LONG = "Worcestershire & Herefordshire Building Contractors Limited";
const LONGER = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch Joinery & Shopfitting Co-operative Limited";
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: LONG, vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 400, address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", bank_details: "Sort code: 12-34-56\nAccount: 12345678", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: LONGER, email: "accounts.payable.department@herefordshire-building-contractors.co.uk", address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "GB123456789", payment_terms: "30 days", default_currency: "", contact_person: "Mr Jonathan Fitzwilliam-Hetherington", phone: "01562 123456", company_number: "01234567" });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Travis Perkins Trading Company Limited (Kidderminster Branch)", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const BIG = { id: newId(), user_id: "x", client_id: C, date: today, number: "INV-000400", items: [{ description: "Structural steelwork, fabrication and erection across the whole of phase two including all fixings", quantity: 1, unitPrice: 1029639.91, vatRate: "standard" }], notes: "", due_date: day(-40), payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(BIG);
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: BIG.id, date: day(-10), amount: 234567.89, method: "bank", note: "" });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: S, date: today, vendor: "Travis Perkins Trading Company Limited (Kidderminster Branch)", category: "Supplies", amount: 987654.32, vat_amount: 197530.86, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TP-2026-000123456", due_date: day(2), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-text" });
try {
  await signIn(page, BASE);
  for (const path of [`/clients/${C}/statement`]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1200);
    const out = await page.evaluate(() => {
      const w = window.innerWidth, hits = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const box = r.getBoundingClientRect();
        if (box.right > w + 1 && box.width > 0 && !n.parentElement?.closest(".overflow-x-auto")) hits.push(`${Math.round(box.right)} :: ${(n.parentElement?.className || "").toString().slice(0, 45)} :: ${n.textContent.trim().slice(0, 40)}`);
      }
      return hits.slice(0, 6);
    });
    console.log("==", path, "\n   " + out.join("\n   "));
  }
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
