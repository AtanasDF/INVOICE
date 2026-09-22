import { launch, sleep, url, shot, clickText, scene, zoom } from "./camera.mjs";

const { browser, page } = await launch();
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
try {
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("scanner-auto", "off"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Take a photo of an old invoice");
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 0, { timeout: 15000 });
  await page.waitForFunction(() => document.body.innerText.includes("Auto-zoom: on"), { timeout: 15000 });
  await sleep(4000); // OpenCV load

  // 1. Small page, centred: expect zoom in.
  await scene(page, { show: true, x: 245, y: 470, w: 230, h: 325 });
  await sleep(3500);
  const z1 = await zoom(page);
  await shot(page, "az-1-small-centred");
  check("small centred page zooms in", /scale\((1\.[2-9]|2)/.test(z1), z1);

  // 2. Page stays fully inside the view after zooming: quad still detected.
  const hint = await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2"))?.textContent);
  check("page still found after zoom", !/Fit the page/.test(hint ?? ""), hint);

  // 3. Page removed: zooms back out after ~1.5s.
  await scene(page, { show: false });
  await sleep(3000);
  const z3 = await zoom(page);
  check("lost page zooms back out", z3 === "none" || z3 === "scale(1)", z3);

  // 4. Large page: no zoom.
  await scene(page, { show: true, x: 110, y: 250, w: 500, h: 707 });
  await sleep(3000);
  const z4 = await zoom(page);
  await shot(page, "az-4-large");
  check("large page does not zoom", z4 === "none" || z4 === "scale(1)", z4);

  // 5. Small page off to the side: zoom limited so it stays inside.
  await scene(page, { show: false });
  await sleep(2500);
  await scene(page, { show: true, x: 60, y: 300, w: 230, h: 325 });
  await sleep(3500);
  const z5 = await zoom(page);
  const hint5 = await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.className.includes("line-clamp-2"))?.textContent);
  await shot(page, "az-5-offcentre");
  check("off-centre page keeps its corners in view", !/Fit the page/.test(hint5 ?? ""), `${z5} / ${hint5}`);

  // 6. Stability: no hunting over 4s with a steady page.
  const samples = [];
  for (let i = 0; i < 8; i++) { await sleep(500); samples.push(await zoom(page)); }
  check("no zoom hunting on a steady page", new Set(samples).size <= 1, samples.join(" "));

  // 7. Switch off: zooms back to 1 and stays there with a small page.
  await clickText(page, "Auto-zoom: on");
  await sleep(500);
  await scene(page, { show: true, x: 245, y: 470, w: 230, h: 325 });
  await sleep(3000);
  const z7 = await zoom(page);
  const stored = await page.evaluate(() => localStorage.getItem("scanner-auto-zoom"));
  check("off switch stops auto-zoom and is remembered", (z7 === "none" || z7 === "scale(1)") && stored === "off", `${z7} stored=${stored}`);

  // 8. Manual 2x overrides auto (after turning auto back on).
  await clickText(page, "Auto-zoom: off");
  await clickText(page, "2×");
  await scene(page, { show: true, x: 110, y: 250, w: 500, h: 707 });
  await sleep(2500);
  const z8 = await zoom(page);
  check("manual 2× is kept", z8 === "scale(2)", z8);
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "az-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, total: results.length }));
}
