import { launch, sleep, clickText, url } from "./sa-camera2.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
async function open(delayMs) {
  const { browser, page } = await launch("large.mjpeg");
  if (delayMs) {
    await page.evaluateOnNewDocument((ms) => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => new Promise((r) => setTimeout(r, ms)).then(() => real(c));
    }, delayMs);
  }
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); for (const t of ["scanner-auto", "free-invoice-scan", "scanner-auto-zoom"]) localStorage.setItem("tip:" + t, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Scan an existing invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
  await sleep(600);
  const text = await page.evaluate(() => document.body.innerText);
  await browser.close();
  return text;
}
const asked = await open(1500);
check("Safari had to ask: tip explains how to allow it for good", asked.includes("Asked for the camera every time?") && asked.includes("Camera → Allow"), asked.slice(-400));
const remembered = await open(0);
check("already allowed: no tip", !remembered.includes("Asked for the camera every time?"));
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
