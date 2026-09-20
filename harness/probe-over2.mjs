import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const mod = await import("./test-long-values-seed.mjs").catch(() => null);
const today = new Date().toISOString().slice(0, 10);
const LONGER = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch Joinery & Shopfitting Co-operative Limited";
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Worcestershire & Herefordshire Building Contractors Limited", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 400, address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", bank_details: "Sort code: 12-34-56", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: LONGER, email: "accounts.payable.department@herefordshire-building-contractors.co.uk", address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "GB123456789", payment_terms: "30 days", default_currency: "", contact_person: "Mr Jonathan Fitzwilliam-Hetherington", phone: "01562 123456", company_number: "01234567" });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Travis Perkins Trading Company Limited (Kidderminster Branch)", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const BIG = { id: newId(), user_id: "x", client_id: C, date: today, number: "INV-000400", items: [{ description: "Structural steelwork across phase two", quantity: 1, unitPrice: 1029639.91, vatRate: "standard" }], notes: "", due_date: today, payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(BIG);
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: S, date: today, vendor: "Travis Perkins Trading Company Limited (Kidderminster Branch)", category: "Supplies", amount: 987654.32, vat_amount: 197530.86, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TP-2026-000123456", due_date: today, paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-over2" });
try {
  await signIn(page, BASE);
  for (const path of ["/", "/invoices", "/clients"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1200);
    const info = await page.evaluate(() => {
      const w = window.innerWidth;
      const rows = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right <= w + 1 || r.width === 0) continue;
        const cs = getComputedStyle(el);
        const depth = (() => { let d = 0, n = el; while ((n = n.parentElement)) d++; return d; })();
        rows.push({ depth, tag: el.tagName, cls: (el.className || "").toString().slice(0, 55), right: Math.round(r.right), w: Math.round(r.width), pos: cs.position, ov: cs.overflowX, text: (el.textContent || "").trim().slice(0, 35) });
      }
      rows.sort((a, b) => b.depth - a.depth);
      return rows.slice(0, 6);
    });
    console.log("==", path);
    for (const r of info) console.log("   ", JSON.stringify(r));
  }
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
