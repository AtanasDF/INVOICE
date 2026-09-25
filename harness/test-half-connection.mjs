// Not offline. Half-connected, which is worse.
//
// Offline is honest: nothing goes, and the app says so. A van on a bad
// signal gives you the other thing -- the request arrives, the database
// does the work, and the reply never comes back. The app sees a failure.
// The person sees a failure. The record was written.
//
// Two kinds of failure that look identical from the front, and must not be
// treated identically:
//
//   swallowed -- the write landed, the reply was lost. What the screen ends
//                up showing must be the truth: the payment IS there.
//   blackhole -- the write never arrived. The screen must NOT end up looking
//                as though it did, and the person must be told.
//
// test-quiet-failures covers a save that fails outright. This covers a save
// that succeeded and was never told so.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, handle } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Ltd", email: "a@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
const invoice = (price) => {
  const id = newId();
  db.tables.invoices.push({ id, user_id: "x", client_id: C, date: day(-10), number: `INV-0000${db.tables.invoices.length + 1}`, items: [{ description: "Work", quantity: 1, unitPrice: price, vatRate: "standard" }], notes: "", due_date: day(20), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
  return id;
};
const LOST_REPLY = invoice(1000);
const NEVER_ARRIVED = invoice(500);
const paidOn = (id) => db.tables.invoice_payments.filter((p) => p.invoice_id === id);

let swallow = null, swallowed = 0, blackhole = null;
const intercept = (req, u) => {
  if (!u.pathname.startsWith("/rest/v1/")) return false;
  const path = u.pathname.replace("/rest/v1/", "").split("?")[0];
  // Not the preflight. A cross-origin POST sends OPTIONS first, and
  // swallowing THAT consumed the trap while the real write sailed through
  // normally -- so both scenarios were passing for the wrong reason, and
  // the one that "worked" had never lost a reply at all.
  if (req.method() === "GET" || req.method() === "OPTIONS") return false;
  if (blackhole === path) { blackhole = null; req.abort("connectionfailed"); return true; }
  if (swallow === path) {
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
    handle(db, req.method(), u.pathname, u.search, req.headers(), body); // the database really does it
    swallowed++;
    swallow = null;
    req.abort("connectionfailed"); // and the van goes under a bridge
    return true;
  }
  return false;
};

const markPaid = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^Mark as paid$/i.test(x.textContent.trim()));
  if (!b) return "gone";
  b.click();
  return "pressed";
});

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-half-connection", intercept });
try {
  await signIn(page, BASE);

  // ---- The write landed; the reply did not ----------------------------------
  await page.goto(`${BASE}/invoices/${LOST_REPLY}`, { waitUntil: "networkidle0" });
  await sleep(1500);
  swallow = "invoice_payments";
  check("the invoice offered to be marked paid", (await markPaid(page)) === "pressed");
  await sleep(1800);
  check("the write really did reach the database", swallowed === 1 && paidOn(LOST_REPLY).length === 1, JSON.stringify({ swallowed, n: paidOn(LOST_REPLY).length }));

  const said = await bodyText(page);
  check("nothing of the browser's own wording is shown", !/Failed to fetch|NetworkError|ERR_/i.test(said), said.slice(0, 200));
  // What it SHOWS should be the truth, and the truth is that the payment is
  // there. It gets there by going and looking rather than by trusting what
  // it was told -- the right way round, because the reply was lost and the
  // money was not.
  // Not "the screen shows the truth": the app was told the write failed and
  // has no way to know better, so showing the invoice as unpaid is honest.
  // What matters is that it says so, and that the truth appears next time
  // the page is loaded -- which the reload below proves.
  check("and it says the connection is the problem", /connection|reach your records|try again/i.test(said), said.slice(0, 400));
  check("without claiming it saved", !/\bSaved\b/.test(said.split("\n").slice(0, 5).join(" ")), said.slice(0, 200));

  // Pressing it again is what anybody would do.
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1600);
  const reloaded = await bodyText(page);
  check("and on the next load the payment is there after all", /Amount due: £0\.00/.test(reloaded) && /Payment received/.test(reloaded), reloaded.slice(-300));
  const again = await markPaid(page);
  await sleep(1500);
  const lostReplyTotal = paidOn(LOST_REPLY).reduce((s, p) => s + Number(p.amount), 0);
  check("pressing again never takes more than the invoice is worth", lostReplyTotal <= 1200.001, JSON.stringify({ again, n: paidOn(LOST_REPLY).length, lostReplyTotal }));

  // ---- The write never arrived ----------------------------------------------
  await page.goto(`${BASE}/invoices/${NEVER_ARRIVED}`, { waitUntil: "networkidle0" });
  await sleep(1500);
  blackhole = "invoice_payments";
  check("this invoice offered it too", (await markPaid(page)) === "pressed");
  await sleep(1800);
  check("a write that never arrived leaves no payment", paidOn(NEVER_ARRIVED).length === 0, JSON.stringify(paidOn(NEVER_ARRIVED).length));
  const lost = await bodyText(page);
  check("the person is told, in plain words", /connection|reach your records|try again/i.test(lost), lost.slice(0, 400));
  check("and the invoice is not shown as paid", !/Amount due: £0\.00/.test(lost), lost.slice(-300));

  // ---- A receipt, saved through an RPC ---------------------------------------
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1400);
  blackhole = "receipts";
  await page.evaluate(() => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const v = [...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-label") === "Supplier");
    if (v) set(v, "Jewson");
    const t = document.getElementById("receipt-total");
    if (t) set(t, "144.00");
  });
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Save receipt/.test(b.textContent))?.click());
  await sleep(2000);
  const receiptSaid = await bodyText(page);
  check("a receipt that never arrived is not saved", db.tables.receipts.length === 0, String(db.tables.receipts.length));
  check("and the person is told rather than left guessing", /connection|reach your records|try again/i.test(receiptSaid), receiptSaid.slice(0, 400));
  // The worst outcome of all: the form clears, so the only copy of what they
  // typed is gone AND they believe it failed.
  const stillTyped = await page.evaluate(() => document.getElementById("receipt-total")?.value ?? "");
  check("and what they typed is still on the screen", stillTyped === "144.00", JSON.stringify(stillTyped));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
