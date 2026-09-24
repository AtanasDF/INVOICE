// Tapping one receipt. There is no page for a single receipt, so the list
// takes ?open=<id> and brings that row to you: scrolled to, ringed, its
// details open. On a list of fifty, landing at the top is indistinguishable
// from a broken link -- which is exactly what this used to be.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

// Fifty rows, so the wanted one is well off the first screen.
const ids = [];
for (let i = 0; i < 50; i++) {
  const id = newId();
  ids.push(id);
  db.tables.receipts.push({ id, user_id: "x", client_id: null, date: day(-i), vendor: `Supplier ${String(i).padStart(2, "0")}`, category: "Supplies", amount: 10 + i, vat_amount: 2, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: `R-${i}`, due_date: null, paid: true, details: { reference: `REF-${i}` }, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
}
const WANTED = ids[40];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-open-receipt" });
try {
  await signIn(page, BASE);

  await page.goto(`${BASE}/receipts?open=${WANTED}`, { waitUntil: "networkidle0" });
  await sleep(2500);

  const row = await page.evaluate((id) => {
    const el = document.getElementById(`receipt-${id}`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { ring: el.className.includes("ring-2"), top: r.top, bottom: r.bottom, vh: window.innerHeight, text: el.innerText };
  }, WANTED);

  check("the row that was asked for is on the page", !!row, "no element with that id");
  // Both halves matter: on a page this long the row is thousands of pixels
  // down, so "in view" without the page having moved would mean the check
  // passes on a list that never scrolled at all.
  const scrolled = await page.evaluate(() => window.scrollY);
  check("it has been scrolled into view", row && row.bottom > 0 && row.top < row.vh && scrolled > 500, JSON.stringify({ scrolled, ...(row && { top: row.top, bottom: row.bottom, vh: row.vh }) }));
  check("it is ringed, so you can see which one", row && row.ring, row ? row.text.slice(0, 80) : "");
  check("its details are open without a second tap", row && /REF-40/.test(row.text), row ? row.text.slice(0, 200) : "");

  // The address is tidied, or a reload -- or a share of the address -- carries
  // a highlight nobody asked for.
  check("the address goes back to /receipts", !page.url().includes("open="), page.url());

  const other = await page.evaluate((id) => {
    const el = document.getElementById(`receipt-${id}`);
    return el ? el.className.includes("ring-2") : "missing";
  }, ids[0]);
  check("nothing else is ringed", other === false, String(other));

  const body = await bodyText(page);
  check("no 'isn't here' note when the receipt is here", !/isn.t here any more/i.test(body), body.slice(0, 200));

  // The ring is a pointer, not a permanent mark on the record.
  await sleep(3200);
  const stillRinged = await page.evaluate((id) => document.getElementById(`receipt-${id}`)?.className.includes("ring-2"), WANTED);
  check("the ring fades once it has done its job", stillRinged === false, String(stillRinged));

  // A link older than the record, or a row merged into another one.
  await page.goto(`${BASE}/receipts?open=${newId()}`, { waitUntil: "networkidle0" });
  await sleep(2000);
  const gone = await bodyText(page);
  check("an id that isn't there says so, in plain words", /isn.t here any more/i.test(gone), gone.slice(0, 300));
  check("and the rest of the list is still shown", /Supplier 00/.test(gone), gone.slice(0, 300));
  check("nothing is ringed in that case", (await page.evaluate(() => [...document.querySelectorAll('[id^="receipt-"]')].every((el) => !el.className.includes("ring-2")))), "something was ringed");

  // Plain arrival: no ring, no note, nothing scrolled.
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const plain = await bodyText(page);
  check("arriving without ?open rings nothing and says nothing", !/isn.t here any more/i.test(plain) && (await page.evaluate(() => [...document.querySelectorAll('[id^="receipt-"]')].every((el) => !el.className.includes("ring-2")))), plain.slice(0, 200));
  check("and it is still at the top of the list", await page.evaluate(() => window.scrollY < 40), String(await page.evaluate(() => window.scrollY)));

  // The two places that link to one receipt must carry the id, or none of
  // the above is ever reached by a person.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="/receipts"]')].map((a) => a.getAttribute("href")));
  check("the dashboard links a receipt to its own row", links.some((h) => h.includes("/receipts?open=")), JSON.stringify(links.slice(0, 8)));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
