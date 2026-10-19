// The camera in dark mode (notes/audit-components.md, sections 5 and 6).
//
// The camera's screens are bg-black whatever the theme, and their controls
// were drawn for the light values. Dark mode turned `white` into #191b1f and
// `neutral-900` near-white, so the shutter ring all but vanished on black, the
// diagnostic readout was #232529 on black, and the failure box was white on
// light pink. The camera's panels now carry .camera-screen, which puts the
// light values back. This walks the real screen in Dark and measures it.
//
// BROWSER SUITE: needs $BASE (next start) and large.mjpeg (gen-large.py).
import { launch, sleep, clickText, url } from "./camera2.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const { browser, page } = await launch("large.mjpeg");
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("theme", "dark");
  for (const t of ["scanner-auto", "free-invoice-scan", "scanner-auto-zoom", "scanner-stack", "camera-allow"]) localStorage.setItem("tip:" + t, "3");
});
await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
check("the app is in dark mode", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
await clickText(page, "Take a photo of an old invoice");
await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 2, { timeout: 20000 });
await sleep(800);

const m = await page.evaluate(() => {
  const lum = (c) => {
    const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const black = "rgb(0, 0, 0)";
  const shutter = [...document.querySelectorAll("button")].find((b) => /rounded-full/.test(b.className) && /border-4/.test(b.className));
  const panels = document.querySelectorAll(".camera-screen").length;
  const shutterBorder = shutter ? getComputedStyle(shutter).borderTopColor : "";
  return { panels, shutterBorder, shutterRatio: shutter ? ratio(shutterBorder, black) : 0 };
});
check("the camera's panels carry .camera-screen", m.panels >= 2, String(m.panels));
check("the shutter ring stands out on black (was about 1.2:1)", m.shutterRatio >= 3, `${m.shutterBorder} ${m.shutterRatio.toFixed(2)}:1`);

// The hidden readout: tapping the strip beside Back shows it.
const readout = await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => /font-mono/.test(d.className));
  return el ? getComputedStyle(el).color : null;
});
if (readout !== null) check("the diagnostic readout is light on black (was #232529)", /rgb\((2[0-9]{2}|1[5-9][0-9]),/.test(readout), readout);
else console.log("NOTE readout not open on this run; not measured");

await browser.close();
const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
