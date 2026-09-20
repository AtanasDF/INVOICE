import { makeDb, launchSignedIn, signIn, sleep, newId, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = new URL(".", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const shift = (d) => { const x = new Date(`${today}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const short = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const db = makeDb();
const C = newId(), C2 = newId(), I = newId(), I2 = newId(), I3 = newId();
const client = (o) => ({ user_id: "x", is_company: true, email: "acme@example.com", address: null, kind: "client", vat_number: null, payment_terms: null, default_currency: null, contact_person: null, phone: null, reminders_enabled: true, archived: false, ...o });
db.tables.clients.push(client({ id: C, name: "Acme Ltd" }), client({ id: C2, name: "No Email Co", email: null }));
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false, reminder_late_payment_interest: false });
const inv = (id, clientId, due, status = "sent") => ({ id, user_id: "x", client_id: clientId, date: shift(-40), number: "INV-" + id.slice(-3), items: [{ description: "Work", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: null, due_date: due, payment_terms: null, status, tags: [] });
db.tables.invoices.push(inv(I, C, shift(-10)), inv(I2, C2, shift(-10)), inv(I3, C, shift(-10), "paid"));
db.tables.invoice_reminders_sent = [
  { invoice_id: I, kind: "before", sent_at: `${shift(-13)}T09:00:00Z` },
  { invoice_id: I, kind: "due", sent_at: `${shift(-10)}T09:00:00Z` },
  { invoice_id: I, kind: "after", sent_at: `${shift(-3)}T09:00:00Z` },
];
db.tables.credit_notes = [];

const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${I}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Payment reminders") && document.body.innerText.includes("Sent "), { timeout: 20000 });
  const t = await bodyText(page);
  const card = t.slice(t.indexOf("Payment reminders"), t.indexOf("Send it"));
  console.log(card);
  check("sent ones show their dates", card.includes(`Sent ${short(shift(-13))}`) && card.includes(`Sent ${short(shift(-3))}`), card);
  check("upcoming ones show when", card.includes(`Goes out ${short(shift(4))}`) && card.includes(`Goes out ${short(shift(20))}`), card);
  check("says who it goes to", card.includes("Sent to acme@example.com"));
  const el = await page.evaluateHandle(() => [...document.querySelectorAll("h2")].find((h) => h.textContent === "Payment reminders").parentElement);
  await el.screenshot({ path: OUT + "reminders-card.png" });

  await page.goto(`${BASE}/invoices/${I2}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Payment reminders"), { timeout: 20000 });
  check("client without email: says why", (await bodyText(page)).includes("this client has no email address"));

  await page.goto(`${BASE}/invoices/${I3}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Send it"), { timeout: 20000 });
  check("paid invoice: no reminders card", !(await bodyText(page)).includes("Payment reminders"));
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
