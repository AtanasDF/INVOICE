// Quotes sent and gone quiet: a nudge on the list, ready to text.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_links: [] });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Jane Customer", email: "jane@example.com", phone: "07700 900123", address: "", kind: "client", archived: false, is_company: false, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "" });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true });
const quote = (o) => ({ id: newId(), user_id: "x", client_id: C, number: "Q-1", date: day(-9), valid_until: day(21), items: [{ description: "Skim", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", status: "sent", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, ...o });
const QUIET = quote({ number: "Q-QUIET", date: day(-9) });
const FRESH = quote({ number: "Q-FRESH", date: day(-1) });
const DRAFT = quote({ number: "Q-DRAFT", status: "draft", date: day(-30) });
const ACCEPTED = quote({ number: "Q-ACCEPTED", status: "accepted", date: day(-30) });
const EXPIRED = quote({ number: "Q-EXPIRED", date: day(-40), valid_until: day(-2) });
db.tables.quotes.push(QUIET, FRESH, DRAFT, ACCEPTED, EXPIRED);
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-quote-chase" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Quotes"), { timeout: 15000 });
  await sleep(600);
  const t = await bodyText(page);
  const section = await page.evaluate(() => [...document.querySelectorAll("section")].find((x) => x.innerText.includes("Waiting on an answer"))?.innerText ?? "");
  check("a quiet quote is raised", t.includes("Waiting on an answer") && section.includes("Q-QUIET") && section.includes("sent 9 days ago"), section.slice(0, 200));
  check("a quote sent yesterday is left alone", !section.includes("Q-FRESH"));
  check("drafts, accepted and expired ones are left alone", !section.includes("Q-DRAFT") && !section.includes("Q-ACCEPTED") && !section.includes("Q-EXPIRED"));
  check("the total and how long it holds are shown", section.includes("£600.00") && section.includes("holds until"), section.slice(0, 220));
  const msg = await page.evaluate(() => document.querySelector("#text-customer-message")?.value ?? "");
  check("the message is ready to send", /just checking you got the quote for £600\.00/.test(msg) && /any thoughts/i.test(msg), msg);
  const sms = await page.evaluate(() => document.querySelector('a[href^="sms:"]')?.getAttribute("href") ?? "");
  check("it goes to their mobile", sms.startsWith("sms:+447700900123"), sms.slice(0, 60));
  check("WhatsApp is there too", await page.evaluate(() => !!document.querySelector('a[href^="https://wa.me"]')));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
