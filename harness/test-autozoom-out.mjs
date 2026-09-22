// Two things Atanas asked for after his first real scan (2026-09-22):
//
// - "Give it another half a second": the shot came before the phone had
//   focused. A page that appears fully formed must still not be taken for
//   at least a second.
// - "If the zoom is maxed and the phone is far, unzoom a little": zoomed in
//   on a small page, then the page fills the view (he moved closer, or the
//   zoom overshot), the scanner used to sit there with a page too big to
//   read. It must zoom back out until the page fits, and find it again.
import { launch, sleep, url, clickText, scene, zoom } from "./camera.mjs";

const { browser, page } = await launch();
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", name, ok ? "" : (detail ?? "")); };
const scale = (z) => (z === "none" ? 1 : Number(/scale\(([\d.]+)/.exec(z)?.[1] ?? 1));
const hint = () => page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2"))?.textContent ?? "");
// The reader is never reached: the post is what marks the capture.
const posted = [];
await page.setRequestInterception(true);
page.on("request", (r) => { if (r.url().includes("/api/invoice-template")) { posted.push(Date.now()); return; } r.continue(); });

async function open(auto) {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem("scanner-auto", a); localStorage.setItem("scanner-auto-zoom", "on"); for (const t of ["scanner-auto", "free-invoice-scan", "scanner-auto-zoom", "scanner-stack", "camera-allow"]) localStorage.setItem("tip:" + t, "3"); }, auto);
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Take a photo of an old invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 0, { timeout: 15000 });
  await page.waitForFunction(() => document.body.innerText.includes("Auto-zoom: on"), { timeout: 15000 });
  await sleep(4000); // OpenCV
}

try {
  await open("off");
  // Small, centred: zooms in, as before.
  await scene(page, { show: true, x: 245, y: 470, w: 230, h: 325 });
  await sleep(3500);
  const zIn = await zoom(page);
  check("a small centred page zooms in", scale(zIn) >= 1.2, zIn);

  // Now the page fills the frame while still zoomed in: the phone came
  // closer. Before: stuck zoomed, page too big to find. After: zooms out.
  await scene(page, { show: true, x: 110, y: 250, w: 500, h: 707 });
  await sleep(4500);
  const zOut = await zoom(page);
  const h = await hint();
  check("...and zooms back out once the page fills the view", scale(zOut) < scale(zIn), `${zIn} -> ${zOut}`);
  check("...to where the page is found again, not lost", scale(zOut) <= 1.05 && !/Fit the page|Move closer/.test(h), `${zOut} / ${h}`);

  // The shot waits for the lens: a page that appears fully sharp is still
  // not taken for at least a second.
  await open("on");
  const t0 = Date.now();
  await scene(page, { show: true, x: 110, y: 250, w: 500, h: 707 });
  while (Date.now() - t0 < 8000 && !posted.length) await sleep(50);
  const first = posted.length ? posted[0] - t0 : null;
  check("auto-capture fires on a steady page", first !== null, "no capture in 8s");
  check("...but not before a second has passed", first !== null && first >= 1000, `${first}ms`);
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
