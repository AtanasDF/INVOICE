// test-far.mjs with the hint pill empty while no page is found (it used to say 'Fit the page...').
import { launch, openScanner, sleep, zoom, hint, shot, measure } from "./camera3.mjs";
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const scale = (z) => Number(/scale\(([\d.]+)\)/.exec(z)?.[1] ?? 1);
async function run(clip, opts, fn) {
  const { browser, page, posted } = await launch(clip, opts);
  try { await fn(page, posted); } catch (e) { console.log("ERROR", clip, e.message); await shot(page, "err-far-" + clip); } finally { await browser.close(); }
}
async function watch(page, ms) {
  const hints = [], zooms = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) { hints.push(await hint(page)); zooms.push(scale(await zoom(page))); await sleep(150); }
  return { hints, zooms };
}
const only = process.argv[2];
const want = (n) => !only || n.includes(only);

if (want("far")) await run("far-receipt.mjpeg", {}, async (page) => {
  await openScanner(page);
  const { hints, zooms } = await watch(page, 7000);
  await shot(page, "far-zoomed");
  const max = Math.max(...zooms);
  check("far receipt is found", hints.some((h) => h && !/Fit the page/.test(h)), [...new Set(hints)].join(" | "));
  check("far receipt zooms in past 2x by itself", max > 2, `max ${max}`);
  check("never asks to move closer while it can zoom", !hints.some((h) => /Move closer/.test(h ?? "")), [...new Set(hints)].join(" | "));
  check("says it is zooming", hints.some((h) => /zooming in/.test(h ?? "")), "");
  check("ends ready to capture", /Ready|Hold still/.test(hints[hints.length - 1] ?? ""), hints[hints.length - 1]);
});
if (want("far")) await run("far-receipt.mjpeg", {}, async (page, posted) => {
  await openScanner(page, { auto: "on" });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !posted.length) await sleep(250);
  check("far receipt is captured automatically", posted.length === 1, `${Date.now() - t0}ms`);
  if (posted[0]) { const m = await measure(page, posted[0][0]); console.log("   video-frame capture", JSON.stringify(m)); check("capture is the receipt, upright and cropped", m.h > m.w * 2 && m.topLeft > 0.02, JSON.stringify(m)); }
});
if (want("curl")) await run("far-receipt-curl.mjpeg", {}, async (page, posted) => {
  await openScanner(page, { auto: "on" });
  const { hints, zooms } = await watch(page, 9000);
  check("torn receipt is found and zoomed", Math.max(...zooms) > 1.5, `max ${Math.max(...zooms)} ${[...new Set(hints)].join(" | ")}`);
  check("torn receipt is captured", posted.length >= 1, "");
});
if (want("jitter")) await run("far-jitter.mjpeg", {}, async (page) => {
  await openScanner(page);
  const { zooms } = await watch(page, 7000);
  check("shaky hand: still zooms in", Math.max(...zooms) > 1.5, `max ${Math.max(...zooms)}`);
});
if (want("offcentre")) await run("far-offcentre.mjpeg", {}, async (page) => {
  await openScanner(page);
  const { hints, zooms } = await watch(page, 6000);
  check("off-centre far receipt: asks to move it to the middle", hints.some((h) => /middle/.test(h ?? "")), [...new Set(hints)].join(" | "));
  check("off-centre far receipt: no 'move closer'", !hints.some((h) => /Move closer/.test(h ?? "")), "");
  console.log("   zooms", [...new Set(zooms)].join(","));
});
if (want("dark")) await run("dark-thing.mjpeg", {}, async (page) => {
  await openScanner(page);
  const { hints, zooms } = await watch(page, 6000);
  // The only hint a dark view may give now is the torch's own one (a
  // camera with no torch says "It's dark here"); never a page hint.
  check("dark phone-like object: not taken for a page", hints.every((h) => !h || /dark here/.test(h)) && Math.max(...zooms) === 1, `${[...new Set(hints)].join(" | ")} max ${Math.max(...zooms)}`);
});
if (want("bill")) await run("bill-box.mjpeg", {}, async (page) => {
  await openScanner(page);
  const { hints, zooms } = await watch(page, 6000);
  check("white box on a coloured bill: not taken for a receipt", Math.max(...zooms) === 1 && hints.every((h) => !h), `${[...new Set(hints)].join(" | ")} max ${Math.max(...zooms)}`);
});
if (want("45")) await run("far-45.mjpeg", {}, async (page, posted) => {
  await openScanner(page, { auto: "on" });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !posted.length) await sleep(250);
  check("receipt lying at 45°: found and captured", posted.length === 1, "");
  if (posted[0]) { const m = await measure(page, posted[0][0]); check("…as the whole receipt (either way round), not a sliver", Math.max(m.w, m.h) > 2.5 * Math.min(m.w, m.h) && Math.min(m.w, m.h) > 50, JSON.stringify(m)); }
});
if (want("straighten")) await run("straighten.mjpeg", {}, async (page, posted) => {
  await openScanner(page, { auto: "on" });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !posted.length) await sleep(250);
  check("page turned upright while tracked: captured", posted.length === 1, "");
  if (posted[0]) { const m = await measure(page, posted[0][0]); check("…upright, not sideways", m.h > m.w && m.topLeft > m.topRight, JSON.stringify(m)); }
});
if (want("still")) for (const mode of ["upright", "sideways", "nudged", "noise", "hang", "moved", "blurred"]) await run("large.mjpeg", { still: mode }, async (page, posted) => {
  await openScanner(page, { auto: "on" });
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !posted.length) await sleep(250);
  const n = await page.evaluate(() => window.__stills);
  const settings = await page.evaluate(() => window.__stillSettings);
  check(`still (${mode}): captured`, posted.length === 1, `${Date.now() - t0}ms stills:${n}`);
  if (!posted[0]) return;
  const m = await measure(page, posted[0][0]);
  console.log(`   ${mode}`, JSON.stringify(m), JSON.stringify(settings));
  if (mode === "upright" || mode === "sideways" || mode === "nudged") {
    check(`still (${mode}): used the full-resolution still`, m.h > 1000, `${m.w}x${m.h}`);
    check(`still (${mode}): upright (title top-left)`, m.h > m.w && m.topLeft > m.topRight * 2 && m.topLeft > 0.01, JSON.stringify(m));
  } else {
    check(`still (${mode}): fell back to the video frame`, m.h < 1000 && m.h > m.w, `${m.w}x${m.h}`);
  }
});
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
