// "What I charge" on screen: the list learned from invoices and quotes, his
// changes kept on the account (business_profile.price_list, migration-047),
// fixed and per hour on New invoice and New quote, and the page still
// working read-only before 047 has been run.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const J = (x) => JSON.stringify(x);
const flat = (s) => s.replace(/\s+/g, " ");

function seed() {
  const db = makeDb();
  Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
  db.tables.business_profile.push({ user_id: UID, business_name: "Harness Handyman", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
  const C = newId();
  db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
  const inv = (date, items) => ({ id: newId(), user_id: "x", client_id: C, date, number: `INV-${date}`, items, notes: "", due_date: date, payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
  db.tables.invoices.push(inv(day(-60), [{ description: "Skim a ceiling", quantity: 1, unitPrice: 180, vatRate: "standard" }, { description: "Labour per hour", quantity: 4, unitPrice: 45, vatRate: "standard" }]));
  db.tables.invoices.push(inv(day(-20), [{ description: "Skim a ceiling", quantity: 1, unitPrice: 220, vatRate: "standard" }]));
  return db;
}

const button = (page, re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button")].find((x) => r.test(x.textContent)); b?.click(); return !!b; }, re.source);
const inputs = (page) => page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value));
async function typeInto(page, sel, text) {
  await page.$eval(sel, (el) => { el.focus(); el.select(); });
  await page.keyboard.press("Backspace");
  await page.type(sel, text);
}

let db = seed();
let { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-prices-page" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/prices`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Skim a ceiling/.test(document.body.innerText), { timeout: 20000 });
  let text = flat(await bodyText(page));
  check("the list builds itself from his invoices", /What I charge/.test(text) && /Skim a ceiling/.test(text) && /Labour per hour/.test(text), text.slice(0, 400));
  check("it says how the price was worked out: a range, with the last", /Charged 2 times: £180\.00 to £220\.00, last £220\.00/.test(text), text.match(/.{0,40}Charged.{0,60}/)?.[0]);
  check("an hourly line is marked per hour", /Labour per hour.{0,80}Per hour/.test(text), text.match(/Labour.{0,100}/)?.[0]);
  check("the tab sits under Invoices", await page.evaluate(() => !!document.querySelector('nav a[href="/prices"][aria-current="page"]')));
  check("Jobs is named as something else", /Not the same as Jobs/.test(text));
  check("nothing runs off a 390pt screen", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // Change Skim a ceiling to £250.
  await page.evaluate(() => [...document.querySelectorAll("li")].find((li) => /Skim a ceiling/.test(li.textContent))?.querySelector("button")?.click());
  await sleep(300);
  await typeInto(page, 'input[aria-label="Price"]', "250");
  await button(page, /^Save$/);
  await sleep(800);
  let saved = db.tables.business_profile[0].price_list;
  check("his price is kept on the account", J(saved) === J([{ key: "skim a ceiling", price: 250 }]), J(saved));
  text = flat(await bodyText(page));
  check("and the learned figure stays beside his own", /£250\.00/.test(text) && /yours is £250\.00/.test(text) && /last £220\.00/.test(text), text.match(/Skim.{0,120}/)?.[0]);

  // Add an hourly item by hand.
  await button(page, /Add a price/);
  await sleep(300);
  await page.type("#price-name", "Gutter clear");
  await button(page, /^Per hour$/);
  await typeInto(page, 'input[aria-label="Price an hour"]', "35");
  await button(page, /^Add$/);
  await sleep(800);
  saved = db.tables.business_profile[0].price_list;
  const own = saved.find((e) => e.key.startsWith("own:"));
  check("an item added by hand is kept, per hour", own && own.name === "Gutter clear" && own.price === 35 && own.kind === "hourly", J(saved));
  text = flat(await bodyText(page));
  check("and shows as added by you", /Gutter clear.{0,40}Added by you/.test(text), text.match(/Gutter.{0,80}/)?.[0]);

  // Hide Labour.
  await page.evaluate(() => [...document.querySelectorAll("li")].find((li) => /Labour per hour/.test(li.textContent))?.querySelectorAll("button")[1]?.click());
  await sleep(800);
  text = flat(await bodyText(page));
  check("a hidden item leaves the list, and can be shown again", /Show 1 hidden/.test(text) && !/Labour per hour/.test(text), text.slice(0, 600));

  // Kept across a reload, which is what "every device" comes down to here.
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Skim a ceiling/.test(document.body.innerText), { timeout: 20000 });
  text = flat(await bodyText(page));
  check("his changes come back from the account", /yours is £250\.00/.test(text) && /Gutter clear/.test(text) && /Show 1 hidden/.test(text));

  // New invoice.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Gutter clear/.test(document.body.innerText), { timeout: 20000 });
  text = flat(await bodyText(page));
  check("New invoice offers his price, not the learned one", /Skim a ceiling \(£250\.00\)/.test(text), text.match(/.{0,40}Skim a ceiling.{0,30}/)?.[0]);
  check("an hourly item says so on its button", /Gutter clear \(£35\.00 an hour\)/.test(text));
  check("a hidden item is not offered", !/Labour per hour/.test(text));
  await button(page, /Gutter clear/);
  await sleep(300);
  check("a per-hour item asks for the hours first", await page.evaluate(() => !!document.querySelector('input[aria-label="Hours of Gutter clear"]')));
  await typeInto(page, 'input[aria-label="Hours of Gutter clear"]', "3");
  await sleep(200);
  check("and says what it will come to", /Add £105\.00/.test(flat(await bodyText(page))));
  await button(page, /Add £105/);
  await sleep(500);
  let vals = await inputs(page);
  check("the line gets the hours as quantity and the rate as price", vals.includes("Gutter clear") && vals.includes("3") && vals.includes("35"), J(vals.filter(Boolean).slice(0, 10)));
  await button(page, /Skim a ceiling \(/);
  await sleep(500);
  vals = await inputs(page);
  check("a fixed item goes straight on, one of it", vals.includes("Skim a ceiling") && vals.includes("250"), J(vals.filter(Boolean).slice(0, 12)));

  // New quote.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Skim a ceiling \(/.test(document.body.innerText), { timeout: 20000 });
  await button(page, /Skim a ceiling \(/);
  await sleep(500);
  vals = await inputs(page);
  check("New quote fills the first empty line from the list", vals.includes("Skim a ceiling") && vals.includes("250"), J(vals.filter(Boolean).slice(0, 10)));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); }

// Before migration-047: the column is not there, PostgREST says 42703.
db = seed();
({ browser, page } = await launchSignedIn(db, {
  base: BASE, width: 390, profile: "profile-prices-page-2",
  intercept: (req, u) => {
    if (req.method() === "GET" && u.pathname === "/rest/v1/business_profile" && /price_list/.test(u.search)) {
      req.respond({ status: 400, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "42703", message: "column business_profile.price_list does not exist" }) });
      return true;
    }
    return false;
  },
}));
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/prices`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Skim a ceiling/.test(document.body.innerText), { timeout: 20000 });
  const text = flat(await bodyText(page));
  check("without the column the learned prices still show", /Charged 2 times/.test(text));
  check("and it says plainly that changes can't be kept yet", /can't be kept yet/.test(text) && !/42703|column/.test(text), text.slice(0, 500));
  check("with nothing offered that would not save", !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /^(Change|Hide|\+ Add a price)$/.test(b.textContent.trim())))));
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Skim a ceiling \(/.test(document.body.innerText), { timeout: 20000 });
  check("and New invoice still offers the learned prices", /Skim a ceiling \(£220\.00\)/.test(flat(await bodyText(page))));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
