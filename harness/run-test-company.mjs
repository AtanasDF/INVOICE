import { makeDb, launchSignedIn, signIn, sleep, shot, newId } from "./mockdb.mjs";
const BASE = "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const MATCHES = [
  { name: "Acme Plumbing & Heating Ltd", number: "01234567", address: "12 High Street\nLeeds\nLS1 2AB", status: "active", incorporated: "2015-03-02" },
  { name: "Acme Roofing Ltd", number: "07654321", address: "Unit 4, Trade Park\nYork\nYO1 1AA", status: "active", incorporated: null },
];
const db = makeDb();
db.tables.business_profile.push({ business_name: "Old Name", address: "Old address", vat_registered: false });
let configured = true;
const searches = [];
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  intercept: (req, u) => {
    if (u.pathname !== "/api/company-search") return false;
    const q = u.searchParams.get("q") ?? "";
    if (q) searches.push(q);
    const items = configured && q.length >= 3 ? MATCHES.filter((m) => m.name.toLowerCase().startsWith(q.toLowerCase().slice(0, 3))) : [];
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ configured, items }) });
    return true;
  },
});

const typeInto = async (selector, text) => {
  await page.focus(selector);
  await page.evaluate((s) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); }, selector);
  await page.keyboard.type(text, { delay: 40 });
};
const listShown = () => page.evaluate(() => document.querySelectorAll('[role="option"]').length);

try {
  await signIn(page, BASE);
  // Free page, lookup on
  await page.goto(BASE + "/free-invoice", { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.removeItem("free-invoice-draft"); for (const id of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + id, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start blank")?.click());
  await sleep(500);
  const nameSel = 'input[role="combobox"]';
  const combos = await page.$$(nameSel);
  check("Free page has lookup on business and customer name", combos.length === 2, combos.length);
  const hint = await page.evaluate(() => document.body.innerText.includes("A limited company? Type its name"));
  check("hint mentions lookup when it's on", hint);
  await page.evaluate(() => document.querySelectorAll('input[role="combobox"]')[0].setAttribute("data-t", "issuer"));
  await page.evaluate(() => document.querySelectorAll('input[role="combobox"]')[1].setAttribute("data-t", "customer"));
  await typeInto('[data-t="issuer"]', "ac");
  await sleep(700);
  check("no search under 3 letters", searches.length === 0, searches);
  await page.keyboard.type("me", { delay: 40 });
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 2, { timeout: 5000 });
  check("typing shows matches, one search after the pause", searches.length === 1 && searches[0] === "acme", searches);
  const optText = await page.evaluate(() => document.querySelector('[role="option"]').innerText);
  check("option shows name, number, address", /Acme Plumbing & Heating Ltd/.test(optText) && /Company 01234567/.test(optText) && /12 High Street, Leeds, LS1 2AB/.test(optText), optText);
  await shot(page, "company-dropdown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await sleep(300);
  const issuer = await page.evaluate(() => {
    const byLabel = (t) => [...document.querySelectorAll("p,label,span")].find((x) => x.textContent.trim() === t)?.closest("div")?.querySelector("input,textarea");
    return { name: document.querySelector('[data-t="issuer"]').value, address: byLabel("Address")?.value, company: byLabel("Company number")?.value };
  });
  check("picking fills name, address and company number", issuer.name === "Acme Plumbing & Heating Ltd" && issuer.address === "12 High Street\nLeeds\nLS1 2AB" && issuer.company === "01234567", JSON.stringify(issuer));
  check("list closes after picking", (await listShown()) === 0);
  const preview = await page.evaluate(() => document.body.innerText.includes("Acme Plumbing & Heating Ltd"));
  check("invoice shows the picked name", preview);

  await typeInto('[data-t="customer"]', "Acme R");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 5000 });
  await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].find((o) => o.innerText.includes("Roofing")).click());
  await sleep(300);
  const cust = await page.evaluate(() => {
    const card = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Bill to");
    return { name: card.querySelector("input").value, address: card.querySelector("textarea").value };
  });
  check("customer pick fills name and address", cust.name === "Acme Roofing Ltd" && cust.address.startsWith("Unit 4, Trade Park"), JSON.stringify(cust));

  await typeInto('[data-t="customer"]', "Acme");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await sleep(100);
  check("Escape closes the list", (await listShown()) === 0);
  await typeInto('[data-t="customer"]', "Acme");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 5000 });
  const inLabel = await page.evaluate(() => !!document.querySelector('[role="listbox"]').closest("label"));
  check("list is not inside a label", !inLabel);
  const box = await page.evaluate(() => { const r = document.querySelector('[role="listbox"]').parentElement.lastElementChild.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  check("pressing inside the list (not on an option) keeps it open", (await listShown()) > 0);
  await page.keyboard.press("Escape");
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("page fits 375px", fits);

  // New client (signed in)
  await page.goto(BASE + "/clients/new", { waitUntil: "networkidle0" });
  await page.waitForSelector(nameSel);
  const ph = await page.$eval(nameSel, (e) => e.placeholder);
  check("client form placeholder mentions Companies House", /Companies House/.test(ph), ph);
  await typeInto(nameSel, "acme p");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 5000 });
  await page.evaluate(() => document.querySelector('[role="option"]').click());
  await sleep(300);
  const client = await page.evaluate(() => ({ name: document.querySelector('input[role="combobox"]').value, address: document.querySelector('textarea[placeholder^="Billing address"]').value }));
  check("new client pick fills name and address", client.name === "Acme Plumbing & Heating Ltd" && client.address === "12 High Street\nLeeds\nLS1 2AB", JSON.stringify(client));
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === "Individual").querySelector("input").click());
  await sleep(200);
  check("individual: plain name field", (await page.$$(nameSel)).length === 0);

  // Settings
  await page.goto(BASE + "/settings", { waitUntil: "networkidle0" });
  await page.waitForSelector(nameSel);
  await typeInto(nameSel, "acme");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 5000 });
  await page.evaluate(() => document.querySelector('[role="option"]').click());
  await sleep(300);
  const settings = await page.evaluate(() => ({ name: document.querySelector('input[role="combobox"]').value, address: [...document.querySelectorAll("textarea")][0].value, offer: document.body.innerText.includes("Registered office: 12 High Street, Leeds, LS1 2AB") }));
  check("settings: name filled, existing address kept, registered office offered", settings.name === "Acme Plumbing & Heating Ltd" && settings.address === "Old address" && settings.offer, JSON.stringify(settings));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Use this address").click());
  await sleep(200);
  const used = await page.evaluate(() => [...document.querySelectorAll("textarea")][0].value);
  check("Use this address fills it", used === "12 High Street\nLeeds\nLS1 2AB", used);
  check("settings: nothing saved by picking", db.log.filter((l) => l.key.startsWith("POST business_profile") || l.key.startsWith("PATCH business_profile")).length === 0);

  // Lookup off
  configured = false;
  const before = searches.length;
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 375, height: 900 });
  await p2.setRequestInterception(true);
  p2.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname === "/api/company-search") { if (u.searchParams.get("q")) searches.push(u.searchParams.get("q")); return req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ configured: false, items: [] }) }); }
    if (u.origin !== BASE) return req.abort();
    req.continue();
  });
  await p2.goto(BASE + "/free-invoice", { waitUntil: "networkidle0" });
  await p2.evaluate(() => localStorage.removeItem("free-invoice-draft"));
  await p2.reload({ waitUntil: "networkidle0" });
  await p2.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start blank")?.click());
  await sleep(500);
  check("lookup off: plain inputs, no combobox role", (await p2.$$('input[role="combobox"]')).length === 0);
  await p2.evaluate(() => [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent === "Your business").querySelector("input").setAttribute("data-t", "biz"));
  await p2.focus('[data-t="biz"]');
  await p2.keyboard.type("acme plumbing", { delay: 30 });
  await sleep(800);
  check("lookup off: no searches, no list, plain hint", searches.length === before && (await p2.evaluate(() => document.querySelectorAll('[role="option"]').length)) === 0 && !(await p2.evaluate(() => document.body.innerText.includes("A limited company? Type its name"))), searches.slice(before));
  const typed = await p2.$eval('[data-t="biz"]', (e) => e.value);
  check("lookup off: typing still works", typed === "acme plumbing", typed);
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "company-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
