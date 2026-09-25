// Every control needs a name. A button that is only an icon (✕, a torch, a
// chevron) reads as "button" to anyone using VoiceOver, and gives nothing to
// go on when a tap does something unexpected.
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "1 Mill Lane\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
// A document waiting to be checked, so /receipts/review actually renders its
// row. Without one the page is empty and proves nothing -- which is how a
// select with no accessible name sat there unnoticed.
const PENDING = { id: newId(), user_id: "x", client_id: null, date: todayISO(), vendor: "Jewson", category: "", amount: 120, vat_amount: null, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null };

const INV = { id: newId(), user_id: "x", client_id: C, date: todayISO(), number: "INV-9", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: todayISO(), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(INV);
const DRAFT = { ...INV, id: newId(), number: "DRAFT-l", status: "draft" };
db.tables.invoices.push(DRAFT);
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: todayISO(), vendor: "Travis Perkins", category: "Supplies", amount: 50, vat_amount: 10, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.receipts.push(PENDING);

const PAGES = [
  ["/", "Dashboard"], ["/invoices", "Invoices"], [`/invoices/${DRAFT.id}`, "A draft"], [`/invoices/${INV.id}`, "A sent invoice"],
  ["/invoices/new", "New invoice"], ["/receipts", "Receipts"], ["/receipts/new", "New receipt"], ["/quotes", "Quotes"],
  ["/quotes/new", "New quote"], ["/quotes/requests/new", "New quote request"], ["/clients", "Contacts"], ["/clients/new", "New contact"],
  ["/expenses", "Expenses"], ["/vat", "VAT"], ["/mileage", "Mileage"], ["/files", "Files"], ["/settings", "Settings"],
  ["/recurring", "Recurring"], ["/check-company", "Check a company"], ["/free-invoice", "Free invoice"],
  ["/receipts/review", "Needs review"],
];

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-labels" });
const nameless = [];
const unnamedBoxes = [];
try {
  await signIn(page, BASE);
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(800);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], summary")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          el,
          // What a screen reader would announce, roughly.
          name: (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").replace(/\s+/g, " ").trim(),
        }))
        .filter(({ name }) => name.length === 0 || /^[^\p{L}\p{N}]+$/u.test(name))
        .map(({ el, name }) => `${el.tagName}${el.className ? "." + el.className.toString().slice(0, 30) : ""} "${name}"`)
    );
    for (const b of bad) nameless.push(`${name} (${path}): ${b}`);
    // The edit forms sit behind an Edit button on the lists.
    if (path === "/clients" || path === "/receipts") {
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit")?.click());
      await sleep(400);
    }
    // The sent invoice's forms sit behind toggles too.
    if (path === `/invoices/${INV.id}`) {
      for (const t of ["+ New credit note", "+ Record a payment", "Edit details"]) {
        await page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === x)?.click(), t);
        await sleep(250);
      }
    }
    // Every box, select and text area needs a name too: a label pointing at
    // it, a label around it, or an aria-label. A placeholder is not a name;
    // it vanishes as soon as something is typed.
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea")]
        .filter((el) => el.offsetParent !== null || el.type === "file")
        .filter((el) => {
          const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          const wrapped = el.closest("label");
          // A title is a hover tooltip a phone never shows: not a name here.
          const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
          return !byFor && !wrapped && !aria;
        })
        .map((el) => `${el.tagName}${el.type ? "[" + el.type + "]" : ""} placeholder="${el.getAttribute("placeholder") ?? ""}"`)
    );
    for (const b of boxes) unnamedBoxes.push(`${name} (${path}): ${b}`);
    check(`${name} read`, true);
  }
  for (const n of nameless) console.log("NAMELESS", n);
  check(`every button and link has a name (${nameless.length} without)`, nameless.length === 0, String(nameless.length));
  for (const n of unnamedBoxes) console.log("UNNAMED BOX", n);
  check(`every box has a name, not just a placeholder (${unnamedBoxes.length} without)`, unnamedBoxes.length === 0, String(unnamedBoxes.length));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
