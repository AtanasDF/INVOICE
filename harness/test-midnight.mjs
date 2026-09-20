// The hour after midnight, British Summer Time.
//
// Every "today" in the app was `new Date().toISOString().slice(0, 10)` --
// the date in UTC. Britain is UTC+1 from late March to late October, so
// between 00:00 and 01:00 on a summer night the app believed it was still
// yesterday. Two places (the scan page, the Free-invoice draft) read the
// local clock instead and believed it was today, so the app disagreed with
// itself about what day it was.
//
// This is an app for someone who does the paperwork after the job. In that
// hour: a receipt typed in was dated YESTERDAY in his accounting record,
// an invoice due that day wasn't flagged overdue, and an invoice issued
// through the scan page vanished from the tax card entirely -- its own date
// was "tomorrow" by the card's reckoning, so the year's income read zero.
//
// The clock here is pinned to 23:30 UTC on 20 September 2026, which is
// 00:30 on the 21st in London. Every check below fails against the old code.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const FIXED_MS = Date.UTC(2026, 8, 20, 23, 30, 0);
const UK_DAY = "2026-09-21";
const UTC_DAY = "2026-09-20";

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 2, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: UID, name: "Big Contractor Ltd", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
// An invoice issued today, UK time -- the date the app itself would write.
db.tables.invoices.push({ id: newId(), user_id: UID, client_id: C, date: UK_DAY, number: "INV-1", items: [{ description: "Labour", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: UK_DAY, payment_terms: "", status: "sent", tags: [], vat_registered: false, cis_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-midnight" });

// 00:30 in London, still yesterday in UTC.
await page.evaluateOnNewDocument((ms) => {
  const Real = Date;
  function Fake(...args) {
    return args.length ? new Real(...args) : new Real(ms);
  }
  Fake.now = () => ms;
  Fake.parse = Real.parse;
  Fake.UTC = Real.UTC;
  Fake.prototype = Real.prototype;
  Object.setPrototypeOf(Fake, Real);
  window.Date = Fake;
}, FIXED_MS);

try {
  await signIn(page, BASE);
  await page.emulateTimezone("Europe/London");

  const clock = await page.evaluate(() => ({
    utc: new Date().toISOString().slice(0, 10),
    local: new Date().toString(),
  }));
  check("the clock really is pinned to the small hours", clock.utc === "2026-09-20" && /Sep 21 2026/.test(clock.local), JSON.stringify(clock));

  // A receipt typed in at half past midnight belongs to today, the 21st.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const receiptDate = await page.evaluate(() => document.querySelector('input[type="date"]')?.value ?? null);
  check("a receipt entered after midnight is dated today, not yesterday", receiptDate === UK_DAY, `${receiptDate} (should be ${UK_DAY}, was ${UTC_DAY})`);

  // The tax card must see an invoice issued the same night.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(2200);
  const dash = await bodyText(page);
  const card = dash.slice(dash.indexOf("Tax so far"));
  check("an invoice issued tonight is in this year's figures", !/Nothing invoiced or spent since 6 April yet/.test(card), card.replace(/\s+/g, " ").slice(0, 220));
  check("...and it counts the full £1,000", /£1,000\.00/.test(card), card.replace(/\s+/g, " ").slice(0, 300));

  // Due today is not yet overdue -- but it is not "due yesterday" either.
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const list = await bodyText(page);
  check("an invoice due today is not called overdue", !/Overdue/i.test(list), list.replace(/\s+/g, " ").slice(0, 260));

  // And a payment recorded now is dated today.
  await page.goto(`${BASE}/invoices/${db.tables.invoices[0].id}`, { waitUntil: "networkidle0" });
  await sleep(1800);
  await clickText(page, "+ Record a payment");
  await sleep(900);
  const payDate = await page.evaluate(() => [...document.querySelectorAll('input[type="date"]')].map((i) => i.value));
  check("a payment recorded tonight is dated today", payDate.length > 0 && payDate.every((v) => v === UK_DAY), JSON.stringify(payDate));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
