import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb-qux.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const C = newId(), C2 = newId(), I1 = newId(), Q1 = newId();
db.tables.business_profile.push({ business_name: "Harness Plumbing", vat_registered: false });
db.tables.clients.push(
  { id: C, user_id: "x", name: "Acme Ltd", email: "acme@example.com", kind: "client", archived: false, is_company: true, contact_person: "Jane Smith", phone: "07700 900123", reminders_enabled: true },
  { id: C2, user_id: "x", name: "Bob Jones", email: "", kind: "client", archived: false, is_company: false, contact_person: "", phone: "", reminders_enabled: true }
);
db.tables.invoices.push({ id: I1, user_id: "x", client_id: C, date: "2026-09-01", number: "INV-1", items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: null, due_date: "2026-10-01", payment_terms: "30 days", status: "sent", tags: [] });
db.tables.quotes = [{ id: Q1, user_id: "x", client_id: C2, number: "Q-0001", date: "2026-09-10", valid_until: "2026-10-10", items: [{ description: "Boiler", quantity: 1, unitPrice: 900, vatRate: "standard" }], notes: null, status: "accepted", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false }];
db.tables.invoice_payments = []; db.tables.credit_notes = []; db.tables.invoice_reminders_sent = []; db.tables.invoice_links = []; db.tables.quote_links = [];
const waitText = (page, t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 20000 }, t);
const card = (page, title) => page.evaluate((t) => { const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === t); const c = h?.closest(".rounded-xl"); return c ? { text: c.innerText, message: c.querySelector("textarea")?.value, sms: c.querySelector('a[href^="sms:"]')?.getAttribute("href"), wa: c.querySelector('a[href^="https://wa.me"]')?.getAttribute("href") } : null; }, title);
const chip = (page, title, label) => page.evaluate((t, l) => { const c = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === t).closest(".rounded-xl"); [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === l).click(); }, title, label);
const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${I1}`, { waitUntil: "networkidle0" });
  await waitText(page, "Text Acme Ltd");
  let c = await card(page, "Text Acme Ltd");
  check("issued invoice: 'Job done' first, greeting the company's contact", c.message.startsWith("Hi Jane, the job's all done") && !c.message.includes("/i/"), c.message);
  check("no link made just by opening the page", db.tables.invoice_links.length === 0);
  check("text and WhatsApp links use the UK number", c.sms?.startsWith("sms:+447700900123?&body=Hi%20Jane") && c.wa?.startsWith("https://wa.me/447700900123?text="), `${c.sms} ${c.wa}`);
  await chip(page, "Text Acme Ltd", "Add a link to the invoice");
  await sleep(1200);
  c = await card(page, "Text Acme Ltd");
  check("adding the link puts the private invoice link in", db.tables.invoice_links.length === 1 && /\/i\/[A-Za-z0-9_-]{43}/.test(c.message) && decodeURIComponent(c.sms).includes("/i/"), c.message);
  await chip(page, "Text Acme Ltd", "Running late");
  await chip(page, "Text Acme Ltd", "45 min");
  c = await card(page, "Text Acme Ltd");
  check("running late with minutes", c.message === "Hi Jane, it's Harness Plumbing. Sorry, I'm running about 45 minutes late. I'll be with you as soon as I can.", c.message);
  await page.evaluate(() => { const t = document.getElementById("text-customer-message"); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "Custom words"); t.dispatchEvent(new Event("input", { bubbles: true })); });
  c = await card(page, "Text Acme Ltd");
  check("an edited message is what gets sent", c.sms?.endsWith("body=Custom%20words") && c.wa?.endsWith("text=Custom%20words"), c.sms);
  await shot(page, "qux-texts-invoice");

  await page.goto(`${BASE}/quotes/${Q1}`, { waitUntil: "networkidle0" });
  // Quote texts now live in the Send card's Text / WhatsApp tabs.
  await waitText(page, "Send");
  await page.evaluate(() => [...document.querySelectorAll('#send-quote [role="tab"]')].find((t) => t.textContent === "Text").click());
  await page.evaluate(() => [...document.querySelectorAll("#send-quote button")].find((b) => b.textContent.trim() === "On my way").click());
  await sleep(200);
  const quoteCard = () => page.evaluate(() => { const s = document.getElementById("send-quote"); return { text: s.innerText, message: document.getElementById("text-customer-message")?.value, sms: s.querySelector('a[href^="sms:"]')?.getAttribute("href"), wa: s.querySelector('a[href^="https://wa.me"]')?.getAttribute("href") }; });
  c = await quoteCard();
  check("quote: on my way, person greeted by first name", c.message === "Hi Bob, it's Harness Plumbing. I'm on my way and should be with you in about 20 minutes.", c.message);
  check("no phone saved: asks for Bob's mobile, no send buttons yet", /Bob's mobile/.test(c.text) && !c.sms, c.text);
  await page.type("#text-customer-phone", "+44 7911 123456");
  c = await quoteCard();
  const smsOk = c.sms?.startsWith("sms:+447911123456?&body=");
  await page.evaluate(() => [...document.querySelectorAll('#send-quote [role="tab"]')].find((t) => t.textContent === "WhatsApp").click());
  c = await quoteCard();
  check("typed mobile works", smsOk && c.wa?.startsWith("https://wa.me/447911123456"), c.wa);

  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await waitText(page, "Acme Ltd");
  const texts = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Text").length);
  check("clients: Text only for clients with a phone", texts === 1, String(texts));
  await clickText(page, "Text");
  await sleep(300);
  const panel = await page.evaluate(() => document.getElementById("text-customer-message")?.value);
  check("clients: Text opens the messages", panel?.startsWith("Hi Jane, it's Harness Plumbing. I'm on my way"), panel);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("page fits 375px", fits);
} catch (e) { console.log("ERROR", e.message); await shot(page, "qux-texts-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
