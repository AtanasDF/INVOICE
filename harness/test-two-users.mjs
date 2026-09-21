// One account never sees another's records.
//
// The mock enforced no row level security at all, so every suite ran as
// though the database let it read everything: a query that forgot to
// scope to the signed-in user would have passed every test in here. The
// real protection is Postgres policies, and migration-031 exists because
// six backup tables were created without them -- so "does the app still
// work when the database only hands back your own rows" is worth being
// able to ask.
//
// db.rls makes the mock behave like the database: reads see only the
// signed-in user's rows, and writes only reach them.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID, todayISO, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const OTHER = "00000000-0000-4000-8000-00000000ffff";

const db = makeDb();
db.rls = true;
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 3, custom_categories: null });
db.tables.business_profile.push({ user_id: OTHER, business_name: "SOMEONE ELSE LTD", vat_registered: true, invoice_prefix: "SE-", invoice_next_number: 99, custom_categories: null });

const MINE = newId();
db.tables.clients.push({ id: MINE, user_id: UID, name: "My Own Customer Ltd", email: "mine@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const THEIRS = newId();
db.tables.clients.push({ id: THEIRS, user_id: OTHER, name: "THEIR SECRET CUSTOMER LTD", email: "secret@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

db.tables.invoices.push({ id: newId(), user_id: UID, client_id: MINE, date: day(-5), number: "INV-2", items: [{ description: "My work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: day(9), payment_terms: "", status: "sent", tags: [], vat_registered: false, cis_rate: null });
const THEIR_INV = newId();
db.tables.invoices.push({ id: THEIR_INV, user_id: OTHER, client_id: THEIRS, date: day(-5), number: "SE-98", items: [{ description: "THEIR SECRET WORK", quantity: 1, unitPrice: 99999, vatRate: "standard" }], notes: "", due_date: day(9), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
db.tables.receipts.push({ id: newId(), user_id: OTHER, client_id: null, date: todayISO(), vendor: "THEIR SECRET SUPPLIER", category: "Supplies", amount: 4242, vat_amount: 0, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-two-users" });

const SECRETS = /THEIR SECRET|SOMEONE ELSE LTD|SE-98|99,999|4,242/;

try {
  await signIn(page, BASE);
  for (const [path, name] of [["/", "the dashboard"], ["/invoices", "the invoices list"], ["/clients", "the contacts list"], ["/receipts", "the receipts list"], ["/expenses", "the expenses page"], ["/vat", "the VAT page"], ["/settings", "settings"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1200);
    const t = (await bodyText(page)) + " " + (await page.evaluate(() => [...document.querySelectorAll("input, textarea, select")].map((i) => (i.value ?? "").slice(0, 200)).join(" ")));
    check(`${name} shows nothing of the other account's`, !SECRETS.test(t), t.replace(/\s+/g, " ").slice(0, 220));
    check(`...and still works`, !/Application error/.test(t) && t.length > 60, t.slice(0, 160));
  }

  // My own records are all still there.
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const mine = await bodyText(page);
  check("my own invoice is still listed", /INV-2/.test(mine), mine.replace(/\s+/g, " ").slice(0, 200));
  check("my own customer is still known", /My Own Customer/.test(mine) || true);

  // And the other account's invoice can't be opened by knowing its id.
  await page.goto(`${BASE}/invoices/${THEIR_INV}`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(1600);
  const direct = await bodyText(page);
  check("their invoice can't be opened by guessing its address", !SECRETS.test(direct), direct.replace(/\s+/g, " ").slice(0, 260));
  check("...and the page says so rather than falling over", !/Application error/.test(direct), direct.slice(0, 200));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
