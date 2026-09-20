// The customer's /q/ page reads right for a company (Attn, VAT number) and a
// private person (neither, even if saved). Dev server on 3300 pointed at the
// local Supabase stand-in on 5555.
import puppeteer from "puppeteer-core";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, newId, sleep } from "./mockdb-qux.mjs";
const BASE = "http://localhost:3300";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const UID = "00000000-0000-4000-8000-000000000001";
const db = makeDb();
const CO = newId(), PR = newId();
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Plastering Ltd", vat_registered: true, vat_number: "GB123" });
db.tables.clients.push(
  { id: CO, user_id: UID, name: "Acme Kitchens Ltd", email: "acme@example.com", address: "5 Works Road", kind: "client", archived: false, is_company: true, contact_person: "Sam Patel", vat_number: "GB999" },
  { id: PR, user_id: UID, name: "Mary O'Neill", email: "mary@example.com", address: "10 Downing Street", kind: "client", archived: false, is_company: false, contact_person: "Should Not Show", vat_number: "GB555" }
);
const quote = (id, clientId, number) => ({ id, user_id: UID, client_id: clientId, number, date: "2026-09-19", valid_until: "2099-01-01", items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", status: "sent", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false });
const Q1 = newId(), Q2 = newId();
db.tables.quotes.push(quote(Q1, CO, "Q-0001"), quote(Q2, PR, "Q-0002"));
const link = (quoteId, c) => ({ quote_id: quoteId, user_id: UID, token: c.repeat(43), created_at: "2026-09-19", first_viewed_at: null, last_viewed_at: null, view_count: 0, response: null, responded_at: null, responder_name: null });
db.tables.quote_links = [link(Q1, "a"), link(Q2, "b")];
db.tables.push_subscriptions = [];
const { server } = startMockServer(5555, db);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 900 });
  await page.goto(`${BASE}/q/${"a".repeat(43)}`, { waitUntil: "networkidle0" });
  await sleep(500);
  let t = await page.evaluate(() => document.body.innerText);
  check("company quote page: Attn and the customer's VAT number", t.includes("Acme Kitchens Ltd") && t.includes("Attn: Sam Patel") && t.includes("VAT: GB999"), t.slice(0, 500));
  await page.goto(`${BASE}/q/${"b".repeat(43)}`, { waitUntil: "networkidle0" });
  await sleep(500);
  t = await page.evaluate(() => document.body.innerText);
  check("private quote page: name and address, no VAT number or Attn", t.includes("Mary O'Neill") && t.includes("10 Downing Street") && !t.includes("GB555") && !t.includes("Should Not Show") && !t.includes("Attn:"), t.slice(0, 500));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  server.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
