// Neutral greys across the app (house style; the sweep, 2026-09-22): no
// blue links, no red Remove links. Colour is kept only where it carries
// meaning — status badges (round), the amber banners, red alerts, and money
// that is overdue or negative. Every signed-in page is read through the
// mock; any other visible blue-ish or red-ish text fails, naming it.
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [], quotes: db.tables.quotes ?? [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Nasko Plastering", vat_registered: true, custom_categories: null, invoice_prefix: "INV-", invoice_next_number: 30, inbox_token: "0123456789abcdef0123456789abcdef" });
const CLIENT = newId(), SUPPLIER = newId(), INV = newId(), DRAFT = newId();
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Big Co Ltd", email: "pay@bigco.example", address: "2 Client Road\nLeeds\nLS1 2AB", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "14 days", phone: "" });
db.tables.clients.push({ id: SUPPLIER, user_id: "x", name: "Toolstation", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: false, vat_number: "", payment_terms: "", phone: "" });
db.tables.invoices.push({ id: INV, user_id: "x", client_id: CLIENT, date: day(-20), number: "INV-000029", items: [{ description: "Plastering", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: day(-6), payment_terms: "14 days", status: "partial", tags: [], vat_registered: true, cis_rate: null });
db.tables.invoices.push({ id: DRAFT, user_id: "x", client_id: CLIENT, date: todayISO(), number: "DRAFT-1", items: [{ description: "Skim", quantity: 2, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: day(14), payment_terms: "14 days", status: "draft", tags: [], vat_registered: null, cis_rate: null });
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: INV, date: day(-10), amount: 50, reason: "Damaged corner" });
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: INV, date: day(-5), amount: 100, method: "bank" });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: SUPPLIER, date: day(-3), vendor: "Toolstation", category: "Materials & stock", amount: 84.2, vat_amount: 14.03, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TS-4411", due_date: day(4), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-1), vendor: "Screwfix", category: "Tools & equipment", amount: 20, vat_amount: 4, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: ["via-email"], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", description: "Van insurance", category: "Insurance", amount: 40, vat_amount: 8, supplier_id: SUPPLIER, day_of_month: 1, next_due_date: day(9), active: true });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: CLIENT, items: [{ description: "Monthly maintenance", quantity: 1, unitPrice: 200, vatRate: "standard" }], payment_terms: "14 days", notes: "", day_of_month: 1, next_due_date: day(9), active: true });

const PAGES = ["/", "/invoices", `/invoices/${INV}`, `/invoices/${DRAFT}`, "/invoices/new", "/receipts", "/receipts/new", "/receipts/review", "/quotes", "/quotes/new", "/clients", "/clients/new", "/expenses", "/vat", "/mileage", "/files", "/recurring", "/recurring/invoices", "/settings", "/feedback"];
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-neutral" });
try {
  await signIn(page, BASE);
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(800);
    // The edit forms and the history sit behind buttons.
    await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /^(Edit|Payment history)$/.test(b.textContent.trim())).slice(0, 2).forEach((b) => b.click()));
    await sleep(300);
    const coloured = await page.evaluate(() => {
      const ctx = document.createElement("canvas").getContext("2d");
      const rgb = (c) => { ctx.fillStyle = "#000"; ctx.fillStyle = c; ctx.clearRect(0, 0, 1, 1); ctx.fillRect(0, 0, 1, 1); const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b]; };
      const out = [];
      for (const el of document.querySelectorAll("main a, main button, main span, main p, main div, main li, main td, main th, main label, main h1, main h2, main h3")) {
        if (!el.offsetParent) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        if (el.closest('[role="alert"], .rounded-full, .bg-amber-50, .bg-amber-100, [data-colour-ok]')) continue;
        const cs = getComputedStyle(el);
        const [r, g, b] = rgb(cs.color);
        const text = el.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
        // Red stays where it means something: money owed or overdue, a due date gone by.
        const redMoney = /£|Overdue|overdue|late|Late|owed|due /.test(text) || /£/.test(el.parentElement?.textContent ?? "");
        const blueish = b > r + 60 && b > g + 30;
        // Amber (the banners' text) has more green in it than red does.
        const reddish = r > g + 60 && r > b + 60 && g < 60;
        if (blueish) out.push(`blue ${el.tagName} "${text}"`);
        else if (reddish && !redMoney) out.push(`red ${el.tagName} "${text}"`);
      }
      return out;
    });
    check(`${path}: nothing blue, nothing red outside alerts, badges and money`, coloured.length === 0, JSON.stringify(coloured.slice(0, 6)));
  }
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
