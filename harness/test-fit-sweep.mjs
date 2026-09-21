// Every signed-in page at 375px: nothing wider than the screen.
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [] });
const client = (o) => ({ id: newId(), user_id: "x", is_company: true, email: "a@b.example", address: "1 Long Street Name\nSomewhere Town\nAB1 2CD", kind: "client", vat_number: "GB123456789", payment_terms: "30 days", default_currency: null, contact_person: "Sam Patel", phone: "07700 900123", reminders_enabled: true, archived: false, ...o });
const C = client({ name: "Acme Kitchens and Bathrooms Refurbishment Ltd" });
const S = client({ name: "Builders Merchant Supplies (Bristol) Ltd", kind: "supplier" });
db.tables.clients.push(C, S);
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", address: "1 Test Street", vat_number: "GB123", vat_registered: true, bank_details: "Sort 12-34-56 Acc 12345678" });
const inv = (o) => ({ id: newId(), user_id: "x", client_id: C.id, date: todayISO(), number: "INV-000123", items: [{ description: "Skim coat to kitchen ceiling and walls including making good", quantity: 3, unitPrice: 1234.56, vatRate: "standard" }], notes: "Thanks", due_date: todayISO(), payment_terms: "30 days", status: "sent", tags: ["Site A"], vat_registered: true, cis_rate: null, ...o });
const DRAFT = inv({ status: "draft", number: "DRAFT-1", vat_registered: null });
const SENT = inv({});
const PAID = inv({ status: "paid", number: "INV-000124" });
const CIS = inv({ number: "INV-000125", cis_rate: 20 });
db.tables.invoices.push(DRAFT, SENT, PAID, CIS);
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: PAID.id, date: todayISO(), amount: 4444.42, method: "bank", note: "" });
const Q = { id: newId(), user_id: "x", client_id: C.id, number: "Q-0100", date: todayISO(), valid_until: todayISO(), items: [{ description: "Skim coat", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", status: "sent", invoice_id: null, deposit_percent: 25, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false };
db.tables.quotes.push(Q);
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: S.id, date: todayISO(), vendor: "Builders Merchant Supplies (Bristol) Limited", category: "Materials", amount: 100, vat_amount: 20, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "IN178077", due_date: todayISO(), paid: false, details: { orderNumber: "ORD-123456789" }, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const WIDTH = Number(process.env.WIDTH ?? 375);
// A profile per width, so the 320 and 375 runs can go at once.
const { browser, page } = await launchSignedIn(db, { base: BASE, width: WIDTH, profile: `profile-fit-sweep-${WIDTH}` });
page.on("dialog", (d) => d.dismiss());
const pages = ["/mileage", "/vat", "/quotes/requests", "/check-company", "/", "/invoices", `/invoices/${DRAFT.id}`, `/invoices/${SENT.id}`, `/invoices/${PAID.id}`, `/invoices/${CIS.id}`, "/invoices/new", "/receipts", "/receipts/new", "/quotes", `/quotes/${Q.id}`, "/quotes/new", "/clients", "/clients?tab=supplier", "/clients/new", "/expenses", "/recurring", "/recurring/invoices", "/settings", "/files", "/feedback", "/free-invoice"];
try {
  await signIn(page, BASE);
  for (const p of pages) try {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(700);
    const wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.right > window.innerWidth + 1) || getComputedStyle(e).position === "fixed") return false; // inside something that scrolls sideways on purpose (a wide table in its own box) is fine
      for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return false; } return true; }).filter((e, _, all) => !all.some((o) => o !== e && o.contains(e))).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)} r=${Math.round(e.getBoundingClientRect().right)} "${(e.innerText ?? "").replace(/\s+/g, " ").slice(0, 40)}"`));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${p} fits ${WIDTH}px`, sw <= WIDTH + 1 && !wide.length, `scrollWidth ${sw} ${JSON.stringify(wide)}`);
  } catch (e) { console.log("SKIP", p, e.message.slice(0, 80), await page.evaluate(() => location.pathname).catch(() => "")); }
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
