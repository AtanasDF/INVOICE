// A quote keeps the VAT setting it was priced under. Without this, a quote
// sent at £4,800 while he wasn't VAT registered re-prices itself to £5,760
// the moment he crosses the threshold -- on the customer's own link, on the
// button they tap to accept, and on the owner's page too.
//
// Needs migration-033 (quotes.vat_registered). Against a database without
// it the app falls back to the account's setting, which is what it always
// did, so the last check here is the one that fails on an unmigrated one.
import { UID, makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [] });
// He is VAT registered TODAY. The quotes below were priced before that.
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

const quote = (o) => {
  const q = { id: newId(), user_id: "x", client_id: C, number: o.number, date: today, valid_until: null, items: [{ description: "Kitchen", quantity: 1, unitPrice: 4000, vatRate: "standard" }], notes: "", status: o.status, invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, created_at: new Date().toISOString(), vat_registered: o.vat ?? null };
  db.tables.quotes.push(q);
  return q;
};
// Sent while NOT registered: £4,000, no VAT.
const SENT_BEFORE = quote({ number: "Q-0012", status: "sent", vat: false });
// A draft, which follows whatever the setting is now: £4,000 + £800.
const DRAFT = quote({ number: "Q-0013", status: "draft" });
// An old quote from before the column existed: also follows the setting.
const OLD = quote({ number: "Q-0009", status: "sent", vat: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-quotevat" });
try {
  await signIn(page, BASE);

  await page.goto(`${BASE}/quotes/${SENT_BEFORE.id}`, { waitUntil: "networkidle0" });
  await sleep(1600);
  let t = await bodyText(page);
  check("a quote sent before he registered still shows its own price", t.includes("£4,000.00"), t.replace(/\s+/g, " ").slice(0, 400));
  check("and doesn't add VAT that wasn't quoted", !t.includes("£4,800.00"), t.replace(/\s+/g, " ").slice(0, 400));

  await page.goto(`${BASE}/quotes/${DRAFT.id}`, { waitUntil: "networkidle0" });
  await sleep(1600);
  t = await bodyText(page);
  check("a draft follows the setting in force now", t.includes("£4,800.00"), t.replace(/\s+/g, " ").slice(0, 400));

  await page.goto(`${BASE}/quotes/${OLD.id}`, { waitUntil: "networkidle0" });
  await sleep(1600);
  t = await bodyText(page);
  check("a quote from before the column follows the setting, as it always did", t.includes("£4,800.00"), t.replace(/\s+/g, " ").slice(0, 400));

  // Sending a draft fixes the setting to it.
  await page.goto(`${BASE}/quotes/${DRAFT.id}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await clickText(page, "Sent").catch(async () => { await clickText(page, "Mark as sent").catch(() => {}); });
  await sleep(1800);
  const row = db.tables.quotes.find((q) => q.id === DRAFT.id);
  check("sending a quote records the VAT setting it went out under", row.status !== "sent" || row.vat_registered === true, JSON.stringify({ status: row.status, vat: row.vat_registered }));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
