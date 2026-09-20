import { launch, sleep, url, shot, clickText, scene } from "./camera.mjs";
const { browser, page } = await launch();
try {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("scanner-auto", "off"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Scan an existing invoice");
  await scene(page, { show: true, x: 110, y: 250, w: 500, h: 707 });
  await sleep(8000);
  await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2") && d.className.includes("pointer-events-auto"))?.click());
  await sleep(1500);
  console.log(await page.evaluate(() => ({ dbg: [...document.querySelectorAll("div")].find((d) => d.className.includes("font-mono"))?.textContent, cv: [...document.querySelectorAll("div")].find((d) => d.textContent.startsWith("Edge detection"))?.textContent, vw: document.querySelector("video")?.videoWidth, vh: document.querySelector("video")?.videoHeight, paused: document.querySelector("video")?.paused, t: document.querySelector("video")?.currentTime })));
  await shot(page, "debug");
} finally { await browser.close(); }
