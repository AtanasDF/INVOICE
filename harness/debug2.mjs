import { launch, sleep, shot, zoom, openScanner } from "./camera2.mjs";
const { browser, page } = await launch("side.mjpeg");
try {
  await openScanner(page);
  await sleep(3000);
  await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2") && d.className.includes("pointer-events-auto"))?.click());
  for (let i = 0; i < 6; i++) { await sleep(700); console.log(await zoom(page), await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("font-mono"))?.textContent)); }
  await shot(page, "debug-side");
} finally { await browser.close(); }
