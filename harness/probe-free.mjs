import { makeDb, launchSignedIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-probefree" });
try {
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await sleep(1500);
  console.log("TEXT:", (await bodyText(page)).replace(/\s+/g, " ").slice(0, 600));
  const fields = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].slice(0, 14).map((i) => ({
      tag: i.tagName, type: i.type, ph: i.placeholder ?? "", id: i.id ?? "",
      label: i.labels?.[0]?.textContent?.trim().slice(0, 30) ?? "",
      prev: i.previousElementSibling?.textContent?.trim().slice(0, 30) ?? "",
    }))
  );
  for (const f of fields) console.log("FIELD", JSON.stringify(f));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
