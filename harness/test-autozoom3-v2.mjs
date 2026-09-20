// test-autozoom3.mjs with 'found' read as any hint showing (nothing shows while no page is found).
import { launch, sleep, shot, clickText, zoom, hint, openScanner } from "./camera3.mjs";
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const isOne = (z) => z === "none" || z === "scale(1)";
async function run(clip, fn) {
  const { browser, page } = await launch(clip);
  try { await fn(page); } catch (e) { console.log("ERROR", clip, e.message); await shot(page, "err-" + clip); } finally { await browser.close(); }
}
await run("small-then-gone.mjpeg", async (page) => {
  await openScanner(page);
  const t0 = Date.now();
  let zin = null;
  while (Date.now() - t0 < 6500) { const z = await zoom(page); if (!isOne(z)) { zin = z; break; } await sleep(250); }
  await shot(page, "az2-zoomed");
  check("small centred page zooms in", !!zin, `${zin} after ${Date.now() - t0}ms`);
  check("page still found after zoom", !!(await hint(page)), await hint(page));
  const s = []; for (let i = 0; i < 4; i++) { await sleep(300); s.push(await zoom(page)); }
  check("steady while page present", new Set(s).size === 1, s.join(" "));
  const t1 = Date.now(); let zout = null;
  while (Date.now() - t1 < 9000) { const z = await zoom(page); if (isOne(z)) { zout = z; break; } await sleep(250); }
  check("zooms back out once the page is gone", !!zout, `${zout} after ${Date.now() - t1}ms`);
});
await run("large.mjpeg", async (page) => {
  await openScanner(page);
  await sleep(6000);
  const z = await zoom(page);
  check("large page does not zoom", isOne(z), z);
  check("large page found", !!(await hint(page)), await hint(page));
});
await run("side.mjpeg", async (page) => {
  await openScanner(page);
  await sleep(7000);
  await shot(page, "az2-side");
  const z = await zoom(page);
  check("off-centre page zooms only as far as keeps it in view", !!(await hint(page)) && !isOne(z) && z !== "scale(2)", `${z} / ${await hint(page)}`);
});
await run("small.mjpeg", async (page) => {
  await openScanner(page);
  await clickText(page, "Auto-zoom: on");
  await sleep(6000);
  check("switched off: no zoom", isOne(await zoom(page)), await zoom(page));
  await clickText(page, "2×");
  await sleep(3000);
  check("manual 2× kept", (await zoom(page)) === "scale(2)", await zoom(page));
});
await run("small.mjpeg", async (page) => {
  await openScanner(page, { auto: "on" });
  let captured = false; const t0 = Date.now();
  while (Date.now() - t0 < 12000) { const txt = await page.evaluate(() => document.body.innerText); if (/Reading your invoice|Your invoice pages/i.test(txt)) { captured = true; break; } await sleep(300); }
  check("auto-capture still fires with auto-zoom", captured, `${Date.now() - t0}ms`);
});
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
