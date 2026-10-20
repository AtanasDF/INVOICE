// The half-typed receipt and invoice survive the page going away.
//
// On an iPhone the leave guard does nothing (Safari ignores beforeunload), so
// a link tapped with no signal threw the form away. Here the page is simply
// loaded again, which is what that tap becomes, and the work must be offered
// back. test-form-draft holds the rules; this proves the forms obey them.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3100";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const CLIENT = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, custom_categories: [] });
db.tables.clients.push({ id: CLIENT, user_id: UID, name: "Big Co Ltd", email: "", kind: "client", archived: false, is_company: true, reminders_enabled: true });
db.tables.receipts = []; db.tables.invoices = []; db.tables.recurring_expenses = []; db.tables.recurring_invoices = []; db.tables.credit_notes = []; db.tables.invoice_payments = [];
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-draft-autosave" });
let answer = true;
// The leave guard's "Leave this page?" fires on every reload here, as it does
// on a computer; it is left, since an iPhone never asks at all.
page.on("dialog", async (d) => {
  const go = d.type() === "beforeunload" || answer;
  await (go ? d.accept() : d.dismiss()).catch(() => {});
});
const typeInto = async (sel, text) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, text); };
const stored = (k) => page.evaluate((k) => localStorage.getItem(k), k);
const press = (label) => page.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === l)?.click(), label);
const offered = async () => (await bodyText(page)).includes("It was kept on this device");
const VENDOR = 'input[placeholder="Shop or supplier"]';
const TOTAL = 'input[placeholder^="Total paid"]';
const NOTES = 'textarea[placeholder="Notes (optional)"]';
const LINE = 'input[placeholder^="Description (e.g. Monthly work"]';
try {
  await signIn(page, BASE);

  // --- receipt: typed, then the page goes ---
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  check("receipt: nothing offered on a fresh device", !(await offered()));
  await typeInto(VENDOR, "Screwfix");
  await typeInto(TOTAL, "42.50");
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const input = await page.$("input[type=file]");
  await input.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "r.png", { type: "image/png" }));
    el.files = dt.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, png);
  await sleep(800);
  const kept = await stored("new-receipt-draft");
  check("receipt: kept as it is typed", kept?.includes("Screwfix") && kept?.includes("42.50"), kept);
  check("receipt: the photograph is not kept", kept && !kept.includes("data:image") && JSON.parse(kept).fields.hadPhoto === true, kept?.slice(0, 200));

  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  check("receipt: offered back after the page went", await offered());
  check("receipt: ...saying the photo needs adding again", (await bodyText(page)).includes("photo wasn't kept"));
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  check("receipt: opening the form without answering does not lose it", await offered() && !!(await stored("new-receipt-draft")));
  await press("Carry on with it");
  await sleep(300);
  const back = await page.evaluate((v, t) => [document.querySelector(v).value, document.querySelector(t).value], VENDOR, TOTAL);
  check("receipt: Carry on puts it back", back[0] === "Screwfix" && back[1] === "42.50", JSON.stringify(back));
  check("receipt: ...and the offer goes", !(await offered()));
  await press("Save receipt");
  await sleep(1200);
  check("receipt: saved", db.tables.receipts.length === 1, String(db.tables.receipts.length));
  check("receipt: saving clears the draft", (await stored("new-receipt-draft")) === null);
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  check("receipt: a saved receipt is not offered again", !(await offered()));

  // --- invoice ---
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  await typeInto(LINE, "Plastering the hall");
  await typeInto(NOTES, "Thanks");
  await sleep(300);
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  check("invoice: offered back after the page went", await offered());
  await shot(page, "draft-autosave-offer");
  answer = false;
  await press("Throw it away");
  await sleep(200);
  check("invoice: Throw it away asks first, and No keeps it", await offered() && !!(await stored("new-invoice-draft")));
  await press("Carry on with it");
  await sleep(300);
  const line = await page.evaluate((l, n) => [document.querySelector(l).value, document.querySelector(n).value], LINE, NOTES);
  check("invoice: Carry on puts the lines and notes back", line[0] === "Plastering the hall" && line[1] === "Thanks", JSON.stringify(line));
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  answer = true;
  await press("Throw it away");
  await sleep(300);
  check("invoice: thrown away when confirmed", !(await offered()) && (await stored("new-invoice-draft")) === null);

  // --- typing over the offer keeps the newest ---
  await typeInto(LINE, "Old job");
  await sleep(200);
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  await typeInto(LINE, "New job");
  await sleep(300);
  const newest = await stored("new-invoice-draft");
  check("invoice: typing over the offer keeps the new work", newest?.includes("New job") && !newest.includes("Old job") && !(await offered()), newest);

  // --- somebody else signs in on this device ---
  await page.evaluate(() => localStorage.setItem("last-account", "99999999-9999-4999-8999-999999999999"));
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(400);
  check("a different account never sees the draft", (await stored("new-invoice-draft")) === null && !(await offered()));

  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("fits 375px", fits);
} catch (e) { console.log("ERROR", e.message); await shot(page, "draft-autosave-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
