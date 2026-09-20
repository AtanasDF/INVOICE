// "Find it cheaper" on a quote line and on a comparison row: prepared
// searches aimed at the line's own words, and a price guide to judge a
// quote against. The guide call is intercepted; the searches are links.
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const db = makeDb();
Object.assign(db.tables, { receipts: [], invoice_payments: [], credit_notes: [], quote_links: [] });
const CLIENT = newId();
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Jane Customer", email: "jane@example.com", kind: "client", archived: false, is_company: false, reminders_enabled: true, address: "", phone: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "" });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true });
let asked = null;
const GUIDE = { kind: "product", what: "Plasterboard 12.5mm 2400x1200", low: 7.5, high: 11, per: "sheet", vat: "ex", notes: "Trade packs of 50+ are cheaper per sheet.", cheaper: [{ what: "Own-brand square-edge board", why: "Same 12.5mm board without the brand" }], search: ["plasterboard 12.5mm trade pack price"] };
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-price-finder", intercept: (req, u) => {
  if (u.pathname === "/api/price-guide") {
    asked = JSON.parse(req.postData() || "{}");
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ guide: GUIDE }) });
    return true;
  }
  return false;
} });
const setField = (sel, v) => page.evaluate((s, x) => { const el = document.querySelector(s); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, x); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v);
const links = () => page.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].map((a) => ({ name: a.textContent.trim(), url: a.getAttribute("href") })));
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Who it's for"), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes("Jane Customer")).click());
  check("no Find it cheaper on an empty line", !(await bodyText(page)).includes("Find it cheaper"));
  await setField('input[placeholder="What the work or item is"]', "Plasterboard 12.5mm 2400x1200");
  await setField('input[aria-label="Unit price"]', "14.50");
  await sleep(300);
  check("Find it cheaper appears once a line has words", (await bodyText(page)).includes("Find it cheaper"));
  await clickText(page, "Find it cheaper");
  await sleep(300);
  const shops = await links();
  check("merchants are offered, aimed at the line's words", shops.some((l) => l.name === "Screwfix" && /plasterboard/i.test(decodeURIComponent(l.url))) && shops.some((l) => l.name === "Compare prices"), JSON.stringify(shops.slice(0, 3)));
  check("all searches open in a new tab safely", await page.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].every((a) => (a.getAttribute("rel") ?? "").includes("noreferrer"))));
  await setField("#price-want", "Gyproc 50 sheets");
  await sleep(200);
  check("what you type is carried into the searches", (await links()).some((l) => /gyproc/i.test(decodeURIComponent(l.url))));
  await clickText(page, "What should this cost?");
  await page.waitForFunction(() => document.body.innerText.includes("Usually"), { timeout: 10000 });
  const t = await bodyText(page);
  check("the guide asks with the line's own details", asked?.description === "Plasterboard 12.5mm 2400x1200" && asked?.priced === 14.5 && asked?.want === "Gyproc 50 sheets" && asked?.kind === "product", JSON.stringify(asked));
  check("range, what moves it, and the cheaper option are shown", t.includes("£7.50 – £11.00 per sheet") && t.includes("Trade packs") && t.includes("Own-brand square-edge board"));
  check("a price above the range is flagged", t.includes("above the usual range"), t.slice(t.indexOf("Usually"), t.indexOf("Usually") + 200));
  check("it says it isn't a live price", t.includes("not a live price"));
  check("work vs product can be switched", await page.evaluate(() => !!document.querySelector('[role="radiogroup"][aria-label="A product or work"]')));
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes("Work being done")).click());
  await sleep(300);
  const trades = await links();
  check("work offers the trade sites instead of merchants", trades.some((l) => l.name === "Checkatrade") && !trades.some((l) => l.name === "Screwfix"), JSON.stringify(trades.map((l) => l.name)));
  await clickText(page, "Close");
  await sleep(200);
  check("closing puts it away", !(await bodyText(page)).includes("Usually"));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
