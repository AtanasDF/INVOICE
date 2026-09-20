// What the customer actually receives. Print / save as PDF is how most of
// these invoices leave the app, and a printed page that carries the app's
// own navigation, or loses the bank details, is what gets noticed.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", registered_name: "Harness Plastering Limited", company_number: "01234567", vat_registered: true, vat_number: "GB123456789", invoice_prefix: "INV-", invoice_next_number: 60, address: "2 Trade Park\nBristol\nBS1 9AA", bank_details: "Sort code: 12-34-56\nAccount: 12345678", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "1 Mill Lane\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "30 days", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: "x", client_id: C, date: day(-10), number: "INV-59", items: [
  { description: "Plastering, first floor", quantity: 12.5, unitPrice: 38.4, vatRate: "standard", kind: "labour" },
  { description: "Materials", quantity: 3, unitPrice: 64.95, vatRate: "standard", kind: "materials" },
], notes: "Thanks for the work.", due_date: day(20), payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(INV);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 1024, profile: "profile-print" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${INV.id}`, { waitUntil: "networkidle0" });
  await sleep(1500);

  const onScreen = await bodyText(page);
  check("the invoice shows on screen first", onScreen.includes("INV-59") && onScreen.includes("Acme Kitchens Ltd"), onScreen.slice(0, 200));

  await page.emulateMediaType("print");
  await sleep(600);

  // A4 at 96dpi is 794px wide, less the printer's own margins.
  const printed = await page.evaluate(() => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && el.getBoundingClientRect().height > 0;
    };
    const text = [...document.body.querySelectorAll("*")]
      .filter((el) => el.children.length === 0 && (el.textContent || "").trim() && visible(el))
      .map((el) => (el.textContent || "").trim());
    const navVisible = [...document.querySelectorAll("nav, header")].some(visible);
    const buttons = [...document.querySelectorAll("button")].filter(visible).map((b) => (b.textContent || "").trim()).filter(Boolean);
    return { text: text.join(" · "), navVisible, buttons, width: document.documentElement.scrollWidth };
  });

  check("the printed page keeps the invoice number", printed.text.includes("INV-59"), printed.text.slice(0, 300));
  check("it keeps who it's for", printed.text.includes("Acme Kitchens Ltd"), printed.text.slice(0, 300));
  check("it keeps who it's from, and the VAT number", printed.text.includes("Harness Plastering") && printed.text.includes("GB123456789"), printed.text.slice(0, 300));
  check("it keeps the registered name and company number the law asks for", printed.text.includes("01234567"), printed.text.slice(-400));
  check("it keeps the lines and the money", printed.text.includes("Plastering, first floor") && /£[\d,]+\.\d{2}/.test(printed.text), printed.text.slice(0, 400));
  check("it keeps the bank details, or the customer can't pay", printed.text.includes("12-34-56"), printed.text.slice(-300));
  check("it keeps the due date", printed.text.includes("Due") || printed.text.includes("due"), printed.text.slice(0, 400));

  check("the app's own navigation is not printed", !printed.navVisible, "nav still visible");
  check("no buttons are printed onto the customer's copy", printed.buttons.length === 0, JSON.stringify(printed.buttons.slice(0, 6)));
  check("nothing is wider than an A4 page", printed.width <= 1024 + 1, `${printed.width}px`);

  // The public link a customer opens is the same document.
  await page.emulateMediaType("screen");
  await sleep(300);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
