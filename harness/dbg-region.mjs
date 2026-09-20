import { launch, openScanner } from "./camera3.mjs";
const { browser, page } = await launch("bent-dogear.mjpeg");
await openScanner(page, { auto: "off", zoomOn: "off" });
console.log(await page.evaluate(() => { const v = document.querySelector("video"); return { cw: v.clientWidth, ch: v.clientHeight, vw: v.videoWidth, vh: v.videoHeight }; }));
await browser.close();
