import { launch, openScanner, sleep, hint } from "./camera3.mjs";
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const { browser, page } = await launch("far-receipt.mjpeg");
try {
  // An iPhone-like lens zoom: 0.5 (ultra-wide) to 10, starting at 1.
  await page.evaluateOnNewDocument(() => {
    window.__zooms = [];
    const P = MediaStreamTrack.prototype;
    const caps = P.getCapabilities, settings = P.getSettings, apply = P.applyConstraints;
    let z = 1;
    P.getCapabilities = function () { return { ...caps.call(this), zoom: { min: 0.5, max: 10, step: 0.01 } }; };
    P.getSettings = function () { return { ...settings.call(this), zoom: z }; };
    P.applyConstraints = function (c) { const v = c?.advanced?.[0]?.zoom; if (v !== undefined) { z = v; window.__zooms.push(v); return Promise.resolve(); } return apply.call(this, c).catch(() => {}); };
  });
  await openScanner(page);
  const hints = []; const t0 = Date.now();
  while (Date.now() - t0 < 9000) { hints.push(await hint(page)); await sleep(200); }
  const zooms = await page.evaluate(() => window.__zooms);
  check("lens zoom steps up by itself", zooms.length >= 2 && zooms[zooms.length - 1] > 2, zooms.map((v) => v.toFixed(2)).join(","));
  check("lens zoom stops at 4x", Math.max(...zooms) <= 4.0001, String(Math.max(...zooms)));
  check("only at the limit does it ask to move closer", hints.findIndex((h) => /Move closer/.test(h ?? "")) === -1 || zooms[zooms.length - 1] >= 3.99, [...new Set(hints)].join(" | "));
  const slider = await page.evaluate(() => document.querySelector('input[type="range"][aria-label="Zoom"]')?.value);
  check("zoom slider follows", Number(slider) > 2, slider);
} catch (e) { console.log("ERROR", e.message); } finally { await browser.close(); }
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
