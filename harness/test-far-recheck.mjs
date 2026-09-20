import { makeDb } from "./mockdb.mjs";
import { launchCameraSignedIn } from "./camera-signed.mjs";
import { launch, openScanner, sleep, hint, clickText } from "./camera3.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const only = process.argv[2];
if (!only || only === "switch") {
  const { browser, page, posted } = await launch("large.mjpeg", { still: "hang" });
  try {
    await openScanner(page, { auto: "on" });
    await page.waitForFunction(() => /taking the photo/.test([...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2"))?.textContent ?? ""), { timeout: 15000 });
    await clickText(page, "Use the native camera instead");
    await sleep(500);
    await clickText(page, "Use the in-app scanner instead");
    await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 15000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 12000 && !posted.length) await sleep(250);
    check("switching camera mode mid-photo: the scanner isn't stuck, it captures again", posted.length === 1, `posted ${posted.length}`);
  } catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); }
}
if (!only || only === "borderline") {
  const db = makeDb();
  db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
  const { browser, page } = await launchCameraSignedIn(db, process.env.CLIP ?? "batch-borderline.mjpeg", BASE);
  try {
    await page.evaluate(() => { localStorage.setItem("scanner-auto", "on"); localStorage.setItem("scanner-auto-zoom", "off"); for (const t of ["scanner-auto", "scanner-stack", "camera-allow", "dashboard-welcome", "scan-batch"]) localStorage.setItem("tip:" + t, "3"); });
    await page.goto(BASE + "/scan", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
    const t0 = Date.now(); let n = 0, first = 0;
    while (Date.now() - t0 < 9000) { n = await page.evaluate(() => Number(document.querySelector('[aria-label^="Review "]')?.getAttribute("aria-label")?.match(/\d+/)?.[0] ?? 0)); if (n && !first) first = Date.now() - t0; await sleep(300); }
    check("batch: a page held at the size limit is taken once, not again and again", n === 1, `stack ${n} (first after ${first}ms)`);
  } catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); }
}
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
