// Which keyboard the phone brings up. A money field that opens the full
// QWERTY keyboard costs a tap and a mis-type every single time; an email
// field without the @ key does the same. Walks every form and reports any
// field whose label says money/email/phone/number but whose input doesn't.
import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "1 Mill Lane\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: "x", client_id: C, date: today, number: "DRAFT-k", items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: null, payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null };
db.tables.invoices.push(INV);

const PAGES = [
  ["/receipts/new", "New receipt"],
  ["/invoices/new", "New invoice"],
  ["/quotes/new", "New quote"],
  ["/quotes/requests/new", "New quote request"],
  ["/clients/new", "New contact"],
  ["/recurring", "Recurring expenses"],
  ["/recurring/invoices", "Recurring invoices"],
  ["/settings", "Settings"],
  ["/mileage", "Mileage"],
  [`/invoices/${INV.id}`, "A draft invoice"],
  ["/free-invoice", "Free invoice page"],
];

// What the field is for, read from its own label, placeholder or name.
const WANTS = [
  { kind: "money", re: /£|amount|price|total|paid|deposit|rate\b|balance|vat(?!.*number)/i, ok: (f) => f.inputMode === "decimal" || f.inputMode === "numeric" || f.type === "number" },
  { kind: "email", re: /e-?mail/i, ok: (f) => f.type === "email" || f.inputMode === "email" },
  { kind: "phone", re: /phone|mobile|tel\b/i, ok: (f) => f.type === "tel" || f.inputMode === "tel" },
  { kind: "number", re: /quantity|qty|miles|day of month|next number|months/i, ok: (f) => f.type === "number" || f.inputMode === "decimal" || f.inputMode === "numeric" },
];

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-keyboards" });
const wrong = [];
try {
  await signIn(page, BASE);
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(900);
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll("input")]
        .filter((i) => !["hidden", "checkbox", "radio", "file", "date", "submit", "button", "color", "range"].includes(i.type))
        .map((i) => {
          // Only a label that really belongs to this input: its own <label>,
          // or one immediately before it. A "closest div" search picks up a
          // neighbour's label and invents problems that aren't there.
          const own = i.labels?.[0]?.textContent ?? "";
          const prev = i.previousElementSibling?.tagName === "LABEL" ? i.previousElementSibling.textContent : "";
          const parentLabel = i.parentElement?.tagName === "DIV" && i.parentElement.children.length <= 3 ? (i.parentElement.querySelector("label")?.textContent ?? "") : "";
          return { id: i.id, where: (own || prev || parentLabel || i.placeholder || i.name || i.getAttribute("aria-label") || "").trim().slice(0, 60), type: i.type, inputMode: i.inputMode, placeholder: i.placeholder };
        })
    );
    for (const f of fields) {
      // Its placeholder wins when it has one: a label picked up from a
      // neighbouring row would otherwise condemn a plain text box.
      const text = f.placeholder || f.where;
      const want = WANTS.find((w) => w.re.test(text));
      if (want && !want.ok(f)) wrong.push({ page: name, path, field: f.where, placeholder: f.placeholder, id: f.id, kind: want.kind, type: f.type, inputMode: f.inputMode || "(none)" });
    }
    check(`${name} read`, true);
  }
  for (const w of wrong) console.log("WRONG", JSON.stringify(w));
  check(`every money, email, phone and number field asks for the right keyboard (${wrong.length} wrong)`, wrong.length === 0, `${wrong.length}`);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
