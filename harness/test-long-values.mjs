// Long names and big numbers, on a phone. A 60-character company name and
// £1,234,567.89 must not push the page sideways, overlap anything, or have
// digits cut off -- a truncated total is a wrong total to whoever reads it.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
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

const BIG = { id: newId(), user_id: "x", client_id: C, date: today, number: "INV-000400", items: [
  { description: "Structural steelwork, fabrication and erection across the whole of phase two including all fixings", quantity: 1, unitPrice: 1029639.91, vatRate: "standard" },
], notes: "", due_date: day(-40), payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(BIG);
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: BIG.id, date: day(-10), amount: 234567.89, method: "bank", note: "" });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: S, date: today, vendor: "Travis Perkins Trading Company Limited (Kidderminster Branch)", category: "Supplies", amount: 987654.32, vat_amount: 197530.86, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TP-2026-000123456", due_date: day(2), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const PAGES = [["/", "Dashboard"], ["/invoices", "Invoices"], [`/invoices/${BIG.id}`, "The invoice"], ["/receipts", "Receipts"], ["/clients", "Contacts"], ["/expenses", "Expenses"], ["/vat", "VAT"], [`/clients/${C}/statement`, "Statement"]];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-long" });
try {
  await signIn(page, BASE);
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1100);
    const t = await bodyText(page);
    check(`${name} opens with long names and big numbers`, t.length > 60 && !t.includes("Application error"), t.slice(0, 200));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    // Name the elements that stick out, so a failure says where to look.
    const sticking = fits ? [] : await page.evaluate(() => {
      const w = window.innerWidth;
      const out = [...document.querySelectorAll("*")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.right > w + 1 && r.width > 0)
        .map((x) => { let d = 0, n = x.el; while ((n = n.parentElement)) d++; return { ...x, d }; })
        .sort((a, b) => b.d - a.d);
      const wide = [...document.querySelectorAll("*")].filter((el) => el.scrollWidth > w + 1 && getComputedStyle(el).overflowX !== "auto" && getComputedStyle(el).overflowX !== "scroll").map((el) => `WIDE ${el.tagName}.${(el.className||"").toString().slice(0,40)} sw=${el.scrollWidth}`).slice(0, 4);
      if (!out.length) return wide;
      return out.slice(0, 4).map(({ el, r }) => `${el.tagName}.${(el.className || "").toString().slice(0, 40)} right=${Math.round(r.right)} :: ${(el.textContent || "").trim().slice(0, 35)}`);
    });
    check(`${name} doesn't run off a 375px screen`, fits, `${await page.evaluate(() => document.documentElement.scrollWidth)}px | ${sticking.join(" | ")}`);
    // Any element whose whole text is one money figure must show all of it.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll("span, td, dd, p, strong, div")]
        .filter((el) => el.children.length === 0 && /^[−-]?£[\d,]+\.\d{2}$/.test(el.textContent.trim()))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent.trim())
    );
    check(`${name} shows every money figure in full`, cut.length === 0, JSON.stringify(cut));
  }
  // The figures themselves, with separators, on the invoice.
  await page.goto(`${BASE}/invoices/${BIG.id}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const t = await bodyText(page);
  check("a seven-figure total is grouped and complete", t.includes("£1,029,639.91") && t.includes("£1,235,567.89"), t.match(/£[\d,]+\.\d{2}/g)?.join(" ") ?? "none");
  check("the payment and the balance both read in full", t.includes("£234,567.89") && t.includes("£1,001,000.00"), t.match(/£[\d,]+\.\d{2}/g)?.join(" ") ?? "none");
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
