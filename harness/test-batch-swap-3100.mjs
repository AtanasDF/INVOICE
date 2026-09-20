import { makeDb } from "./mockdb.mjs";
import { launchCameraSignedIn } from "./camera-signed.mjs";
const BASE = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
for (const still of ["none", "hang"]) {
  const db = makeDb();
  db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
  const { browser, page } = await launchCameraSignedIn(db, "batch-swap.mjpeg", BASE);
  try {
    if (still === "hang") await page.evaluateOnNewDocument(() => { window.ImageCapture = class { constructor() {} async getPhotoCapabilities() { return { imageWidth: { min: 100, max: 4000 }, imageHeight: { min: 100, max: 3000 } }; } takePhoto() { return new Promise(() => {}); } }; });
    await page.evaluate(() => { localStorage.setItem("scanner-auto", "on"); for (const t of ["scanner-auto", "scanner-stack", "camera-allow", "dashboard-welcome", "scan-batch"]) localStorage.setItem("tip:" + t, "3"); });
    await page.goto(BASE + "/scan", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 10000) { n = await page.evaluate(() => Number(document.querySelector('[aria-label^="Review "]')?.getAttribute("aria-label")?.match(/\d+/)?.[0] ?? 0)); if (n >= 2) break; await sleep(300); }
    check(`batch (${still === "hang" ? "slow still: pages swapped while it saved" : "video frames"}): both pages captured`, n >= 2, `stack ${n} after ${Date.now() - t0}ms`);
  } catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); }
}
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
