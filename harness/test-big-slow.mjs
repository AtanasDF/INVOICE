// Two thousand receipts, on a slow phone.
//
// His records grow by a few receipts a day for years, and the phone they
// are read on is whatever is in his pocket on a building site. Every list
// here loads EVERYTHING and filters in the browser, which is fine at fifty
// rows and needs proving at two thousand -- with the CPU throttled the way
// a mid-range Android or an old iPhone behaves, not a MacBook.
//
// What is measured: the time from asking for the page to the figures being
// on screen, and whether the page still answers a tap once it is there.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 900, custom_categories: null });
const VENDORS = ["Travis Perkins", "Screwfix", "Jewson", "Toolstation", "B&Q", "Wickes", "Selco", "Howdens", "Currys", "Shell"];
const CATS = ["Materials", "Supplies", "Fuel", "Equipment", "Meals", "Transport & Taxis"];
const suppliers = VENDORS.map((name) => { const id = newId(); db.tables.clients.push({ id, user_id: UID, name, email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: false, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null }); return id; });
const C = newId();
db.tables.clients.push({ id: C, user_id: UID, name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

// 2,000 receipts over three years, a fifth of them supplier bills.
for (let i = 0; i < 2000; i++) {
  const amount = Math.round((5 + (i * 37) % 900 + ((i * 13) % 100) / 100) * 100) / 100;
  const bill = i % 5 === 0;
  db.tables.receipts.push({
    id: newId(), user_id: UID, client_id: suppliers[i % suppliers.length], date: day(-Math.floor(i * 0.55)), vendor: VENDORS[i % VENDORS.length], category: CATS[i % CATS.length],
    amount, vat_amount: Math.round(amount * 20) / 100, image_data_url: null, notes: i % 7 === 0 ? "Site A, snagging" : "", starred: i % 50 === 0, needs_review: false,
    warranty_months: null, tags: i % 9 === 0 ? ["Site A"] : [], line_items: [], document_type: bill ? "invoice" : "receipt", invoice_number: bill ? `TP-${100000 + i}` : null,
    due_date: bill ? day(-Math.floor(i * 0.55) + 30) : null, paid: !bill || i % 3 !== 0, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null,
  });
}
// And 400 invoices, so the dashboard and lists have plenty of both.
for (let i = 0; i < 400; i++) {
  const inv = { id: newId(), user_id: UID, client_id: C, date: day(-Math.floor(i * 2.7)), number: `INV-${500 + i}`, items: [{ description: `Job ${i}`, quantity: 1, unitPrice: 300 + (i % 20) * 50, vatRate: "standard" }], notes: "", due_date: day(-Math.floor(i * 2.7) + 14), payment_terms: "14 days", status: i % 4 === 0 ? "sent" : "paid", tags: [], vat_registered: true, cis_rate: null };
  db.tables.invoices.push(inv);
  if (inv.status === "paid") db.tables.invoice_payments.push({ id: newId(), user_id: UID, invoice_id: inv.id, date: inv.due_date, amount: inv.items[0].unitPrice * 1.2, method: "bank", note: "" });
}

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-big-slow" });

// A mid-range phone: roughly a quarter of this Mac's speed.
const cdp = await page.createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const timeTo = async (path, until) => {
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(until, { timeout: 45000 });
  } catch {
    return { ms: Infinity, text: (await bodyText(page)).replace(/\s+/g, " ").slice(0, 200) };
  }
  return { ms: Date.now() - t0 };
};

// Does a tap still land once the page is up? A frozen main thread is the
// failure this exists to catch, and it doesn't show in a load time.
const responsive = async () => {
  const t0 = Date.now();
  await page.evaluate(() => new Promise((r) => { const b = document.createElement("button"); b.textContent = "x"; b.onclick = () => r(); document.body.appendChild(b); b.click(); b.remove(); }));
  return Date.now() - t0;
};

const BUDGET_MS = 12000;
try {
  await signIn(page, BASE);

  const dash = await timeTo("/", () => /Tax so far|Owed to you|Bills to pay/.test(document.body.innerText));
  check(`the dashboard is up within ${BUDGET_MS / 1000}s on a throttled phone with 2,000 receipts`, dash.ms <= BUDGET_MS, `${dash.ms}ms ${dash.text ?? ""}`);
  check("...and still answers a tap", (await responsive()) < 1500);

  const receipts = await timeTo("/receipts", () => (document.body.innerText.match(/£[\d,]+\.\d{2}/g) ?? []).length > 10);
  check(`the receipts list shows figures within ${BUDGET_MS / 1000}s`, receipts.ms <= BUDGET_MS, `${receipts.ms}ms ${receipts.text ?? ""}`);
  check("...and still answers a tap", (await responsive()) < 1500);
  // The lists load everything and filter in the browser by design, so all
  // 2,000 are drawn. What a person feels is whether it still scrolls.
  const rows = await page.evaluate(() => document.querySelectorAll("li, tr, [class*='rounded-xl']").length);
  const t0 = Date.now();
  await page.evaluate(() => new Promise((r) => { window.scrollTo(0, document.body.scrollHeight); requestAnimationFrame(() => requestAnimationFrame(r)); }));
  await page.evaluate(() => new Promise((r) => { window.scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(r)); }));
  const scrolled = Date.now() - t0;
  check(`...and scrolling ${rows} rows to the bottom and back doesn't stall`, scrolled < 2000, `${scrolled}ms for ${rows} rows`);

  const expenses = await timeTo("/expenses", () => /Total excl\. VAT/.test(document.body.innerText) && (document.body.innerText.match(/£[\d,]+\.\d{2}/g) ?? []).length > 2);
  check(`the expenses figures are worked out within ${BUDGET_MS / 1000}s`, expenses.ms <= BUDGET_MS, `${expenses.ms}ms ${expenses.text ?? ""}`);

  const vat = await timeTo("/vat", () => /Box 1/.test(document.body.innerText));
  check(`the VAT return is worked out within ${BUDGET_MS / 1000}s`, vat.ms <= BUDGET_MS, `${vat.ms}ms ${vat.text ?? ""}`);

  const invoices = await timeTo("/invoices", () => (document.body.innerText.match(/INV-\d+/g) ?? []).length > 5);
  check(`the invoices list is up within ${BUDGET_MS / 1000}s with 400 invoices`, invoices.ms <= BUDGET_MS, `${invoices.ms}ms ${invoices.text ?? ""}`);
  check("...and still answers a tap", (await responsive()) < 1500);

  // Narrowing 2,000 receipts by date has to feel immediate.
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const before = await page.evaluate(() => (document.body.innerText.match(/£[\d,]+\.\d{2}/g) ?? []).length);
  const t1 = Date.now();
  await page.evaluate((from) => {
    const el = [...document.querySelectorAll('input[type="date"]')][0];
    if (!el) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, from);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, day(-14));
  await page.waitForFunction((n) => (document.body.innerText.match(/£[\d,]+\.\d{2}/g) ?? []).length < n, { timeout: 10000 }, before).catch(() => {});
  const filtered = Date.now() - t1;
  const after = await page.evaluate(() => (document.body.innerText.match(/£[\d,]+\.\d{2}/g) ?? []).length);
  check("filtering 2,000 receipts to the last fortnight is immediate", filtered < 3000 && after < before, `${filtered}ms, ${before} -> ${after} figures`);
  console.log(JSON.stringify({ dash: dash.ms, receipts: receipts.ms, expenses: expenses.ms, vat: vat.ms, invoices: invoices.ms }));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
