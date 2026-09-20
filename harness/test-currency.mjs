// A receipt in another currency. The rate comes from the European Central
// Bank, but he might be somewhere with no signal, or the service might be
// down -- and a receipt saved at a rate of nothing would silently record
// £0.00 of costs.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const flat = (t) => t.replace(/\s+/g, " ");

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

let rateMode = "ok"; // ok | down | slow
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-currency",
  intercept: (req, u) => {
    if (!u.host.includes("frankfurter")) return false;
    if (rateMode === "down") { req.respond({ status: 500, headers: { "content-type": "application/json" }, body: "{}" }); return true; }
    if (rateMode === "gone") { req.abort(); return true; }
    req.respond({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ rate: 0.79 }) });
    return true;
  },
});

const setField = (match, value) =>
  page.evaluate((m, v) => {
    const el = [...document.querySelectorAll("input")].find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""}`));
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);

const pickCurrency = (code) =>
  page.evaluate((c) => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === c || o.textContent.trim() === c));
    if (!sel) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, c);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, code);

async function newReceipt() {
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1100);
  await setField("supplier|vendor|who", "US Tool Supply");
  await setField("total|amount", "100");
}

try {
  await signIn(page, BASE);

  // 1. The rate is there: £79 recorded, and both figures kept.
  rateMode = "ok";
  await newReceipt();
  check("the currency can be changed", await pickCurrency("USD"));
  await sleep(1800);
  // The rate lands in an input, and an input's value isn't in the page text.
  const shownRate = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).find((v) => /^0\.\d+$/.test(v)) ?? "");
  check("the rate that was fetched is filled in", shownRate.startsWith("0.79"), shownRate || (await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => `${i.placeholder}=${i.value}`).join(" | "))));
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1800);
  const saved = db.tables.receipts[0];
  check("a receipt in dollars is saved", !!saved, String(db.tables.receipts.length));
  check("it is stored in pounds", saved && Math.abs((saved.amount + saved.vat_amount) - 79) < 0.02, JSON.stringify({ amount: saved?.amount, vat: saved?.vat_amount }));
  check("what was actually on the receipt is kept too", saved && Math.abs(saved.original_amount + (saved.original_vat_amount ?? 0) - 100) < 0.02 && saved.original_currency === "USD", JSON.stringify({ orig: saved?.original_amount, cur: saved?.original_currency, rate: saved?.fx_rate }));
  check("the rate it was converted at is kept", saved && Math.abs(saved.fx_rate - 0.79) < 0.0001, String(saved?.fx_rate));

  // 2. The rate service is down: say so, and let him type it.
  rateMode = "down";
  let t;
  await newReceipt();
  await pickCurrency("EUR");
  await sleep(2200);
  t = await bodyText(page);
  const around = flat(t).slice(flat(t).indexOf("1 EUR"), flat(t).indexOf("1 EUR") + 220);
  check("a rate that can't be fetched is said out loud", /manual|enter it|couldn't|could not|no exchange|unavailable/i.test(t), around);
  const typed = await setField("rate", "0.85");
  check("a rate can be typed in by hand", typed);
  await sleep(500);
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1800);
  const second = db.tables.receipts[1];
  check("the hand-typed rate is the one used", second && Math.abs((second.amount + second.vat_amount) - 85) < 0.02, JSON.stringify({ total: second ? second.amount + second.vat_amount : null, rate: second?.fx_rate }));

  // 3. No rate at all: it must not save £0.00 of costs.
  rateMode = "gone";
  await newReceipt();
  await pickCurrency("CHF");
  await sleep(2200);
  const before = db.tables.receipts.length;
  await clickText(page, "Save receipt").catch(async () => { await clickText(page, "Save").catch(() => {}); });
  await sleep(1800);
  const after = db.tables.receipts.length;
  const zero = db.tables.receipts.slice(before).some((r) => r.amount + r.vat_amount === 0);
  check("nothing is ever saved as £0.00 for want of a rate", !zero, JSON.stringify(db.tables.receipts.slice(before).map((r) => r.amount + r.vat_amount)));
  check("either it refuses to save, or it saves a real figure", after === before || !zero, `${before} -> ${after}`);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
