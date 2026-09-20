import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const FIND = 'input[placeholder="Find address: postcode, or number and street"]';
const db = makeDb();
db.tables.business_profile = [{ user_id: "00000000-0000-4000-8000-000000000001", business_name: "Harness Ltd", address: "Old address", vat_registered: false }];
db.tables.clients = [{ id: "10000000-0000-4000-8000-000000000901", user_id: "00000000-0000-4000-8000-000000000001", name: "Existing Client", kind: "client", address: "1 Old Road\nOldtown\nOL1 1AA", archived: false, is_company: false, created_at: "2026-01-01T00:00:00Z" }];
const posted = [];
const CANNED = { source: "osm", items: [
  { id: "osm:0", label: "12 High Street", detail: "Leeds LS1 2AB", lines: ["12 High Street", "Leeds", "LS1 2AB"] },
  { id: "pc:LS1 2AB", label: "Not listed? Use just the postcode", detail: "x", lines: ["Leeds", "LS1 2AB"], partial: true },
] };
const { browser, page } = await launchSignedIn(db, { base: BASE, intercept: (req, u) => {
  if (u.pathname !== "/api/address-search") return false;
  posted.push({ body: JSON.parse(req.postData() || "{}"), auth: !!req.headers().authorization });
  req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(CANNED) });
  return true;
} });
async function findAndPick(label) {
  const f = await page.$(FIND);
  await f.click({ clickCount: 3 }); await page.keyboard.press("Backspace");
  await f.type("LS1 2AB", { delay: 15 });
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 1, { timeout: 8000 });
  await page.evaluate((l) => [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes(l)).click(), label);
  await sleep(300);
}
const areaValue = () => page.evaluate((s) => document.querySelector(s).closest(".space-y-1\\.5").querySelector("textarea").value, FIND);
try {
  await signIn(page, BASE);
  await page.goto(BASE + "/settings", { waitUntil: "networkidle0" });
  await page.waitForSelector(FIND);
  await findAndPick("12 High Street");
  check("settings: finder fills the business address", (await areaValue()) === "12 High Street\nLeeds\nLS1 2AB", await areaValue());
  check("searches carry the sign-in (Royal Mail lookup when the key is set)", posted.length > 0 && posted.every((p) => p.auth), JSON.stringify(posted));
  check("settings: nothing saved by picking", db.log.filter((l) => /^(POST|PATCH) business_profile/.test(l.key)).length === 0);
  const lbl = await page.evaluate(() => document.querySelector('label[for="business-address"]') && document.getElementById("business-address")?.tagName);
  check("settings: address label still names the textarea", lbl === "TEXTAREA", String(lbl));

  await page.goto(BASE + "/clients/new", { waitUntil: "networkidle0" });
  await page.waitForSelector(FIND);
  // Enter (the iPhone's Search key) in the finder never submits the form.
  const nameEl = await page.$('input[placeholder*="name" i]');
  await nameEl.type("Enter Test Ltd");
  const fEnter = await page.$(FIND);
  await fEnter.type("LS1 2AB", { delay: 15 });
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 1, { timeout: 8000 });
  await page.keyboard.press("Enter");
  await sleep(800);
  check("Enter in the finder doesn't save the client", !db.tables.clients.some((c) => c.name === "Enter Test Ltd") && page.url().endsWith("/clients/new"), page.url());
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await sleep(400);
  check("ArrowDown + Enter picks the first address", (await areaValue()) === "12 High Street\nLeeds\nLS1 2AB", JSON.stringify(await areaValue()));
  await page.evaluate(() => { const i = document.querySelector('input[placeholder*="name" i]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => { const t = document.querySelector('textarea[placeholder^="Billing address"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, ""); t.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => { const t = document.querySelector('textarea[placeholder^="Billing address"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "Unit 9"); t.dispatchEvent(new Event("input", { bubbles: true })); });
  await findAndPick("Not listed");
  check("new client: postcode-only pick goes under the typed first line", (await areaValue()) === "Unit 9\nLeeds\nLS1 2AB", JSON.stringify(await areaValue()));
  await findAndPick("12 High Street");
  check("new client: full pick replaces it", (await areaValue()) === "12 High Street\nLeeds\nLS1 2AB", await areaValue());
  const name = await page.$('input[placeholder*="name" i]');
  await name.type("Finder Test Ltd");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^(Save|Add) (client|customer|supplier)|^Save$/i.test(b.textContent.trim()))?.click());
  await sleep(1200);
  const saved = db.tables.clients.find((c) => c.name === "Finder Test Ltd");
  check("new client saved with the picked address", saved?.address === "12 High Street\nLeeds\nLS1 2AB", JSON.stringify(saved ?? db.log.slice(-5)));

  await page.goto(BASE + "/clients", { waitUntil: "networkidle0" });
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim() === "Edit")?.click());
  await sleep(500);
  const has = await page.$(FIND);
  check("client edit: finder shown", !!has);
  if (has) { await findAndPick("12 High Street"); check("client edit: finder fills the address", (await areaValue()) === "12 High Street\nLeeds\nLS1 2AB", await areaValue()); }
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("page fits 375px", fits);
  await shot(page, "address-client-edit");
} catch (e) { console.log("ERROR", e.message); await shot(page, "address-signed-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
