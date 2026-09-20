import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const today = new Date().toISOString().slice(0, 10);
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [] });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "First Customer Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const A = { id: newId(), user_id: "x", client_id: C, date: today, number: "DRAFT-x", items: [{ description: "Job", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: null, payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null };
db.tables.invoices.push(A);
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-probenum" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${A.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as sent"), { timeout: 20000 });
  await clickText(page, "Mark as sent");
  await sleep(500);
  console.log("PANEL:", JSON.stringify((await bodyText(page)).slice(-700)));
  await clickText(page, "Confirm & mark as sent");
  await sleep(2000);
  console.log("AFTER:", JSON.stringify((await bodyText(page)).slice(-700)));
  console.log("RPC CALLS:", JSON.stringify(db.log.map((l) => l.key).filter((k) => !k.startsWith("GET"))));
  console.log("PROFILE ROWS:", db.tables.business_profile.length);
  console.log("INVOICE:", JSON.stringify({ number: A.number, status: A.status }));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
