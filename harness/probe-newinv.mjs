import { makeDb, launchSignedIn, signIn, sleep, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [] });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Mrs Henderson", email: "h@example.com", address: "", kind: "client", archived: false, is_company: false, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-probenewinv" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const f = await page.evaluate(() => ({
    inputs: [...document.querySelectorAll("input, textarea")].slice(0, 12).map((i) => `${i.tagName}:${i.type}:${(i.placeholder||"").slice(0,26)}:${(i.labels?.[0]?.textContent||"").trim().slice(0,22)}`),
    selects: [...document.querySelectorAll("select")].map((s) => [...s.options].slice(0, 3).map((o) => o.textContent.trim()).join("/")),
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 14),
  }));
  console.log(JSON.stringify(f, null, 1));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
