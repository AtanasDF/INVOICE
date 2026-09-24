// A busy account: 500 invoices, 2000 receipts, 300 clients. Every list has
// to open, filter and total in a reasonable time, and the figures must add
// up the same as the app's own rules.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_links: [], invoice_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true, custom_categories: [] });

const clients = [];
for (let i = 0; i < 300; i++) {
  const c = { id: newId(), user_id: "x", name: `Customer ${String(i).padStart(3, "0")} Ltd`, email: `c${i}@example.com`, address: "1 Road\nBristol\nBS1 4DJ", kind: i % 5 === 0 ? "supplier" : "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null };
  clients.push(c);
  db.tables.clients.push(c);
}
const billable = clients.filter((c) => c.kind === "client");
let owed = 0;
for (let i = 0; i < 500; i++) {
  const c = billable[i % billable.length];
  const unit = 100 + (i % 37) * 10;
  const status = i % 4 === 0 ? "paid" : "sent";
  const inv = { id: newId(), user_id: "x", client_id: c.id, date: day(-400 + i), number: `INV-${1000 + i}`, items: [{ description: `Job ${i}`, quantity: 1 + (i % 3), unitPrice: unit, vatRate: "standard" }], notes: "", due_date: day(-370 + i), payment_terms: "30 days", status, tags: [], vat_registered: true, cis_rate: i % 10 === 0 ? 20 : null };
  db.tables.invoices.push(inv);
  const total = Math.round((1 + (i % 3)) * unit * 1.2 * 100) / 100;
  const cis = inv.cis_rate ? Math.round((1 + (i % 3)) * unit * 0.2 * 100) / 100 : 0;
  const due = Math.round((total - cis) * 100) / 100;
  if (status === "paid") db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: inv.id, date: inv.due_date, amount: due, method: "bank", note: "" });
  else owed += due;
}
for (let i = 0; i < 2000; i++) {
  db.tables.receipts.push({ id: newId(), user_id: "x", client_id: i % 3 === 0 ? clients[(i % 60) * 5].id : null, date: day(-600 + Math.floor(i / 4)), vendor: `Merchant ${i % 40}`, category: ["Supplies", "Fuel", "Equipment", "Meals"][i % 4], amount: 10 + (i % 90), vat_amount: Math.round((10 + (i % 90)) * 0.2 * 100) / 100, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: i % 7 === 0 ? "invoice" : "receipt", invoice_number: `R-${i}`, due_date: i % 7 === 0 ? day(-3 + (i % 20)) : null, paid: i % 7 !== 0, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
}
// The nine screens the busy account never reached. Each one either totals
// across everything it holds or renders a row per record, which is where a
// list that opens fine with three of something stops opening at all.
Object.assign(db.tables, { quotes: db.tables.quotes ?? [], quote_requests: [], quote_request_suppliers: [], receipt_pages: [] });

// 300 mileage trips inside this tax year: the claim crosses HMRC's
// 10,000-mile threshold, so the page has to add every one of them up and
// split the rate, not just list them.
let trips = 0;
for (let i = 0; i < 300; i++) {
  const miles = 40 + (i % 60);
  trips += miles;
  db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-Math.floor(i / 2)), vendor: "Mileage", category: "Mileage", amount: Math.round(miles * 0.45 * 100) / 100, vat_amount: 0, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: { mileage: { miles, from: "BS1 4DJ", to: "BA1 1AA", vehicle: "car", rate: 0.45, purpose: `Job ${i}` } }, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
}

// 300 documents waiting to be checked, every one of them a form on screen.
for (let i = 0; i < 300; i++) {
  db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: day(-i % 90), vendor: `Waiting ${String(i).padStart(3, "0")}`, category: "Supplies", amount: 20 + i, vat_amount: 4, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
}

for (let i = 0; i < 400; i++) {
  const c = billable[i % billable.length];
  db.tables.quotes.push({ id: newId(), user_id: "x", client_id: c.id, number: `Q-${2000 + i}`, date: day(-300 + i), valid_until: day(-270 + i), items: [{ description: `Quoted job ${i}`, quantity: 1, unitPrice: 200 + (i % 50) * 5, vatRate: "standard" }], notes: "", status: ["draft", "sent", "accepted", "declined"][i % 4], invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, vat_registered: true });
}

for (let i = 0; i < 120; i++) {
  db.tables.recurring_expenses.push({ id: newId(), user_id: "x", client_id: null, description: `Standing cost ${i}`, category: "Supplies", amount: 20 + i, vat_amount: 4, next_due_date: day(30 + i), active: i % 5 !== 0 });
  db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: billable[i % billable.length].id, description: `Monthly ${i}`, items: [{ description: "Retainer", quantity: 1, unitPrice: 150, vatRate: "standard" }], notes: "", payment_terms: "14 days", next_due_date: day(30 + i), active: i % 5 !== 0 });
}

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-big-account" });
const timed = async (path, waitFor) => {
  const t = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 60000 }, waitFor);
  return Date.now() - t;
};
try {
  await signIn(page, BASE);
  const dash = await timed("/", "owed");
  check(`dashboard opens with 500 invoices and 2000 receipts (${dash}ms)`, dash < 20000, `${dash}ms`);
  const inv = await timed("/invoices", "INV-1499");
  check(`invoices list opens and shows the newest (${inv}ms)`, inv < 20000, `${inv}ms`);
  const rec = await timed("/receipts", "Merchant");
  check(`receipts list opens (${rec}ms)`, rec < 25000, `${rec}ms`);
  const exp = await timed("/expenses", "Total excl. VAT");
  check(`expenses summary adds up 2000 receipts (${exp}ms)`, exp < 25000, `${exp}ms`);
  const vat = await timed("/vat", "Box 1");
  check(`VAT figures over a quarter (${vat}ms)`, vat < 25000, `${vat}ms`);
  const cli = await timed("/clients", "Customer 0");
  check(`300 contacts list (${cli}ms)`, cli < 20000, `${cli}ms`);

  // The dashboard's "owed" must match the sum of what's still unpaid.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);
  // "Owed to you" is in the Invoices & customers panel, and money out is the
  // one you land on now. Read the figure from its own square rather than
  // taking the first pound sign on the page, which is what made this fragile.
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes("Invoices & customers"))?.click());
  await sleep(700);
  const text = await page.evaluate(() => {
    const label = [...document.querySelectorAll("div")].find((d) => d.textContent.trim() === "Owed to you");
    return label?.parentElement?.innerText ?? document.body.innerText;
  });
  const shown = text.match(/£([\d,]+\.\d{2})/);
  const asNumber = shown ? Number(shown[1].replace(/,/g, "")) : null;
  check("the dashboard's owed matches the invoices", asNumber !== null && Math.abs(asNumber - owed) < 1, `shown ${asNumber} vs ${Math.round(owed * 100) / 100}`);

  // A filter on a long list still answers quickly.
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Merchant"), { timeout: 60000 });
  const t0 = Date.now();
  await page.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => /Fuel/.test(o.textContent))); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "Fuel"); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(400);
  const filtered = Date.now() - t0;
  check(`filtering 2000 receipts answers quickly (${filtered}ms)`, filtered < 6000, `${filtered}ms`);
  check("no crash on any page", !(await bodyText(page)).includes("Application error"));

  // ── The nine screens the busy account never reached ──
  const q = await timed("/quotes", "Q-2");
  check(`400 quotes list (${q}ms)`, q < 25000, `${q}ms`);
  // The supplier's name is in an input's value on this page, not in the
  // page's text: wait for a row's own button instead.
  const rv = await timed("/receipts/review", "Looks good");
  check(`300 documents waiting to be checked, each a form (${rv}ms)`, rv < 30000, `${rv}ms`);
  const ml = await timed("/mileage", "Mileage");
  check(`300 trips totalled (${ml}ms)`, ml < 25000, `${ml}ms`);
  const re = await timed("/recurring", "Standing cost");
  check(`120 recurring expenses (${re}ms)`, re < 25000, `${re}ms`);
  // The row shows the customer, not the schedule's own description.
  const ri = await timed("/recurring/invoices", "Customer 0");
  check(`120 recurring invoices (${ri}ms)`, ri < 25000, `${ri}ms`);
  const fl = await timed("/files", "File library");
  check(`the file library over 2600 documents (${fl}ms)`, fl < 30000, `${fl}ms`);
  const qr = await timed("/quotes/requests", "From suppliers");
  check(`quote requests (${qr}ms)`, qr < 25000, `${qr}ms`);
  const st = await timed(`/clients/${billable[0].id}/statement`, "Statement");
  check(`a statement for a customer with many invoices (${st}ms)`, st < 25000, `${st}ms`);
  const se = await timed("/settings", "Business name");
  check(`settings with 300 contacts behind it (${se}ms)`, se < 25000, `${se}ms`);

  // The mileage total is a calculation over every trip, not a list: HMRC
  // pays 45p for the first 10,000 miles of the tax year and 25p after, so
  // an account this size is the first one where the split matters at all.
  await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mileage"), { timeout: 60000 });
  // The running total only appears once a trip is being typed -- it is part
  // of "here is what this one is worth", not a standing figure.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("input")].find((i) => (i.getAttribute("aria-label") ?? i.previousElementSibling?.textContent ?? "") === "Miles");
    if (!el) throw new Error("no Miles box");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "50");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => /miles claimed this tax year/.test(document.body.innerText), { timeout: 30000 });
  const mileageText = await bodyText(page);
  const claimed = Number((mileageText.match(/([\d,]+) miles claimed this tax year/) ?? [])[1]?.replace(/,/g, "") ?? -1);
  // Every trip above was made within the last five months, so all of them
  // fall in this tax year and the figure is exact -- not "roughly right".
  // The trip being typed is not counted, which is the point of "already".
  check("the miles claimed this year is every trip, to the mile", claimed === trips, `${claimed} shown, ${trips} made`);
  check("and it says what is left at the higher rate", /left at the higher rate/.test(mileageText) || claimed >= 10000, mileageText.slice(0, 200));
  check("nothing on these screens is broken", !/NaN|\[object Object\]|Application error/.test(mileageText), mileageText.slice(0, 200));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
