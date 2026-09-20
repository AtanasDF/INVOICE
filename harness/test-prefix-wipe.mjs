// Clearing the invoice prefix, which is exactly what Atanas wants (a bare
// numeric series from 357358, not "INV-357358"), used to be a trap. The
// database function builds the number as `invoice_prefix || number`, and
// in Postgres that is NULL if the prefix is NULL -- which raises the same
// "No business profile found" as a genuinely new account. The app's
// recovery for that case saved the default profile, which on an existing
// row is an upsert: business name, address, bank details, VAT registration
// and the email-import token all blanked, and the counter reset to 1.
import { UID, makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [] });
// A real, filled-in account, with the prefix cleared: exactly the row a
// save from Settings used to leave behind.
// The signed-in account's own id, not a placeholder: the bug was an upsert
// keyed on user_id replacing this row, and a row owned by someone else
// would quietly fail to reproduce it.
db.tables.business_profile.push({
  user_id: UID,
  business_name: "Harness Plastering Ltd",
  vat_number: "GB123456789",
  vat_registered: true,
  address: "2 Trade Park\nBristol",
  bank_details: "Sort 12-34-56 Acc 12345678",
  inbox_token: "a-real-inbox-token",
  invoice_prefix: null,
  invoice_next_number: 357358,
  custom_categories: null,
  reminder_text_before: "My own wording",
});
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const DRAFT = { id: newId(), user_id: "x", client_id: C, date: todayISO(), number: "DRAFT-x", items: [{ description: "Work", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: null, payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null };
db.tables.invoices.push(DRAFT);

const profile = () => db.tables.business_profile[0];

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-prefixwipe" });
try {
  await signIn(page, BASE);

  await page.goto(`${BASE}/invoices/${DRAFT.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as sent"), { timeout: 20000 });
  await clickText(page, "Mark as sent");
  await sleep(500);
  await clickText(page, "Confirm & mark as sent");
  await sleep(2500);

  const p = profile();
  check("the business name survives", p.business_name === "Harness Plastering Ltd", String(p.business_name));
  check("the VAT registration survives", p.vat_registered === true, String(p.vat_registered));
  check("the VAT number survives", p.vat_number === "GB123456789", String(p.vat_number));
  check("the address survives", (p.address ?? "").includes("Trade Park"), String(p.address));
  check("the bank details survive — a customer can still pay", (p.bank_details ?? "").includes("12-34-56"), String(p.bank_details));
  check("the email-import token survives", p.inbox_token === "a-real-inbox-token", String(p.inbox_token));
  check("his own reminder wording survives", p.reminder_text_before === "My own wording", String(p.reminder_text_before));
  check("the counter is NOT reset to 1", p.invoice_next_number > 357358, String(p.invoice_next_number));

  const issued = db.tables.invoices.find((i) => i.id === DRAFT.id);
  check("the invoice is issued anyway, rather than failing", issued.status === "sent", issued.status);
  check("and numbered from where his series actually is", issued.number === "357358", issued.number);
  check("the prefix is repaired to empty, not left null", p.invoice_prefix === "", JSON.stringify(p.invoice_prefix));
  check("the invoice carries the VAT registration it was issued under", issued.vat_registered === true, String(issued.vat_registered));

  const t = await bodyText(page);
  check("nothing about a missing business profile reaches the screen", !/business profile/i.test(t), t.replace(/\s+/g, " ").slice(0, 300));

  // The next one follows on, with no prefix.
  const SECOND = { ...DRAFT, id: newId(), number: "DRAFT-y", status: "draft" };
  db.tables.invoices.push(SECOND);
  await page.goto(`${BASE}/invoices/${SECOND.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as sent"), { timeout: 20000 });
  await clickText(page, "Mark as sent");
  await sleep(500);
  await clickText(page, "Confirm & mark as sent");
  await sleep(2200);
  check("the series carries on with no prefix", db.tables.invoices.find((i) => i.id === SECOND.id)?.number === "357359", db.tables.invoices.find((i) => i.id === SECOND.id)?.number);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
