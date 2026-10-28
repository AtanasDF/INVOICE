// The iPhone's full-resolution still stops the camera's own video while it
// is taken. The interruption check took that for a lost camera, reopened it
// mid-shot, and every photo was thrown away with "The camera restarted
// before that photo was taken" (Atanas's screen recording, 2026-10-28).
// Here ImageCapture.takePhoto ends the track exactly that way: both pages of
// a batch must still be taken, the message never shown, and the camera must
// stop asking for a still that breaks it.
import { makeDb } from "./mockdb.mjs";
import { launchCameraSignedIn } from "./camera-signed.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
const { browser, page } = await launchCameraSignedIn(db, "batch-swap.mjpeg", BASE);
try {
  await page.evaluateOnNewDocument(() => {
    window.__stills = 0;
    window.ImageCapture = class {
      constructor(track) { this.track = track; }
      async getPhotoCapabilities() { return { imageWidth: { min: 100, max: 4000 }, imageHeight: { min: 100, max: 3000 } }; }
      async takePhoto() {
        window.__stills++;
        const c = document.createElement("canvas"); c.width = 3000; c.height = 4000;
        c.getContext("2d").fillRect(0, 0, 10, 10);
        const blob = await new Promise((r) => c.toBlob(r, "image/jpeg"));
        this.track.stop();
        this.track.dispatchEvent(new Event("ended"));
        await new Promise((r) => setTimeout(r, 300));
        return blob;
      }
    };
  });
  await page.evaluate(() => { localStorage.removeItem("camera-still-breaks"); localStorage.setItem("scanner-auto", "on"); for (const t of ["scanner-auto", "scanner-stack", "camera-allow", "dashboard-welcome", "scan-batch"]) localStorage.setItem("tip:" + t, "3"); });
  await page.goto(BASE + "/scan", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
  const t0 = Date.now(); let n = 0; let restarted = false;
  while (Date.now() - t0 < 20000) {
    const s = await page.evaluate(() => ({ n: Number(document.querySelector('[aria-label^="Review "]')?.getAttribute("aria-label")?.match(/\d+/)?.[0] ?? 0), text: document.body.innerText }));
    n = s.n; if (/camera restarted before that photo/i.test(s.text)) restarted = true;
    if (n >= 2) break;
    await sleep(250);
  }
  const after = await page.evaluate(() => ({ stills: window.__stills, remembered: localStorage.getItem("camera-still-breaks") }));
  check("a still that stops the camera does not throw the shot away: both pages taken", n >= 2, `stack ${n} after ${Date.now() - t0}ms`);
  check("...and \"the camera restarted\" is never shown", !restarted);
  check("...and the camera stops asking for a still after the first one broke it", after.stills === 1 && after.remembered === "1", JSON.stringify(after));
} catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); }
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
