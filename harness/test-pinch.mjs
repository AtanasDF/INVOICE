import { launch, sleep, zoom, clickText, url } from "./camera2.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const { browser, page } = await launch("large.mjpeg");
try {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("scanner-auto", "off"); localStorage.setItem("scanner-auto-zoom", "off"); for (const t of ["scanner-auto", "free-invoice-scan", "scanner-auto-zoom"]) localStorage.setItem("tip:" + t, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Take a photo of an old invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
  await sleep(800);
  const cdp = await page.createCDPSession();
  const pinch = async (from, to) => {
    const cx = 187, cy = 350;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx - from, y: cy, id: 1 }, { x: cx + from, y: cy, id: 2 }] });
    for (let i = 1; i <= 8; i++) {
      const d = from + ((to - from) * i) / 8;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
      await sleep(40);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(400);
  };
  const before = await zoom(page);
  const scale0 = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await pinch(40, 100);
  const after = await zoom(page);
  const scale1 = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  const factor = Number(/scale\(([\d.]+)\)/.exec(after)?.[1] ?? 1);
  check("pinching out zooms the camera (about 2.5×)", factor > 2 && factor <= 3, `${before} -> ${after}`);
  check("the page itself doesn't zoom", scale0 === 1 && scale1 === 1, `${scale0} -> ${scale1}`);
  await pinch(100, 20);
  const back = await zoom(page);
  check("pinching in zooms back out to 1×", back === "none" || back === "scale(1)", back);
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector("video").closest(".fixed")).touchAction);
  check("camera screen claims touch gestures (touch-action: none)", ta === "none", ta);
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
