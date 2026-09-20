import { makeDb, launchSignedIn, signIn, sleep } from "./mockdb.mjs";
const BASE = "http://localhost:3200";
const db = makeDb();
const { browser, page } = await launchSignedIn(db, { base: BASE, intercept: (req, u) => { if (u.pathname !== "/api/company-search") return false; req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ configured: true, items: [] }) }); return true; } });
await signIn(page, BASE);
await page.goto(BASE + "/clients/new", { waitUntil: "networkidle0" });
for (let i = 0; i < 8; i++) {
  const s = await page.evaluate(() => ({ combo: document.querySelectorAll('input[role="combobox"]').length, inputs: [...document.querySelectorAll("main input")].map((i) => i.placeholder || i.type).slice(0, 4), text: document.querySelector("main")?.innerText.slice(0, 80) }));
  console.log(i, JSON.stringify(s));
  await sleep(500);
}
await browser.close();
