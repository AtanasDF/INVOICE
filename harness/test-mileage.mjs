// Mileage at HMRC's rates, saved as an ordinary expense.
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], invoice_payments: [], credit_notes: [] });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true, custom_categories: [] });
// 9,950 car miles already claimed this tax year, so the next trip crosses
// the 10,000-mile line.
const yearStart = (() => { const n = new Date(); const y = n.getUTCFullYear(); return (n.getUTCMonth() + 1 > 4 || (n.getUTCMonth() + 1 === 4 && n.getUTCDate() >= 6)) ? `${y}-04-10` : `${y - 1}-04-10`; })();
db.tables.receipts.push({ id: newId(), user_id: "x", date: yearStart, vendor: "Mileage", category: "Mileage", amount: 4477.5, vat_amount: 0, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "other", invoice_number: null, due_date: null, paid: true, details: { mileage: { miles: 9950, from: "BS1 4DJ", to: "BA1 2XY", vehicle: "car", rate: 0.45, purpose: "Earlier trips" } }, credit_of_receipt_id: null, client_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-mileage" });
const setField = (sel, v) => page.evaluate((s, x) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, x); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v);
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("Expenses links to Mileage", (await bodyText(page)).includes("Mileage"));
  await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Business miles"), { timeout: 15000 });
  let t = await bodyText(page);
  check("the rates are stated", t.includes("45p a mile for the first 10,000") && t.includes("then 25p"), t.slice(0, 200));
  check("this year's miles are counted", t.includes("9,950 miles") && t.includes("£4,477.50"), t.slice(t.indexOf("This tax year"), t.indexOf("This tax year") + 160));

  // A 100-mile trip crosses the threshold: 50 at 45p, 50 at 25p.
  await setField("#m-miles", "100");
  await sleep(300);
  t = await bodyText(page);
  check("a trip across the line is split at the right point", t.includes("50 at 45p and 50 at 25p") && t.includes("£35.00"), t.slice(t.indexOf("100 miles"), t.indexOf("100 miles") + 200));
  check("it says how much is left at the higher rate", t.includes("50 left at the higher rate"), t.slice(t.indexOf("claimed this tax year"), t.indexOf("claimed this tax year") + 120));

  await setField("#m-from", "BS1 4DJ");
  await setField("#m-to", "BA1 2XY");
  await clickText(page, "Work it out");
  await page.waitForFunction(() => document.body.innerText.includes("miles each way by road"), { timeout: 20000 });
  const measured = await page.evaluate(() => document.querySelector("#m-miles").value);
  check("two postcodes give a road estimate (Bristol to Bath ≈ 12-16 miles)", Number(measured) > 10 && Number(measured) < 20, measured);
  await clickText(page, "There and back");
  await sleep(200);
  const both = await page.evaluate(() => document.querySelector("#m-miles").value);
  check("there and back doubles it", Math.abs(Number(both) - Number(measured) * 2) < 0.2, `${measured} -> ${both}`);

  await setField("#m-miles", "20");
  await setField("#m-purpose", "Site visit");
  await sleep(200);
  await clickText(page, "Save the trip");
  await page.waitForFunction(() => document.body.innerText.includes("Site visit"), { timeout: 15000 });
  const saved = db.tables.receipts.find((r) => r.details?.mileage?.purpose === "Site visit");
  check("saved as an expense with the trip on it", !!saved && saved.category === "Mileage" && saved.vendor === "Mileage" && saved.vat_amount === 0 && saved.paid === true && saved.details.mileage.miles === 20, JSON.stringify(saved && { a: saved.amount, c: saved.category, m: saved.details.mileage }));
  check("claimed at 45p: 9,970 miles is still under 10,000", saved?.amount === 9 && saved?.details.mileage.rate === 0.45, JSON.stringify({ amount: saved?.amount, rate: saved?.details.mileage.rate }));
  check("the list and the year's total include it", (await bodyText(page)).includes("9,970 miles"), (await bodyText(page)).slice(0, 200));
  check("the form is ready for the next trip", (await page.evaluate(() => document.querySelector("#m-miles").value)) === "");
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // A bicycle is flat-rate, so no threshold talk.
  await page.evaluate(() => { const s = document.querySelector("#m-vehicle"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "bicycle"); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await setField("#m-miles", "10");
  await sleep(300);
  t = await bodyText(page);
  check("a bicycle is 20p a mile with no threshold", t.includes("£2.00") && !t.includes("left at the higher rate"), t.slice(t.indexOf("10 miles"), t.indexOf("10 miles") + 150));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
