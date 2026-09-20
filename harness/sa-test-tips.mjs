import { launch, sleep, url, shot, clickText } from "./sa-camera2.mjs";
const results = []; const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, d ?? ""); };
const { browser, page } = await launch("large.mjpeg");
const tipText = () => page.evaluate(() => [...document.querySelectorAll('[role="note"]')].map((n) => n.textContent.replace("Got it", "").trim()));
try {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  for (let visit = 1; visit <= 4; visit++) {
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);
    const t = await tipText();
    check(`free page tip on visit ${visit}`, visit <= 3 ? t.length === 1 : t.length === 0, JSON.stringify(t).slice(0, 90));
  }
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Got it");
  await sleep(300);
  check("Got it hides it", (await tipText()).length === 0);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(500);
  check("dismissed stays dismissed", (await tipText()).length === 0);
  await shot(page, "tips-free");
  await page.evaluate(() => localStorage.setItem("scanner-auto", "off"));
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Scan an existing invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 15000 });
  await sleep(1500);
  const cam = await tipText();
  await shot(page, "tips-camera");
  check("camera tip shows (manual mode wording)", cam.length === 1 && /tap the button/.test(cam[0]), cam[0]);
} catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
