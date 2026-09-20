import { launch, openScanner, sleep } from "./camera3.mjs";
const { browser, page } = await launch("dark-room.mjpeg");
page.on("console", (m) => console.log("C", m.text().slice(0, 200)));
await openScanner(page, { auto: "off" });
await sleep(2500);
const info = await page.evaluate(() => {
  const v = document.querySelector("video"); const c = document.createElement("canvas"); c.width = 160; c.height = 90; const x = c.getContext("2d"); x.drawImage(v, 0, 0, 160, 90); const d = x.getImageData(0, 0, 160, 90).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  return { mean: s / (d.length / 4), vw: v.videoWidth, text: document.body.innerText.slice(0, 300) };
});
console.log(JSON.stringify(info));
const strip = await page.$$("div.h-10");
for (const s of strip) { try { await s.click(); } catch {} }
await sleep(1200);
console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)));
await browser.close();
